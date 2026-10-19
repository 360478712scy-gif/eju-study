// Global client store: learner state + content bank, autosave to the local server.
// Components read with useApp(selector); mutations go through update(draft => …),
// which clones, applies a shared/actions.ts transition and schedules a save.
import { useSyncExternalStore } from 'react';
import type { AppState, ContentBundle } from '@shared/types.ts';
import { indexBank, type BankIndex } from '@shared/bank.ts';
import { studyDate } from '@shared/dates.ts';
import { ensurePlan } from '@shared/actions.ts';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

export interface AppSnapshot {
  ready: boolean;
  error: string | null;
  state: AppState | null;
  bank: BankIndex | null;
  today: string;
  save: SaveStatus;
}

let snap: AppSnapshot = { ready: false, error: null, state: null, bank: null, today: studyDate(), save: 'idle' };
const listeners = new Set<() => void>();
let baseRevision = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> | null = null;
let dirty = false;
type Mutation = (draft: AppState, bank: BankIndex, today: string) => unknown;
/** Mutations applied since the last acknowledged save, replayed on the server copy after a conflict. */
let pending: Mutation[] = [];

function emit(next: Partial<AppSnapshot>) {
  snap = { ...snap, ...next };
  for (const l of listeners) l();
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getSnapshot(): AppSnapshot {
  return snap;
}

export function useApp<T>(selector: (s: AppSnapshot) => T): T {
  return useSyncExternalStore(subscribe, () => selector(snap));
}

/** Non-null state/bank for pages rendered after boot. */
export function useReady() {
  return useApp((s) => s) as AppSnapshot & { state: AppState; bank: BankIndex };
}

export async function boot() {
  try {
    const [stateRes, bankRes] = await Promise.all([fetch('/api/state'), fetch('/content/bank.json')]);
    if (!stateRes.ok) throw new Error(`学习记录读取失败（${stateRes.status}）`);
    if (!bankRes.ok) throw new Error(`题库读取失败（${bankRes.status}）`);
    const { state } = (await stateRes.json()) as { state: AppState };
    const bundle = (await bankRes.json()) as ContentBundle;
    const bank = indexBank(bundle);
    baseRevision = state.revision;
    const today = studyDate();
    const draft = structuredClone(state);
    const before = draft.plans[today]?.generatedAt;
    ensurePlan(draft, bank, today);
    emit({ ready: true, state: draft, bank, today, error: null });
    // Only write when a plan was actually created; merely opening the app must not bump the revision.
    if (draft.plans[today]?.generatedAt !== before) {
      pending.push((d, b, t) => ensurePlan(d, b, t));
      scheduleSave(0);
    }
  } catch (e) {
    emit({ error: e instanceof Error ? e.message : String(e) });
  }
}

/** Apply a mutation to a cloned draft of the state and autosave. Returns the callback's result. */
export function update<R>(fn: (draft: AppState, bank: BankIndex, today: string) => R, opts: { saveNow?: boolean } = {}): R {
  if (!snap.state || !snap.bank) throw new Error('state not ready');
  const draft = structuredClone(snap.state);
  const result = fn(draft, snap.bank, snap.today);
  pending.push(fn);
  emit({ state: draft });
  scheduleSave(opts.saveNow ? 0 : 500);
  return result;
}

function scheduleSave(delay: number) {
  dirty = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flush(), delay);
}

/** Save now; resolves once everything changed so far is on disk (or the save failed). */
export async function flush(keepalive = false): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (inFlight) {
    await inFlight;
    if (dirty) return flush(keepalive);
    return;
  }
  if (!dirty || !snap.state) return;
  inFlight = doSave(keepalive);
  try {
    await inFlight;
  } finally {
    inFlight = null;
  }
  if (dirty && snap.save !== 'error') return flush(keepalive);
}

async function doSave(keepalive: boolean): Promise<void> {
  if (!snap.state) return;
  dirty = false;
  const sent = pending.length;
  const body = JSON.stringify({ baseRevision, state: snap.state });
  emit({ save: 'saving' });
  try {
    const res = await fetch('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, keepalive: keepalive && body.length < 60000 });
    if (res.status === 409) {
      // Another window saved first: replay this window's changes on top of the newer record.
      const { state: server } = (await res.json()) as { state: AppState };
      baseRevision = server.revision;
      const bank = snap.bank;
      let merged = structuredClone(server);
      if (bank) {
        for (const fn of pending) {
          try {
            fn(merged, bank, snap.today);
          } catch {
            /* a change that no longer applies is dropped */
          }
        }
        ensurePlan(merged, bank, snap.today);
      } else {
        merged = server;
      }
      emit({ state: merged, save: 'conflict' });
      dirty = pending.length > 0;
      if (dirty) scheduleSave(200);
      return;
    }
    if (!res.ok) throw new Error(String(res.status));
    const { revision } = (await res.json()) as { revision: number };
    baseRevision = revision;
    pending = pending.slice(sent);
    if (snap.state) emit({ state: { ...snap.state, revision }, save: dirty ? 'saving' : 'saved' });
  } catch {
    dirty = true;
    emit({ save: 'error' });
    scheduleSave(3000);
  }
}

/** Keep `today` current (day boundary is 04:00) and make sure its plan exists. */
export function tickToday() {
  const t = studyDate();
  if (t !== snap.today && snap.state && snap.bank) {
    emit({ today: t });
    update((d, bank) => ensurePlan(d, bank, t));
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => void flush(true));
  window.addEventListener('eju-window-hidden', () => void flush(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush(true);
  });
}
