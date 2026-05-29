import crypto from 'crypto';

/*
|--------------------------------------------------------------------------
| CONFIG
|--------------------------------------------------------------------------
*/

const BASE_URL = process.env.API_URL || 'http://localhost:4000';
const API_KEY  = process.env.API_KEY  || 'ak_live_demo';

/*
|--------------------------------------------------------------------------
| ROUTE SCRIPTS TO UPLOAD
| Each one will be mounted at /dev/api/v1/<name>/*
|--------------------------------------------------------------------------
*/

const scripts = [

  /*
  |--------------------------------------------------------------------------
  | USER  →  /dev/api/v1/user/login
  |--------------------------------------------------------------------------
  */
  {
    fileName: 'user.js',
    content: `
import { Router } from 'express';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

const validateHeaders = (req) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== (process.env.API_KEY || 'ak_live_demo')) throw new Error('invalid api key');
};

const validateRequest = (payload) => {
  if (!payload.requestId || !payload.requestAt) throw new Error('parameter invalid');
};

const requireFields = (payload, fields) => {
  for (const field of fields) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === '')
      throw new Error(field + ' is required');
  }
};

const findOrCreateUser = async (userName) => {
  let user = await prisma.user.findUnique({ where: { username: userName } });
  if (!user) {
    user = await prisma.user.create({
      data: { username: userName, balance: 0, environment: 'prod', userId: BigInt(Date.now()) }
    });
  }
  return user;
};

const reply = (res, requestId, success, data = null, errorCode = '', errorMessage = '') =>
  res.json({ requestId, success, data, errorCode, errorMessage });

router.post('/login', async (req, res) => {
  try {
    validateHeaders(req);
    validateRequest(req.body);
    requireFields(req.body, ['userName', 'gameId']);
    const { requestId, userName, gameId, language = 'en' } = req.body;
    await findOrCreateUser(userName);
    const sessionToken = crypto.randomBytes(32).toString('hex');
    return reply(res, requestId, true, {
      gameUrl: \`https://game.example.com/start?gameId=\${gameId}&lang=\${language}\`,
      sessionToken
    });
  } catch (err) {
    return reply(res, crypto.randomUUID(), false, null, 'invalid-request', err.message);
  }
});

export default router;
`.trim()
  },

  /*
  |--------------------------------------------------------------------------
  | WALLET  →  /dev/api/v1/wallet/balance|bet|payout|rollback
  |--------------------------------------------------------------------------
  */
  {
    fileName: 'wallet.js',
    content: `
import { Router } from 'express';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();
const transactionCache = new Map();

const validateHeaders = (req) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== (process.env.API_KEY || 'ak_live_demo')) throw new Error('invalid api key');
};

const validateRequest = (payload) => {
  if (!payload.requestId || !payload.requestAt) throw new Error('parameter invalid');
};

const requireFields = (payload, fields) => {
  for (const field of fields) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === '')
      throw new Error(field + ' is required');
  }
};

const findOrCreateUser = async (userName) => {
  let user = await prisma.user.findUnique({ where: { username: userName } });
  if (!user) {
    user = await prisma.user.create({
      data: { username: userName, balance: 0, environment: 'prod', userId: BigInt(Date.now()) }
    });
  }
  return user;
};

const reply = (res, requestId, success, data = null, errorCode = '', errorMessage = '') =>
  res.json({ requestId, success, data, errorCode, errorMessage });

/*--- BALANCE ---*/
router.post('/balance', async (req, res) => {
  try {
    validateHeaders(req); validateRequest(req.body);
    requireFields(req.body, ['userName', 'currency']);
    const { requestId, userName, currency } = req.body;
    const user = await findOrCreateUser(userName);
    return reply(res, requestId, true, { userName, currency, balance: Number(user.balance) });
  } catch (err) {
    return reply(res, crypto.randomUUID(), false, null, 'system-error', err.message);
  }
});

/*--- BET ---*/
router.post('/bet', async (req, res) => {
  try {
    validateHeaders(req); validateRequest(req.body);
    requireFields(req.body, ['transactionId', 'userName', 'currency', 'betAmount']);
    const { requestId, transactionId, userName, currency, betAmount } = req.body;
    if (transactionCache.has(transactionId))
      return reply(res, requestId, true, transactionCache.get(transactionId));
    const user = await findOrCreateUser(userName);
    if (Number(user.balance) < Number(betAmount))
      return reply(res, requestId, false, null, 'insufficient-balance', 'insufficient balance');
    const updated = await prisma.user.update({
      where: { username: userName },
      data: { balance: { decrement: Number(betAmount) } }
    });
    const data = { userName, currency, balance: Number(updated.balance) };
    transactionCache.set(transactionId, data);
    return reply(res, requestId, true, data);
  } catch (err) {
    return reply(res, crypto.randomUUID(), false, null, 'transaction-failed', err.message);
  }
});

/*--- PAYOUT ---*/
router.post('/payout', async (req, res) => {
  try {
    validateHeaders(req); validateRequest(req.body);
    requireFields(req.body, ['transactionId', 'userName', 'currency', 'payAmount']);
    const { requestId, transactionId, userName, currency, payAmount } = req.body;
    if (transactionCache.has(transactionId))
      return reply(res, requestId, true, transactionCache.get(transactionId));
    await findOrCreateUser(userName);
    const updated = await prisma.user.update({
      where: { username: userName },
      data: { balance: { increment: Number(payAmount) } }
    });
    const data = { userName, currency, balance: Number(updated.balance) };
    transactionCache.set(transactionId, data);
    return reply(res, requestId, true, data);
  } catch (err) {
    return reply(res, crypto.randomUUID(), false, null, 'transaction-failed', err.message);
  }
});

/*--- ROLLBACK ---*/
router.post('/rollback', async (req, res) => {
  try {
    validateHeaders(req); validateRequest(req.body);
    requireFields(req.body, ['transactionId', 'oriTransactionId', 'userName', 'currency']);
    const { requestId, transactionId, oriTransactionId, userName, currency } = req.body;
    if (transactionCache.has(transactionId))
      return reply(res, requestId, true, transactionCache.get(transactionId));
    const original = transactionCache.get(oriTransactionId);
    if (!original)
      return reply(res, requestId, false, null, 'not-found', 'original transaction not found');
    await findOrCreateUser(userName);
    const updated = await prisma.user.update({
      where: { username: userName },
      data: { balance: { increment: 100 } }
    });
    const data = { userName, currency, balance: Number(updated.balance) };
    transactionCache.set(transactionId, data);
    return reply(res, requestId, true, data);
  } catch (err) {
    return reply(res, crypto.randomUUID(), false, null, 'transaction-failed', err.message);
  }
});

export default router;
`.trim()
  }

];

/*
|--------------------------------------------------------------------------
| UPLOAD
|--------------------------------------------------------------------------
*/

console.log(`\n📤  Uploading ${scripts.length} route scripts to ${BASE_URL}\n`);

let ok = 0, fail = 0;

for (const { fileName, content } of scripts) {
  const requestId = crypto.randomUUID();
  try {
    const res = await fetch(`${BASE_URL}/dev/api/v1/script/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ requestId, requestAt: Date.now(), fileName, encoding: 'utf8', content })
    });
    const json = await res.json();
    if (json.success) {
      console.log(`  ✅  ${fileName.padEnd(12)}  →  ${json.data.mountedAt}`);
      ok++;
    } else {
      console.log(`  ❌  ${fileName.padEnd(12)}  —  ${json.errorMessage}`);
      fail++;
    }
  } catch (err) {
    console.log(`  ❌  ${fileName.padEnd(12)}  —  ${err.message}`);
    fail++;
  }
}

console.log(`\n${'─'.repeat(45)}`);
console.log(`  Uploaded: ${ok}   Failed: ${fail}`);
console.log(`${'─'.repeat(45)}`);
console.log(`
  Endpoints now live:
  POST  /dev/api/v1/user/login
  POST  /dev/api/v1/wallet/balance
  POST  /dev/api/v1/wallet/bet
  POST  /dev/api/v1/wallet/payout
  POST  /dev/api/v1/wallet/rollback
`);
