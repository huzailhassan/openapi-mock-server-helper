import { Router } from 'express';
import crypto from 'crypto';
import {
  validateHeaders,
  validateRequest,
  requireFields,
  findOrCreateUser,
  sendEncryptedResponse,
} from '../utils/helpers.js';

const router = Router();

/*
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
*/

router.post('/login', async (req, res) => {
  try {
    validateHeaders(req);
    const decrypted = req.body;
    validateRequest(decrypted);
    requireFields(decrypted, ['userName', 'gameId']);

    const { requestId, userName, gameId, language = 'en' } = decrypted;

    await findOrCreateUser(userName);

    const sessionToken = crypto.randomBytes(32).toString('hex');

    return sendEncryptedResponse(res, requestId, true, {
      gameUrl: `https://game.example.com/start?gameId=${gameId}&lang=${language}`,
      sessionToken,
    });
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
});

export default router;
