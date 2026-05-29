import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import routes from './routes/index.js';
import { dynamicLoader } from './routes/script.js';

/*
|--------------------------------------------------------------------------
| FIX BIGINT JSON
|--------------------------------------------------------------------------
*/

BigInt.prototype.toJSON = function () {
  return this.toString();
};

/*
|--------------------------------------------------------------------------
| APP
|--------------------------------------------------------------------------
*/

const app = express();

app.use(cors());

app.use(
  bodyParser.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);

/*
|--------------------------------------------------------------------------
| STATIC ROUTES  (user / wallet / script management)
|--------------------------------------------------------------------------
*/

for (const { prefix, router } of routes) {
  app.use(prefix, router);
}

/*
|--------------------------------------------------------------------------
| DYNAMIC ROUTES  (scripts uploaded via /script/upload)
| Must come AFTER static routes so /script/* is handled first.
|--------------------------------------------------------------------------
*/

app.use(dynamicLoader.middleware());

/*
|--------------------------------------------------------------------------
| 404
|--------------------------------------------------------------------------
*/

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    errorCode: 'not-found',
    errorMessage: 'route not found',
  });
});

/*
|--------------------------------------------------------------------------
| START
|--------------------------------------------------------------------------
*/

const PORT = process.env.PORT || 4000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀  API running on port ${PORT}`);
  console.log(`📂  Scripts dir: ${process.cwd()}/scripts`);
  console.log(`🔥  Hot reload: run with nodemon for file-watch restart`);
  console.log(`⚡  Dynamic routes: upload a JS file → auto-mounted instantly`);
});

export default app;
