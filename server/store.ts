// Learner state persistence: one JSON document, atomic writes, optimistic
// concurrency by revision, rolling backups. The v1.4 state.json is never modified.
import fs from 'node:fs';
import path from 'node:path';
import { createInitialState, migrateCoachDefaults, migrateV2 } from '../shared/migrate.ts';
import { DEFAULT_NEW_CARDS_PER_DAY, type AppState, type Item } from '../shared/types.ts';

import type { BankIndex } from '../shared/bank.ts';
import { applyAction, type Action } from '../shared/actions.ts';

const STATE_FILE = 'state-v3.json';
const V2_FILE = 'state-v2.json';
const BACKUP_DIR = 'backups-v3';
const MAX_BACKUPS = 80;
const BACKUP_INTERVAL_MS = 5 * 60 * 1000;

type PutResult =
  | { ok: true; revision: number; result: unknown }
  | { ok: false; status: number; error: string; current?: AppState };

export class StateStore {
  private dir: string;
  private file: string;
  private state: AppState;
  private lastBackupAt = 0;

  constructor(dir: string, bank: BankIndex) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, STATE_FILE);
    this.state = this.load(bank);
  }

  private load(bank: BankIndex): AppState {
    if (fs.existsSync(this.file)) {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw) as AppState;
      if (!parsed || parsed.version !== 3 || typeof parsed.revision !== 'number') {
        throw new Error(`学习记录 ${this.file} 格式异常，原文件已保留；请从 ${BACKUP_DIR} 恢复。`);
      }
      parsed.settings.newCardsPerDay ??= DEFAULT_NEW_CARDS_PER_DAY;
      if (migrateCoachDefaults(parsed)) this.write(parsed);
      return parsed;
    }
    const source = path.join(this.dir, V2_FILE);
    const next = fs.existsSync(source)
      ? migrateV2(JSON.parse(fs.readFileSync(source, 'utf8')), bank)
      : createInitialState();
    this.write(next);
    return next;
  }

  get(): AppState {
    return this.state;
  }

  transact(baseRevision: unknown, action: Action, bank: BankIndex, now = new Date(), variant?: Item): PutResult {
    if (!Number.isInteger(baseRevision)) return { ok: false, status: 400, error: 'baseRevision required' };
    if (baseRevision !== this.state.revision)
      return { ok: false, status: 409, error: 'revision conflict', current: this.state };
    const next = structuredClone(this.state);
    let result: unknown;
    try {
      result = applyAction(next, bank, action, now, variant);
    } catch (err) {
      return { ok: false, status: 400, error: err instanceof Error ? err.message : 'invalid action' };
    }
    next.revision++;
    next.savedAt = now.toISOString();
    this.backupMaybe();
    this.write(next);
    this.state = next;
    return { ok: true, revision: next.revision, result };
  }

  private write(next: AppState) {
    const tmp = `${this.file}.${process.pid}.tmp`;
    const fd = fs.openSync(tmp, 'w', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(next));
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
    const entries = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('state-'))
      .sort();
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
