import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {  reply } from '../utils/helpers.js';

const router = Router();
export const SCRIPTS_DIR = path.resolve(process.cwd(), 'scripts');
if (!fs.existsSync(SCRIPTS_DIR)) fs.mkdirSync(SCRIPTS_DIR, { recursive: true });

/*
|--------------------------------------------------------------------------
| DYNAMIC LOADER
|--------------------------------------------------------------------------
*/

export const dynamicLoader = {
  _router: null,
  _dirty: true,

  reload() {
    this._dirty = true;
    console.log('[dynamic-loader] Reload triggered');
  },

  async getRouter() {
    if (!this._dirty && this._router) return this._router;
    const parent = Router();
    if (!fs.existsSync(SCRIPTS_DIR)) { this._router = parent; this._dirty = false; return parent; }

    const files = fs.readdirSync(SCRIPTS_DIR).filter(f => f.endsWith('.js'));
    for (const file of files) {
      const filePath = path.join(SCRIPTS_DIR, file);
      const prefix = `/dev/api/v1/${file.replace(/\.js$/, '')}`;
      try {
        const mtime = fs.statSync(filePath).mtimeMs;
        const mod = await import(`file://${filePath}?t=${mtime}`);
        if (!mod.default || typeof mod.default !== 'function') continue;
        parent.use(prefix, mod.default);
        console.log(`[dynamic-loader] Mounted ${prefix}`);
      } catch (err) {
        console.error(`[dynamic-loader] Failed ${file}:`, err.message);
      }
    }
    this._router = parent; this._dirty = false;
    return parent;
  },

  middleware() {
    return async (req, res, next) => {
      const r = await this.getRouter();
      r(req, res, next);
    };
  },
};

/*
|--------------------------------------------------------------------------
| UPLOAD
|--------------------------------------------------------------------------
*/

router.post('/upload', async (req, res) => {
  try {
    const { requestId, fileName, content, encoding = 'utf8' } = req.body;
    if (!requestId) throw new Error('requestId is required');
    if (!fileName)  throw new Error('fileName is required');
    if (!content)   throw new Error('content is required');
    const baseName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!baseName.endsWith('.js')) throw new Error('fileName must end with .js');
    const buf = encoding === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content, 'utf8');
    fs.writeFileSync(path.join(SCRIPTS_DIR, baseName), buf);
    dynamicLoader.reload();
    return reply(res, requestId, true, { fileName: baseName, mountedAt: `/dev/api/v1/${baseName.replace(/\.js$/, '')}`, size: buf.length, uploadedAt: new Date().toISOString() });
  } catch (err) {
    return reply(res, crypto.randomUUID(), false, null, 'upload-failed', err.message);
  }
});

/*
|--------------------------------------------------------------------------
| LIST
|--------------------------------------------------------------------------
*/

router.post('/list', async (req, res) => {
  try {
    const { requestId } = req.body;
    if (!requestId) throw new Error('requestId is required');
    const files = fs.existsSync(SCRIPTS_DIR)
      ? fs.readdirSync(SCRIPTS_DIR).filter(f => f.endsWith('.js')).map(name => {
          const stat = fs.statSync(path.join(SCRIPTS_DIR, name));
          return { fileName: name, mountedAt: `/dev/api/v1/${name.replace(/\.js$/, '')}`, size: stat.size, updatedAt: stat.mtime.toISOString() };
        })
      : [];
    return reply(res, requestId, true, { files });
  } catch (err) {
    return reply(res, crypto.randomUUID(), false, null, 'list-failed', err.message);
  }
});

/*
|--------------------------------------------------------------------------
| READ
|--------------------------------------------------------------------------
*/

router.post('/read', async (req, res) => {
  try {
    const { requestId, fileName } = req.body;
    if (!requestId) throw new Error('requestId is required');
    if (!fileName)  throw new Error('fileName is required');
    const baseName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = path.join(SCRIPTS_DIR, baseName);
    if (!fs.existsSync(filePath)) throw new Error(`file not found: ${baseName}`);
    const content = fs.readFileSync(filePath, 'utf8');
    const stat = fs.statSync(filePath);
    return reply(res, requestId, true, { fileName: baseName, content, size: stat.size, updatedAt: stat.mtime.toISOString() });
  } catch (err) {
    return reply(res, crypto.randomUUID(), false, null, 'read-failed', err.message);
  }
});

/*
|--------------------------------------------------------------------------
| DELETE
|--------------------------------------------------------------------------
*/

router.post('/delete', async (req, res) => {
  try {
    const { requestId, fileName } = req.body;
    if (!requestId) throw new Error('requestId is required');
    if (!fileName)  throw new Error('fileName is required');
    const baseName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = path.join(SCRIPTS_DIR, baseName);
    if (!fs.existsSync(filePath)) throw new Error(`file not found: ${baseName}`);
    fs.unlinkSync(filePath);
    dynamicLoader.reload();
    return reply(res, requestId, true, { fileName: baseName, deletedAt: new Date().toISOString() });
  } catch (err) {
    return reply(res, crypto.randomUUID(), false, null, 'delete-failed', err.message);
  }
});

export default router;
