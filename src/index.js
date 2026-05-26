import express from 'express';
import crypto from 'crypto';
import cors from 'cors';
import bodyParser from 'body-parser';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();

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

/**
 * base64 encoded 32 bytes
 */

const PAYLOAD_KEY = Buffer.from(
  process.env.PAYLOAD_KEY ||
  'PGkJs5UPAqGq2jAdx36Y6wKJp9eQrTyU2vBnMqXz4Y8=',
  'base64'
);

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const usedNonces = new Map();

const transactionCache =
  new Map();

const generateNonce = () => {
  return crypto.randomBytes(12);
};

/**
 * canonical = query + "\n" + rawBody
 */

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

const encryptPayload = (
  payloadObject
) => {

  const nonce =
    generateNonce();

  const cipher =
    crypto.createCipheriv(
      'aes-256-gcm',
      PAYLOAD_KEY,
      nonce
    );

  const plaintext = Buffer.from(
    JSON.stringify(payloadObject),
    'utf8'
  );

  const encrypted =
    Buffer.concat([
      cipher.update(plaintext),
      cipher.final()
    ]);

  const tag =
    cipher.getAuthTag();

  return {
    nonce:
      nonce.toString('base64'),

    payload:
      Buffer.concat([
        encrypted,
        tag
      ]).toString('base64')
  };

};

const decryptPayload = (
  nonceB64,
  payloadB64
) => {

  const nonce = Buffer.from(
    nonceB64,
    'base64'
  );

  if (nonce.length !== 12) {

    throw new Error(
      'invalid nonce'
    );

  }

  /**
   * anti replay
   */

  if (
    usedNonces.has(nonceB64)
  ) {

    throw new Error(
      'nonce reused'
    );

  }

  usedNonces.set(
    nonceB64,
    Date.now()
  );

  const payloadBuffer =
    Buffer.from(
      payloadB64,
      'base64'
    );

  const tag =
    payloadBuffer.subarray(
      payloadBuffer.length - 16
    );

  const ciphertext =
    payloadBuffer.subarray(
      0,
      payloadBuffer.length - 16
    );

  const decipher =
    crypto.createDecipheriv(
      'aes-256-gcm',
      PAYLOAD_KEY,
      nonce
    );

  decipher.setAuthTag(tag);

  const decrypted =
    Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);

  return JSON.parse(
    decrypted.toString('utf8')
  );

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

  if (
    !verifySignature(req)
  ) {

    throw new Error(
      'invalid signature'
    );

  }

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

  if (
    !validateTimestamp(
      payload.requestAt
    )
  ) {

    throw new Error(
      'request expired'
    );

  }

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
            userId: Date.now()
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

  const encrypted =
    encryptPayload({
      requestId,
      success,
      data,
      errorCode,
      errorMessage
    });

  const rawBody =
    JSON.stringify(
      encrypted
    );

  const signature =
    signPayload(
      '',
      rawBody
    );

  res.setHeader(
    'X-Signature',
    signature
  );

  return res.json(
    encrypted
  );

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
        decryptPayload(
          req.body.nonce,
          req.body.payload
        );

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
        decryptPayload(
          req.body.nonce,
          req.body.payload
        );

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
        decryptPayload(
          req.body.nonce,
          req.body.payload
        );

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
                betAmount
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
        decryptPayload(
          req.body.nonce,
          req.body.payload
        );

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
                payAmount
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
        decryptPayload(
          req.body.nonce,
          req.body.payload
        );

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
| CLEANUP NONCE CACHE
|--------------------------------------------------------------------------
*/

setInterval(() => {

  const now = Date.now();

  for (
    const [key, value]
    of usedNonces.entries()
  ) {

    if (
      now - value > 300000
    ) {

      usedNonces.delete(key);

    }

  }

}, 60000);

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