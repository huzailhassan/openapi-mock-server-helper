import express from 'express';
import crypto from 'crypto';
import cors from 'cors';
import bodyParser from 'body-parser';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const app = express();

/*
|--------------------------------------------------------------------------
| FIX BIGINT JSON
|--------------------------------------------------------------------------
*/

BigInt.prototype.toJSON = function () {
  return this.toString();
};

app.use(cors());

app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));

/*
|--------------------------------------------------------------------------
| ENV
|--------------------------------------------------------------------------
*/

const API_KEY =
  process.env.API_KEY || 'ak_live_demo';

const API_SECRET =
  process.env.API_SECRET ||
  'test-secret-key';

const OP =
  process.env.OP || 'TEST';

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const transactionCache =
  new Map();

const signPayload = (
  queryString = '',
  rawBody = ''
) => {

  const canonical =
    `${queryString}\n${rawBody}`;

  return crypto
    .createHmac(
      'sha256',
      API_SECRET
    )
    .update(canonical, 'utf8')
    .digest('hex');

};

const verifySignature = (
  req
) => {

  const signature =
    req.headers['x-signature'];

  const expected =
    signPayload(
      '',
      req.rawBody
    );

  return signature === expected;

};

const validateTimestamp = (
  requestAt
) => {

  const now = Date.now();

  const diff = Math.abs(
    now - requestAt
  );

  return diff <= 300000;

};

const validateHeaders = (
  req
) => {

  const apiKey =
    req.headers['x-api-key'];

  if (
    !apiKey ||
    apiKey !== API_KEY
  ) {

    throw new Error(
      'invalid api key'
    );

  }

  /**
   * SIGNATURE DISABLED
   */

};

const validateRequest = (
  payload
) => {

  if (
    !payload.requestId ||
    !payload.requestAt
  ) {

    throw new Error(
      'parameter invalid'
    );

  }

  /**
   * TIMESTAMP CHECK DISABLED
   */

};

/**
 * REQUIRED FIELD VALIDATOR
 */

const requireFields = (
  payload,
  fields = []
) => {

  for (const field of fields) {

    if (
      payload[field] === undefined ||
      payload[field] === null ||
      payload[field] === ''
    ) {

      throw new Error(
        `${field} is required`
      );

    }

  }

};

/**
 * AUTO CREATE USER
 */

const findOrCreateUser =
  async (userName) => {

    let user =
      await prisma.user.findUnique({
        where: {
          username: userName
        }
      });

    if (!user) {

      user =
        await prisma.user.create({
          data: {
            username: userName,
            balance: 0,
            environment: 'prod',

            /*
            |--------------------------------------------------------------------------
            | FIXED BIGINT
            |--------------------------------------------------------------------------
            */

            userId:
              BigInt(Date.now())
          }
        });

    }

    return user;

  };

const sendEncryptedResponse = (
  res,
  requestId,
  success,
  data = null,
  errorCode = '',
  errorMessage = ''
) => {

  return res.json({
    requestId,
    success,
    data,
    errorCode,
    errorMessage
  });

};

/*
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
*/

app.post(
  '/dev/api/v1/user/login',
  async (req, res) => {

    try {

      validateHeaders(req);

      const decrypted =
        req.body;

      validateRequest(
        decrypted
      );

      requireFields(
        decrypted,
        [
          'userName',
          'gameId'
        ]
      );

      const {
        requestId,
        userName,
        gameId,
        language = 'en'
      } = decrypted;

      await findOrCreateUser(
        userName
      );

      const sessionToken =
        crypto.randomBytes(32)
          .toString('hex');

      return sendEncryptedResponse(
        res,
        requestId,
        true,
        {
          gameUrl:
            `https://game.example.com/start?gameId=${gameId}&lang=${language}`,
          sessionToken
        }
      );

    } catch (err) {

      return sendEncryptedResponse(
        res,
        crypto.randomUUID(),
        false,
        null,
        'invalid-request',
        err.message
      );

    }

  }
);

/*
|--------------------------------------------------------------------------
| BALANCE
|--------------------------------------------------------------------------
*/

app.post(
  '/dev/api/v1/wallet/balance',
  async (req, res) => {

    try {

      validateHeaders(req);

      const decrypted =
        req.body;

      validateRequest(
        decrypted
      );

      requireFields(
        decrypted,
        [
          'userName',
          'currency'
        ]
      );

      const {
        requestId,
        userName,
        currency
      } = decrypted;

      const user =
        await findOrCreateUser(
          userName
        );

      return sendEncryptedResponse(
        res,
        requestId,
        true,
        {
          userName,
          currency,
          balance: Number(
            user.balance
          )
        }
      );

    } catch (err) {

      return sendEncryptedResponse(
        res,
        crypto.randomUUID(),
        false,
        null,
        'system-error',
        err.message
      );

    }

  }
);

/*
|--------------------------------------------------------------------------
| BET
|--------------------------------------------------------------------------
*/

app.post(
  '/dev/api/v1/wallet/bet',
  async (req, res) => {

    try {

      validateHeaders(req);

      const decrypted =
        req.body;

      validateRequest(
        decrypted
      );

      requireFields(
        decrypted,
        [
          'transactionId',
          'userName',
          'currency',
          'betAmount'
        ]
      );

      const {
        requestId,
        transactionId,
        userName,
        currency,
        betAmount
      } = decrypted;

      /**
       * idempotent
       */

      if (
        transactionCache.has(
          transactionId
        )
      ) {

        return sendEncryptedResponse(
          res,
          requestId,
          true,
          transactionCache.get(
            transactionId
          )
        );

      }

      const user =
        await findOrCreateUser(
          userName
        );

      if (
        Number(user.balance) <
        Number(betAmount)
      ) {

        return sendEncryptedResponse(
          res,
          requestId,
          false,
          null,
          'insufficient-balance',
          'insufficient balance'
        );

      }

      const updated =
        await prisma.user.update({
          where: {
            username: userName
          },
          data: {
            balance: {
              decrement:
                Number(betAmount)
            }
          }
        });

      const responseData = {
        userName,
        currency,
        balance: Number(
          updated.balance
        )
      };

      transactionCache.set(
        transactionId,
        responseData
      );

      return sendEncryptedResponse(
        res,
        requestId,
        true,
        responseData
      );

    } catch (err) {

      return sendEncryptedResponse(
        res,
        crypto.randomUUID(),
        false,
        null,
        'transaction-failed',
        err.message
      );

    }

  }
);

/*
|--------------------------------------------------------------------------
| PAYOUT
|--------------------------------------------------------------------------
*/

app.post(
  '/dev/api/v1/wallet/payout',
  async (req, res) => {

    try {

      validateHeaders(req);

      const decrypted =
        req.body;

      validateRequest(
        decrypted
      );

      requireFields(
        decrypted,
        [
          'transactionId',
          'userName',
          'currency',
          'payAmount'
        ]
      );

      const {
        requestId,
        transactionId,
        userName,
        currency,
        payAmount
      } = decrypted;

      if (
        transactionCache.has(
          transactionId
        )
      ) {

        return sendEncryptedResponse(
          res,
          requestId,
          true,
          transactionCache.get(
            transactionId
          )
        );

      }

      await findOrCreateUser(
        userName
      );

      const updated =
        await prisma.user.update({
          where: {
            username: userName
          },
          data: {
            balance: {
              increment:
                Number(payAmount)
            }
          }
        });

      const responseData = {
        userName,
        currency,
        balance: Number(
          updated.balance
        )
      };

      transactionCache.set(
        transactionId,
        responseData
      );

      return sendEncryptedResponse(
        res,
        requestId,
        true,
        responseData
      );

    } catch (err) {

      return sendEncryptedResponse(
        res,
        crypto.randomUUID(),
        false,
        null,
        'transaction-failed',
        err.message
      );

    }

  }
);

/*
|--------------------------------------------------------------------------
| ROLLBACK
|--------------------------------------------------------------------------
*/

app.post(
  '/dev/api/v1/wallet/rollback',
  async (req, res) => {

    try {

      validateHeaders(req);

      const decrypted =
        req.body;

      validateRequest(
        decrypted
      );

      requireFields(
        decrypted,
        [
          'transactionId',
          'oriTransactionId',
          'userName',
          'currency'
        ]
      );

      const {
        requestId,
        transactionId,
        oriTransactionId,
        userName,
        currency
      } = decrypted;

      if (
        transactionCache.has(
          transactionId
        )
      ) {

        return sendEncryptedResponse(
          res,
          requestId,
          true,
          transactionCache.get(
            transactionId
          )
        );

      }

      const original =
        transactionCache.get(
          oriTransactionId
        );

      if (!original) {

        return sendEncryptedResponse(
          res,
          requestId,
          false,
          null,
          'not-found',
          'original transaction not found'
        );

      }

      await findOrCreateUser(
        userName
      );

      /**
       * rollback demo logic
       */

      const rollbackAmount =
        100;

      const updated =
        await prisma.user.update({
          where: {
            username: userName
          },
          data: {
            balance: {
              increment:
                rollbackAmount
            }
          }
        });

      const responseData = {
        userName,
        currency,
        balance: Number(
          updated.balance
        )
      };

      transactionCache.set(
        transactionId,
        responseData
      );

      return sendEncryptedResponse(
        res,
        requestId,
        true,
        responseData
      );

    } catch (err) {

      return sendEncryptedResponse(
        res,
        crypto.randomUUID(),
        false,
        null,
        'transaction-failed',
        err.message
      );

    }

  }
);

/*
|--------------------------------------------------------------------------
| START SERVER
|--------------------------------------------------------------------------
*/

const PORT =
  process.env.PORT || 4000;

app.listen(
  PORT,
  '0.0.0.0',
  () => {

    console.log(
      `🚀 API running on port ${PORT}`
    );

  }
);