/**
 * Static Route Registry
 * These routes are always mounted on startup.
 * Scripts uploaded via /dev/api/v1/script/upload are mounted dynamically — no entry needed here.
 */

import userRouter   from './user.js';
import walletRouter from './wallet.js';
import scriptRouter from './script.js';

const routes = [
  { prefix: '/dev/api/v1/user',   router: userRouter   },
  { prefix: '/dev/api/v1/wallet', router: walletRouter },
  { prefix: '/dev/api/v1/script', router: scriptRouter },
];

export default routes;
