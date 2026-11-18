import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StateStore } from './store.ts';
import { createCoach } from './coach.ts';

import { indexBank, type BankIndex } from '../shared/bank.ts';
import { bankReader } from './content.ts';
import { todayView, planView, practiceView, statsView, weeklyReview } from '../shared/selectors.ts';
import { reviewQueue } from '../shared/stats.ts';
import { studyDate, isValidDate } from '../shared/dates.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.EJU_DATA_DIR || path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 18763);
const HOST = '127.0.0.1';
function readVersion(): string {
  try {
    return fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim() || '3.0.0';
  } catch {
    return '3.0.0';
  }
}
export const APP_VERSION = readVersion();

const appDist = path.join(ROOT, 'app', 'dist');
const WEB_DIST = process.env.EJU_WEB_DIST
  ? path.resolve(process.env.EJU_WEB_DIST)
  : fs.existsSync(appDist)
    ? appDist
    : path.join(ROOT, 'web', 'dist');
const ASSETS_DIR = path.join(ROOT, 'public', 'assets');
const CONTENT_DIST = path.join(ROOT, 'content', 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
};

const contentBank = bankReader(process.env.EJU_CONTENT_FILE || path.join(CONTENT_DIST, 'bank.json'));
const store = new StateStore(DATA_DIR, contentBank());
let augmented: { base: BankIndex; count: number; index: BankIndex } | undefined;
function getBank() {
  const base = contentBank(),
    variants = Object.values(store.get().variants);
  if (!variants.length) return base;
  if (!augmented || augmented.base !== base || augmented.count !== variants.length) {
    augmented = {
      base,
      count: variants.length,
      index: indexBank({ ...base.bundle, items: [...base.bundle.items, ...variants] }),
    };
  }
  return augmented.index;
}
const coach = createCoach({
  root: ROOT,
  getItem: (id) => getBank().byId.get(id),
  config: () => ({ model: store.get().settings.coachModel, effort: store.get().settings.coachEffort }),
  weekly: (date) => weeklyReview(store.get(), getBank(), date),
  enabled: () => store.get().settings.coachEnabled,
});

function sendJson(res: http.ServerResponse, status: number, value: unknown, extra: Record<string, string> = {}) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    ...extra,
  });
  res.end(body);
}

function readBody(req: http.IncomingMessage, limit = 32 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Only accept requests addressed to this machine (blocks DNS-rebinding from web pages).
function hostAllowed(req: http.IncomingMessage): boolean {
  const port = req.socket.localPort;
  const host = (req.headers.host || '').toLowerCase();
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

// Mutating requests must come from our own origin (or from no browser origin at all, e.g. curl/tests).
function originAllowed(req: http.IncomingMessage): boolean {
  const port = req.socket.localPort;
  const origin = req.headers.origin;
  if (!origin || origin === 'null') return !origin;
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}

function safeJoin(base: string, rel: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    return null;
  }
  const target = path.resolve(base, '.' + path.posix.normalize('/' + decoded));
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  return target;
}

function serveFile(req: http.IncomingMessage, res: http.ServerResponse, file: string, cache: string) {
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    sendJson(res, 404, { error: 'not found' });
    return;
  }
  if (!st.isFile()) {
    sendJson(res, 404, { error: 'not found' });
    return;
  }
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const baseHeaders: Record<string, string | number> = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': cache,
    ETag: etag,
  };
  if (req.headers['if-none-match'] === etag && !req.headers.range) {
    res.writeHead(304, baseHeaders);
    res.end();
    return;
  }
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m || (m[1] === '' && m[2] === '')) {
      res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
      res.end();
      return;
    }
    let start: number;
    let end: number;
    if (m[1] === '') {
      const suffix = Number(m[2]);
      start = Math.max(0, st.size - suffix);
      end = st.size - 1;
    } else {
      start = Number(m[1]);
      end = m[2] === '' ? st.size - 1 : Math.min(Number(m[2]), st.size - 1);
    }
    if (start > end || start >= st.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      ...baseHeaders,
      'Content-Range': `bytes ${start}-${end}/${st.size}`,
      'Content-Length': end - start + 1,
    });
    if (req.method === 'HEAD') return void res.end();
    fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...baseHeaders, 'Content-Length': st.size });
  if (req.method === 'HEAD') return void res.end();
  fs.createReadStream(file).pipe(res);
}

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const method = req.method || 'GET';
  const p = url.pathname;

  if (p === '/api/health' && method === 'GET') {
    return sendJson(res, 200, { app: 'eju-study', version: APP_VERSION, ok: true });
  }

  if (method !== 'GET' && method !== 'HEAD' && !originAllowed(req)) {
    return sendJson(res, 403, { error: 'origin not allowed' });
  }

  if (p === '/api/state' && method === 'GET') {
    return sendJson(res, 200, { state: store.get() });
  }

  if (
    method === 'POST' &&
    String(req.headers['content-type'] || '')
      .split(';')[0]
      .trim()
      .toLowerCase() !== 'application/json'
  ) {
    return sendJson(res, 415, { error: 'json required' });
  }
  if (p === '/api/action' && method === 'POST') {
    let body;
    try {
      body = JSON.parse(await readBody(req, 512 * 1024));
    } catch {
      return sendJson(res, 400, { error: 'invalid json' });
    }
    const r = store.transact(
      body?.baseRevision,
      body?.action,
      getBank(),
      new Date(),
      body?.action?.type === 'startVariant' ? coach.variant(body.action.jobId) : undefined,
    );
    if (!r.ok) return sendJson(res, r.status, { error: r.error, state: r.current });
    return sendJson(res, 200, { revision: r.revision, result: r.result });
  }
  if (method === 'GET') {
    const date = url.searchParams.get('date') ?? studyDate();
    const asOf = url.searchParams.get('asOf') ?? studyDate();
    if (!isValidDate(date) || !isValidDate(asOf)) return sendJson(res, 400, { error: 'invalid date' });
    const s = store.get(),
      bank = getBank();
    if (p === '/api/today') return sendJson(res, 200, todayView(s, bank, date));
    if (p === '/api/plan') return sendJson(res, 200, planView(s, bank, date, asOf));
    if (p === '/api/practice') return sendJson(res, 200, practiceView(bank, Object.fromEntries(url.searchParams)));
    if (p === '/api/review')
      return sendJson(res, 200, {
        queue: reviewQueue(s, bank, date, url.searchParams.get('scope') === 'all' ? 'all' : 'due'),
      });
    if (p === '/api/mocks') return sendJson(res, 200, { papers: bank.papers, results: s.mocks });
    if (p === '/api/notes')
      return sendJson(res, 200, {
        notes: [...bank.topics.keys()].map((topic) => ({
          topic,
          body: bank.notesByTopic.get(topic)?.body ?? '',
          text: s.notes[topic] ?? '',
        })),
      });
    if (p === '/api/stats') return sendJson(res, 200, statsView(s, bank, date));
  }

  if (p === '/api/export' && method === 'GET') {
    const stamp = new Date().toISOString().slice(0, 10);
    return sendJson(res, 200, store.get(), {
      'Content-Disposition': `attachment; filename="chengxue-eju-${stamp}.json"`,
    });
  }

  if (p === '/api/backups' && method === 'GET') {
    return sendJson(res, 200, { backups: store.listBackups() });
  }

  if (p.startsWith('/api/coach/')) {
    return coach.handle(req, res, url, { readBody, sendJson });
  }

  return sendJson(res, 404, { error: 'unknown endpoint' });
}

const server = http.createServer(async (req, res) => {
  try {
    if (!hostAllowed(req)) return sendJson(res, 421, { error: 'host not allowed' });
    const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
    const p = url.pathname;
    if (p.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method not allowed' });

    if (p.startsWith('/assets/')) {
      const built = safeJoin(WEB_DIST, p.slice(1));
      if (built && fs.existsSync(built) && fs.statSync(built).isFile()) return serveFile(req, res, built, 'no-cache');
      const file = safeJoin(ASSETS_DIR, p.slice('/assets/'.length));
      if (!file) return sendJson(res, 400, { error: 'bad path' });
      return serveFile(req, res, file, 'public, max-age=86400');
    }
    if (p === '/content/bank.json') {
      if (req.method === 'HEAD') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end();
      }
      return sendJson(res, 200, getBank().bundle);
    }
    if (p.startsWith('/content/')) {
      const file = safeJoin(CONTENT_DIST, p.slice('/content/'.length));
      if (!file) return sendJson(res, 400, { error: 'bad path' });
      return serveFile(req, res, file, 'no-cache');
    }
    // Built web app; hashed assets are immutable, everything else falls back to index.html.
    const rel = p === '/' ? 'index.html' : p.slice(1);
    const file = safeJoin(WEB_DIST, rel);
    if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
      const immutable = rel.startsWith('app/') ? 'public, max-age=31536000, immutable' : 'no-cache';
      return serveFile(req, res, file, immutable);
    }
    return serveFile(req, res, path.join(WEB_DIST, 'index.html'), 'no-cache');
  } catch (err) {
    console.error('[server] request failed', err);
    if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  const address = server.address();
  console.log(
    `[${new Date().toISOString()}] 澄学 EJU ${APP_VERSION} listening on http://${HOST}:${typeof address === 'object' && address ? address.port : PORT}`,
  );
});

function shutdown() {
  coach.stop();
  store.flush();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
