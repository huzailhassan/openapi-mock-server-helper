import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export const transactionCache = new Map();

/*
|--------------------------------------------------------------------------
| SIGN / VERIFY
|--------------------------------------------------------------------------
*/

export const signPayload = (queryString = '', rawBody = '') => {
  const canonical = `${queryString}\n${rawBody}`;
  return crypto
    .createHmac('sha256', process.env.API_SECRET || 'test-secret-key')
    .update(canonical, 'utf8')
    .digest('hex');
};

export const verifySignature = (req) => {
  const signature = req.headers['x-signature'];
  const expected = signPayload('', req.rawBody);
  return signature === expected;
};

/*
|--------------------------------------------------------------------------
| VALIDATORS
|--------------------------------------------------------------------------
*/

export const validateTimestamp = (requestAt) => {
  const now = Date.now();
  const diff = Math.abs(now - requestAt);
  return diff <= 300000;
};

export const validateHeaders = (req) => {
  const apiKey = req.headers['x-api-key'];
  const API_KEY = process.env.API_KEY || 'ak_live_demo';
  if (!apiKey || apiKey !== API_KEY) {
    throw new Error('invalid api key');
  }
  /** SIGNATURE DISABLED */
};

export const validateRequest = (payload) => {
  if (!payload.requestId || !payload.requestAt) {
    throw new Error('parameter invalid');
  }
  /** TIMESTAMP CHECK DISABLED */
};

export const requireFields = (payload, fields = []) => {
  for (const field of fields) {
    if (
      payload[field] === undefined ||
      payload[field] === null ||
      payload[field] === ''
    ) {
      throw new Error(`${field} is required`);
    }
  }
};

/*
|--------------------------------------------------------------------------
| USER
|--------------------------------------------------------------------------
*/

export const findOrCreateUser = async (userName) => {
  let user = await prisma.user.findUnique({ where: { username: userName } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        username: userName,
        balance: 0,
        environment: 'prod',
        userId: BigInt(Date.now()),
      },
    });
  }
  return user;
};

/*
|--------------------------------------------------------------------------
| RESPONSE
|--------------------------------------------------------------------------
*/

export const sendEncryptedResponse = (
  res,
  requestId,
  success,
  data = null,
  errorCode = '',
  errorMessage = ''
) => {
  return res.json({ requestId, success, data, errorCode, errorMessage });
};
