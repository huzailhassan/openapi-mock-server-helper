import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { validateHeaders, sendEncryptedResponse } from '../utils/helpers.js';

const router = Router();

export const SCRIPTS_DIR = path.resolve(process.cwd(), 'scripts');

if (!fs.existsSync(SCRIPTS_DIR)) {
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
}

/*
|--------------------------------------------------------------------------
| UPLOAD SCRIPT
| POST /dev/api/v1/script/upload
|
| Body:
|   requestId  string   required
|   requestAt  number   required
|   fileName   string   e.g. "order.js"  → mounts at /dev/api/v1/order/*
|   content    string   raw JS source (utf8) or base64 bytes
|   encoding   string   "utf8" (default) | "base64"
|
| The uploaded file must export a default Express Router.
| It is auto-mounted under /dev/api/v1/<fileName without .js>
|--------------------------------------------------------------------------
*/

router.post('/upload', async (req, res) => {
  try {
    validateHeaders(req);

    const { requestId, fileName, content, encoding = 'utf8' } = req.body;

    if (!requestId) throw new Error('requestId is required');
    if (!fileName)  throw new Error('fileName is required');
    if (!content)   throw new Error('content is required');

    // Sanitise — no path traversal, force .js extension
    const baseName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!baseName.endsWith('.js')) throw new Error('fileName must end with .js');

    const filePath = path.join(SCRIPTS_DIR, baseName);

    const buffer =
      encoding === 'base64'
        ? Buffer.from(content, 'base64')
        : Buffer.from(content, 'utf8');

    fs.writeFileSync(filePath, buffer);

    // Notify the dynamic loader to pick up the new file
    dynamicLoader.reload();

    const routeName = baseName.replace(/\.js$/, '');

    return sendEncryptedResponse(res, requestId, true, {
      fileName: baseName,
      size: buffer.length,
      mountedAt: `/dev/api/v1/${routeName}`,
      uploadedAt: new Date().toISOString(),
    });
  } catch (err) {
    return sendEncryptedResponse(
      res, crypto.randomUUID(), false, null, 'upload-failed', err.message
    );
  }
});

/*
|--------------------------------------------------------------------------
| LIST SCRIPTS
| POST /dev/api/v1/script/list
|--------------------------------------------------------------------------
*/

router.post('/list', async (req, res) => {
  try {
    validateHeaders(req);

    const { requestId } = req.body;
    if (!requestId) throw new Error('requestId is required');

    const files = fs.existsSync(SCRIPTS_DIR)
      ? fs.readdirSync(SCRIPTS_DIR)
          .filter((f) => f.endsWith('.js'))
          .map((name) => {
            const stat = fs.statSync(path.join(SCRIPTS_DIR, name));
            return {
              fileName: name,
              mountedAt: `/dev/api/v1/${name.replace(/\.js$/, '')}`,
              size: stat.size,
              updatedAt: stat.mtime.toISOString(),
            };
          })
      : [];

    return sendEncryptedResponse(res, requestId, true, { files });
  } catch (err) {
    return sendEncryptedResponse(
      res, crypto.randomUUID(), false, null, 'list-failed', err.message
    );
  }
});

/*
|--------------------------------------------------------------------------
| DELETE SCRIPT
| POST /dev/api/v1/script/delete
|--------------------------------------------------------------------------
*/

router.post('/delete', async (req, res) => {
  try {
    validateHeaders(req);

    const { requestId, fileName } = req.body;
    if (!requestId) throw new Error('requestId is required');
    if (!fileName)  throw new Error('fileName is required');

    const baseName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = path.join(SCRIPTS_DIR, baseName);

    if (!fs.existsSync(filePath)) {
      throw new Error(`file not found: ${baseName}`);
    }

    fs.unlinkSync(filePath);
    dynamicLoader.reload();

    return sendEncryptedResponse(res, requestId, true, {
      fileName: baseName,
      deletedAt: new Date().toISOString(),
    });
  } catch (err) {
    return sendEncryptedResponse(
      res, crypto.randomUUID(), false, null, 'delete-failed', err.message
    );
  }
});

/*
|--------------------------------------------------------------------------
| DYNAMIC LOADER
| Exported so app.js can attach it to the express app and call reload()
|--------------------------------------------------------------------------
*/

export const dynamicLoader = {
  _router: null,
  _dirty: true,

  reload() {
    this._dirty = true;
    console.log('[dynamic-loader] Reload triggered — routes will refresh on next request');
  },

  async getRouter() {
    if (!this._dirty && this._router) return this._router;

    const parent = Router();

    if (!fs.existsSync(SCRIPTS_DIR)) {
      this._router = parent;
      this._dirty = false;
      return parent;
    }

    const files = fs.readdirSync(SCRIPTS_DIR).filter((f) => f.endsWith('.js'));

    for (const file of files) {
      const filePath = path.join(SCRIPTS_DIR, file);
      const routeName = file.replace(/\.js$/, '');
      const prefix = `/dev/api/v1/${routeName}`;

      try {
        // Cache-bust with mtime so edits to existing files are picked up
        const mtime = fs.statSync(filePath).mtimeMs;
        const fileUrl = `file://${filePath}?t=${mtime}`;
        const mod = await import(fileUrl);

        if (!mod.default || typeof mod.default !== 'function') {
          console.warn(`[dynamic-loader] ${file} has no default Router export — skipped`);
          continue;
        }

        parent.use(prefix, mod.default);
        console.log(`[dynamic-loader] Mounted  ${prefix}`);
      } catch (err) {
        console.error(`[dynamic-loader] Failed to load ${file}:`, err.message);
      }
    }

    this._router = parent;
    this._dirty = false;
    return parent;
  },

  // Express middleware — drop this into app.use()
  middleware() {
    return async (req, res, next) => {
      const r = await this.getRouter();
      r(req, res, next);
    };
  },
};

export default router;
