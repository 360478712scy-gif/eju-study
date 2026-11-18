// The learner's own media: background pictures and piano tracks added from the app.
// Files live in <data>/media/, listed in <data>/media/index.json, served at /media/<file>.
//   GET  /api/media                     → { items: MediaItem[] }
//   POST /api/media?kind=music&name=…    raw file bytes, Content-Type = the file's type → { item }
//        (background: also &tone=light|dark, measured by the app from the picture)
//   POST /api/media/delete  {"id": "…"}  → { ok: true }
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { randomUUID } from 'node:crypto';

export type MediaKind = 'music' | 'background';
export interface MediaItem {
  id: string;
  kind: MediaKind;
  name: string;
  file: string;
  url: string;
  size: number;
  tone?: 'light' | 'dark';
  addedAt: string;
}

const TYPES: Record<MediaKind, Record<string, string>> = {
  music: { 'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/aac': '.aac', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/ogg': '.ogg' },
  background: { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' },
};
const LIMIT: Record<MediaKind, number> = { music: 80 * 1024 * 1024, background: 30 * 1024 * 1024 };
const MAX_ITEMS = 60;

type Helpers = {
  sendJson: (res: http.ServerResponse, status: number, value: unknown) => void;
  serveFile: (req: http.IncomingMessage, res: http.ServerResponse, file: string, cache: string) => void;
  readBody: (req: http.IncomingMessage, limit?: number) => Promise<string>;
};

export function createMedia(dataDir: string) {
  const dir = path.join(dataDir, 'media');
  const indexFile = path.join(dir, 'index.json');

  const list = (): MediaItem[] => {
    try {
      const value = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
      return Array.isArray(value) ? value.filter((it) => it && fs.existsSync(path.join(dir, it.file))) : [];
    } catch {
      return [];
    }
  };
  const save = (items: MediaItem[]) => {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = indexFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(items, null, 1));
    fs.renameSync(tmp, indexFile);
  };
  const readRaw = (req: http.IncomingMessage, limit: number) =>
    new Promise<Buffer>((resolve, reject) => {
      let size = 0;
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > limit) {
          reject(new Error('too large'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });

  async function handle(req: http.IncomingMessage, res: http.ServerResponse, url: URL, h: Helpers) {
    const method = req.method || 'GET';
    if (url.pathname === '/api/media' && method === 'GET') return h.sendJson(res, 200, { items: list() });
    if (url.pathname === '/api/media' && method === 'POST') {
      const kind = url.searchParams.get('kind') as MediaKind;
      if (kind !== 'music' && kind !== 'background') return h.sendJson(res, 400, { error: 'invalid kind' });
      const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const ext = TYPES[kind][type];
      if (!ext) return h.sendJson(res, 415, { error: 'unsupported type' });
      const items = list();
      if (items.length >= MAX_ITEMS) return h.sendJson(res, 409, { error: 'too many items' });
      let bytes: Buffer;
      try {
        bytes = await readRaw(req, LIMIT[kind]);
      } catch {
        return h.sendJson(res, 413, { error: 'too large' });
      }
      if (bytes.length < 64) return h.sendJson(res, 400, { error: 'empty file' });
      const id = randomUUID();
      const file = id + ext;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, file), bytes);
      const rawName = (url.searchParams.get('name') || '').replace(/[\u0000-\u001f]/g, '').trim();
      const tone = url.searchParams.get('tone');
      const item: MediaItem = {
        id,
        kind,
        name: (rawName || (kind === 'music' ? 'Piano' : 'Background')).slice(0, 80),
        file,
        url: '/media/' + file,
        size: bytes.length,
        ...(kind === 'background' && (tone === 'light' || tone === 'dark') ? { tone } : {}),
        addedAt: new Date().toISOString(),
      };
      save([...items, item]);
      return h.sendJson(res, 200, { item });
    }
    if (url.pathname === '/api/media/delete' && method === 'POST') {
      let id = '';
      try {
        id = String(JSON.parse(await h.readBody(req, 4096))?.id || '');
      } catch {
        return h.sendJson(res, 400, { error: 'invalid json' });
      }
      const items = list();
      const hit = items.find((it) => it.id === id);
      if (!hit) return h.sendJson(res, 404, { error: 'not found' });
      try {
        fs.unlinkSync(path.join(dir, hit.file));
      } catch {
        /* already gone */
      }
      save(items.filter((it) => it.id !== id));
      return h.sendJson(res, 200, { ok: true });
    }
    return h.sendJson(res, 404, { error: 'unknown endpoint' });
  }

  /** GET /media/<file> */
  function serve(req: http.IncomingMessage, res: http.ServerResponse, p: string, h: Helpers) {
    const name = p.slice('/media/'.length);
    if (!/^[0-9a-f-]{36}\.[a-z0-9]{2,4}$/.test(name)) return h.sendJson(res, 404, { error: 'not found' });
    return h.serveFile(req, res, path.join(dir, name), 'private, max-age=31536000, immutable');
  }

  return { handle, serve, list };
}
