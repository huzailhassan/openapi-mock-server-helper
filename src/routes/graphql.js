import { Router } from 'express';
import crypto from 'crypto';
import { graphql } from 'graphql';
import { prisma } from '../utils/helpers.js';
import { getSchema, markDirty } from '../graphql/engine.js';

const router = Router();

function ok(res, data) { return res.json({ success: true, data }); }
function fail(res, err, code = 400) { return res.status(code).json({ success: false, error: String(err.message || err) }); }

/*
|--------------------------------------------------------------------------
| GRAPHQL ENDPOINT
| POST /graphql
|--------------------------------------------------------------------------
*/
router.post('/graphql', async (req, res) => {
  try {
    const { query, variables, operationName } = req.body;
    if (!query) return res.status(400).json({ errors: [{ message: 'query is required' }] });
    const schema = await getSchema();
    const result = await graphql({ schema, source: query, variableValues: variables, operationName });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ errors: [{ message: err.message }] });
  }
});

/*
|--------------------------------------------------------------------------
| DYNAMIC REST DISPATCHER
| POST /rpc/:schemaName/:operation
|--------------------------------------------------------------------------
*/
router.post('/rpc/:schemaName/:operation', async (req, res) => {
  try {
    const { schemaName, operation } = req.params;
    const row = await prisma.gqlSchema.findUnique({ where: { name: schemaName } });

    if (!row || !row.enabled) {
      return res.status(404).json({ success: false, errorCode: 'not-found', errorMessage: 'schema not found or disabled' });
    }

    let endpoints = {};
    try { endpoints = JSON.parse(row.endpoints || '{}'); } catch {}

    const ep = endpoints[operation];
    if (!ep) {
      return res.status(404).json({ success: false, errorCode: 'not-found', errorMessage: `operation "${operation}" not defined` });
    }

    const body = req.body;
    if (!body.requestId) return res.json({ requestId: crypto.randomUUID(), success: false, data: null, errorCode: 'invalid-request', errorMessage: 'requestId is required' });
    if (!body.requestAt) return res.json({ requestId: body.requestId, success: false, data: null, errorCode: 'invalid-request', errorMessage: 'requestAt is required' });

    for (const field of (ep.required || [])) {
      if (body[field] === undefined || body[field] === null || body[field] === '') {
        return res.json({ requestId: body.requestId, success: false, data: null, errorCode: 'invalid-request', errorMessage: `${field} is required` });
      }
    }

    const variables = {};
    for (const [gqlVar, bodyField] of Object.entries(ep.mapping || {})) {
      variables[gqlVar] = body[bodyField];
    }

    const schema = await getSchema();
    const result = await graphql({ schema, source: ep.query, variableValues: variables });

    if (result.errors?.length) {
      return res.json({ requestId: body.requestId, success: false, data: null, errorCode: 'gql-error', errorMessage: result.errors[0].message });
    }

    const gqlData = result.data[ep.rootField];

    if (gqlData?.error) {
      const errorCode = ep.errorCodes?.[gqlData.error] || 'error';
      return res.json({ requestId: body.requestId, success: false, data: null, errorCode, errorMessage: gqlData.error });
    }

    return res.json({ requestId: body.requestId, success: true, data: gqlData, errorCode: '', errorMessage: '' });

  } catch (err) {
    return res.status(500).json({ success: false, errorCode: 'server-error', errorMessage: err.message });
  }
});

/*
|--------------------------------------------------------------------------
| SCHEMA CRUD
|--------------------------------------------------------------------------
*/
router.get('/schema', async (req, res) => {
  try {
    const schemas = await prisma.gqlSchema.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, enabled: true, createdAt: true, updatedAt: true },
    });
    return ok(res, schemas);
  } catch (err) { return fail(res, err); }
});

router.get('/schema/:name', async (req, res) => {
  try {
    const schema = await prisma.gqlSchema.findUnique({ where: { name: req.params.name } });
    if (!schema) return fail(res, new Error('not found'), 404);
    return ok(res, schema);
  } catch (err) { return fail(res, err); }
});

router.post('/schema', async (req, res) => {
  try {
    const { name, typeDefs, resolvers, endpoints = '{}', enabled = true } = req.body;
    if (!name)      throw new Error('name is required');
    if (!typeDefs)  throw new Error('typeDefs is required');
    if (!resolvers) throw new Error('resolvers is required');
    const schema = await prisma.gqlSchema.upsert({
      where: { name },
      update: { typeDefs, resolvers, endpoints, enabled },
      create: { name, typeDefs, resolvers, endpoints, enabled },
    });
    markDirty();
    return ok(res, schema);
  } catch (err) { return fail(res, err); }
});

router.patch('/schema/:name', async (req, res) => {
  try {
    const { enabled } = req.body;
    const schema = await prisma.gqlSchema.update({
      where: { name: req.params.name },
      data: { enabled },
    });
    markDirty();
    return ok(res, schema);
  } catch (err) { return fail(res, err); }
});

router.delete('/schema/:name', async (req, res) => {
  try {
    await prisma.gqlSchema.delete({ where: { name: req.params.name } });
    markDirty();
    return ok(res, { deleted: req.params.name });
  } catch (err) { return fail(res, err); }
});

export default router;