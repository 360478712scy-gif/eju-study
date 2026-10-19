// Learner state persistence: one JSON document, atomic writes, optimistic
// concurrency by revision, rolling backups. The v1.4 state.json is never modified.
import fs from 'node:fs';
import path from 'node:path';
import { createInitialState, migrateV1 } from '../shared/migrate.ts';
import type { AppState } from '../shared/types.ts';

const STATE_FILE = 'state-v2.json';
const V1_FILE = 'state.json';
const BACKUP_DIR = 'backups-v2';
const MAX_BACKUPS = 80;
const BACKUP_INTERVAL_MS = 5 * 60 * 1000;

type PutResult =
  | { ok: true; revision: number }
  | { ok: false; status: number; error: string; current?: AppState };

export class StateStore {
  private dir: string;
  private file: string;
  private state: AppState;
  private lastBackupAt = 0;

  constructor(dir: string) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, STATE_FILE);
    this.state = this.load();
  }

  private load(): AppState {
    if (fs.existsSync(this.file)) {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw) as AppState;
      if (!parsed || parsed.version !== 2 || typeof parsed.revision !== 'number') {
        throw new Error(`学习记录 ${this.file} 格式异常，原文件已保留；请从 ${BACKUP_DIR} 恢复。`);
      }
      return parsed;
    }
    // First v2 start: import the v1.4 record if present (read-only), else start fresh.
    const v1Path = path.join(this.dir, V1_FILE);
    let next: AppState;
    if (fs.existsSync(v1Path)) {
      const v1 = JSON.parse(fs.readFileSync(v1Path, 'utf8'));
      next = migrateV1(v1, new Date());
    } else {
      next = createInitialState(new Date());
    }
    this.write(next);
    return next;
  }

  get(): AppState {
    return this.state;
  }

  put(baseRevision: unknown, incoming: unknown): PutResult {
    if (typeof baseRevision !== 'number') return { ok: false, status: 400, error: 'baseRevision required' };
    const candidate = incoming as AppState;
    if (!candidate || typeof candidate !== 'object' || candidate.version !== 2) {
      return { ok: false, status: 400, error: 'invalid state' };
    }
    if (baseRevision !== this.state.revision) {
      return { ok: false, status: 409, error: 'revision conflict', current: this.state };
    }
    const next: AppState = { ...candidate, revision: this.state.revision + 1, savedAt: new Date().toISOString() };
    this.backupMaybe();
    this.write(next);
    this.state = next;
    return { ok: true, revision: next.revision };
  }

  private write(next: AppState) {
    const tmp = `${this.file}.${process.pid}.tmp`;
    const fd = fs.openSync(tmp, 'w', 0o600);
    try {
      fs.writeSync(fd, JSON.stringify(next));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, this.file);
  }

  private backupMaybe(force = false) {
    const now = Date.now();
    if (!force && now - this.lastBackupAt < BACKUP_INTERVAL_MS) return;
    if (!fs.existsSync(this.file)) return;
    const dir = path.join(this.dir, BACKUP_DIR);
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date(now).toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(this.file, path.join(dir, `state-${stamp}-r${this.state.revision}.json`));
    this.lastBackupAt = now;
    const entries = fs.readdirSync(dir).filter((f) => f.startsWith('state-')).sort();
    for (const f of entries.slice(0, Math.max(0, entries.length - MAX_BACKUPS))) {
      fs.unlinkSync(path.join(dir, f));
    }
  }

  listBackups(): { file: string; bytes: number }[] {
    const dir = path.join(this.dir, BACKUP_DIR);
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('state-'))
      .sort()
      .reverse()
      .map((f) => ({ file: f, bytes: fs.statSync(path.join(dir, f)).size }));
  }

  flush() {
    // Writes are synchronous; nothing buffered. Kept for symmetry with shutdown hooks.
  }
}
