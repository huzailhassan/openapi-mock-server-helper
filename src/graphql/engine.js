import { makeExecutableSchema } from '@graphql-tools/schema';
import { parse } from 'graphql';
import { prisma } from '../utils/helpers.js';

/*
|--------------------------------------------------------------------------
| BASE SCHEMA — always present
| All user-defined schemas are merged into this.
|--------------------------------------------------------------------------
*/

const BASE_TYPE_DEFS = `
  type Query {
    _empty: String
  }
  type Mutation {
    _empty: String
  }
`;

/*
|--------------------------------------------------------------------------
| SCHEMA CACHE
| Rebuilt whenever a GqlSchema row is created/updated/deleted.
|--------------------------------------------------------------------------
*/

let _schema = null;
let _dirty = true;

export function markDirty() {
  _dirty = true;
  console.log('[gql-engine] Schema marked dirty — will rebuild on next request');
}

/*
|--------------------------------------------------------------------------
| BUILD SCHEMA FROM DB
|--------------------------------------------------------------------------
*/

async function buildSchema() {
  const rows = await prisma.gqlSchema.findMany({ where: { enabled: true } });

  // Start with the base
  let mergedTypeDefs = BASE_TYPE_DEFS;
  const mergedResolvers = { Query: {}, Mutation: {} };

  for (const row of rows) {
    // Merge type definitions
    mergedTypeDefs += '\n' + row.typeDefs;

    // Eval the resolver function string
    // Format expected: function(context) { return { Query: {...}, Mutation: {...} } }
    try {
      // eslint-disable-next-line no-new-func
      const resolverFactory = new Function('prisma', 'context', row.resolvers);
      const resolvers = resolverFactory(prisma, {});
      Object.assign(mergedResolvers.Query,    resolvers.Query    || {});
      Object.assign(mergedResolvers.Mutation, resolvers.Mutation || {});
    } catch (err) {
      console.error(`[gql-engine] Failed to load resolvers for "${row.name}":`, err.message);
    }
  }

  try {
    parse(mergedTypeDefs); // validate SDL
  } catch (err) {
    console.error('[gql-engine] Invalid SDL:', err.message);
    throw err;
  }

  return makeExecutableSchema({ typeDefs: mergedTypeDefs, resolvers: mergedResolvers });
}

/*
|--------------------------------------------------------------------------
| GET SCHEMA (with lazy rebuild)
|--------------------------------------------------------------------------
*/

export async function getSchema() {
  if (!_dirty && _schema) return _schema;
  _schema = await buildSchema();
  _dirty = false;
  console.log('[gql-engine] Schema rebuilt ✓');
  return _schema;
}
