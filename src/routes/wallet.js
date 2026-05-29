import { Router } from 'express';
import crypto from 'crypto';
import {
  validateHeaders,
  validateRequest,
  requireFields,
  findOrCreateUser,
  sendEncryptedResponse,
  transactionCache,
  prisma,
} from '../utils/helpers.js';

const router = Router();

/*
|--------------------------------------------------------------------------
| BALANCE
|--------------------------------------------------------------------------
*/

router.post('/balance', async (req, res) => {
  try {
    validateHeaders(req);
    const decrypted = req.body;
    validateRequest(decrypted);
    requireFields(decrypted, ['userName', 'currency']);

    const { requestId, userName, currency } = decrypted;
    const user = await findOrCreateUser(userName);

    return sendEncryptedResponse(res, requestId, true, {
      userName,
      currency,
      balance: Number(user.balance),
    });
  } catch (err) {
    return sendEncryptedResponse(
      res, crypto.randomUUID(), false, null, 'system-error', err.message
    );
  }
});

/*
|--------------------------------------------------------------------------
| BET
|--------------------------------------------------------------------------
*/

router.post('/bet', async (req, res) => {
  try {
    validateHeaders(req);
    const decrypted = req.body;
    validateRequest(decrypted);
    requireFields(decrypted, ['transactionId', 'userName', 'currency', 'betAmount']);

    const { requestId, transactionId, userName, currency, betAmount } = decrypted;

    if (transactionCache.has(transactionId)) {
      return sendEncryptedResponse(res, requestId, true, transactionCache.get(transactionId));
    }

    const user = await findOrCreateUser(userName);

    if (Number(user.balance) < Number(betAmount)) {
      return sendEncryptedResponse(
        res, requestId, false, null, 'insufficient-balance', 'insufficient balance'
      );
    }

    const updated = await prisma.user.update({
      where: { username: userName },
      data: { balance: { decrement: Number(betAmount) } },
    });

    const responseData = { userName, currency, balance: Number(updated.balance) };
    transactionCache.set(transactionId, responseData);

    return sendEncryptedResponse(res, requestId, true, responseData);
  } catch (err) {
    return sendEncryptedResponse(
      res, crypto.randomUUID(), false, null, 'transaction-failed', err.message
    );
  }
});

/*
|--------------------------------------------------------------------------
| PAYOUT
|--------------------------------------------------------------------------
*/

router.post('/payout', async (req, res) => {
  try {
    validateHeaders(req);
    const decrypted = req.body;
    validateRequest(decrypted);
    requireFields(decrypted, ['transactionId', 'userName', 'currency', 'payAmount']);

    const { requestId, transactionId, userName, currency, payAmount } = decrypted;

    if (transactionCache.has(transactionId)) {
      return sendEncryptedResponse(res, requestId, true, transactionCache.get(transactionId));
    }

    await findOrCreateUser(userName);

    const updated = await prisma.user.update({
      where: { username: userName },
      data: { balance: { increment: Number(payAmount) } },
    });

    const responseData = { userName, currency, balance: Number(updated.balance) };
    transactionCache.set(transactionId, responseData);

    return sendEncryptedResponse(res, requestId, true, responseData);
  } catch (err) {
    return sendEncryptedResponse(
      res, crypto.randomUUID(), false, null, 'transaction-failed', err.message
    );
  }
});

/*
|--------------------------------------------------------------------------
| ROLLBACK
|--------------------------------------------------------------------------
*/

router.post('/rollback', async (req, res) => {
  try {
    validateHeaders(req);
    const decrypted = req.body;
    validateRequest(decrypted);
    requireFields(decrypted, ['transactionId', 'oriTransactionId', 'userName', 'currency']);

    const { requestId, transactionId, oriTransactionId, userName, currency } = decrypted;

    if (transactionCache.has(transactionId)) {
      return sendEncryptedResponse(res, requestId, true, transactionCache.get(transactionId));
    }

    const original = transactionCache.get(oriTransactionId);
    if (!original) {
      return sendEncryptedResponse(
        res, requestId, false, null, 'not-found', 'original transaction not found'
      );
    }

    await findOrCreateUser(userName);

    const rollbackAmount = 100; // demo logic

    const updated = await prisma.user.update({
      where: { username: userName },
      data: { balance: { increment: rollbackAmount } },
    });

    const responseData = { userName, currency, balance: Number(updated.balance) };
    transactionCache.set(transactionId, responseData);

    return sendEncryptedResponse(res, requestId, true, responseData);
  } catch (err) {
    return sendEncryptedResponse(
      res, crypto.randomUUID(), false, null, 'transaction-failed', err.message
    );
  }
});

export default router;
