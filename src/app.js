import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import routes from './routes/index.js';
import { dynamicLoader } from './routes/script.js';

BigInt.prototype.toJSON = function () { return this.toString(); };

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(bodyParser.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); },
}));

/*
|--------------------------------------------------------------------------
| ADMIN UI
|--------------------------------------------------------------------------
*/

app.get('/admin', (_req, res) => {
  try {
    const html = readFileSync(join(__dirname, 'admin.html'), 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.status(500).send('admin.html not found: ' + err.message);
  }
});

/*
|--------------------------------------------------------------------------
| STATIC ROUTES
|--------------------------------------------------------------------------
*/

for (const { prefix, router } of routes) {
  app.use(prefix, router);
}

/*
|--------------------------------------------------------------------------
| DYNAMIC SCRIPT ROUTES
|--------------------------------------------------------------------------
*/

app.use(dynamicLoader.middleware());

/*
|--------------------------------------------------------------------------
| 404
|--------------------------------------------------------------------------
*/

app.use((_req, res) => {
  res.status(404).json({ success: false, errorCode: 'not-found', errorMessage: 'route not found' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀  API on port ${PORT}`);
  console.log(`🖥   Admin  → http://localhost:${PORT}/admin`);
  console.log(`⚡  GraphQL → http://localhost:${PORT}/graphql`);
});

export default app;
