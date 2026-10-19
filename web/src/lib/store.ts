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
let saving = false;
let dirty = false;

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
    const hadPlan = !!draft.plans[today];
    ensurePlan(draft, bank, today);
    emit({ ready: true, state: draft, bank, today, error: null });
    if (!hadPlan || draft.plans[today] !== state.plans[today]) scheduleSave(0);
  } catch (e) {
    emit({ error: e instanceof Error ? e.message : String(e) });
  }
}

/** Apply a mutation to a cloned draft of the state and autosave. Returns the callback's result. */
export function update<R>(fn: (draft: AppState, bank: BankIndex, today: string) => R, opts: { saveNow?: boolean } = {}): R {
  if (!snap.state || !snap.bank) throw new Error('state not ready');
  const draft = structuredClone(snap.state);
  const result = fn(draft, snap.bank, snap.today);
  emit({ state: draft });
  scheduleSave(opts.saveNow ? 0 : 500);
  return result;
}

function scheduleSave(delay: number) {
  dirty = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flush(), delay);
}

export async function flush(keepalive = false): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!dirty || !snap.state) return;
  if (saving) {
    scheduleSave(300);
    return;
  }
  saving = true;
  dirty = false;
  const body = JSON.stringify({ baseRevision, state: snap.state });
  emit({ save: 'saving' });
  try {
    const res = await fetch('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, keepalive: keepalive && body.length < 60000 });
    if (res.status === 409) {
      const { state } = (await res.json()) as { state: AppState };
      baseRevision = state.revision;
      emit({ state, save: 'conflict' });
      return;
    }
    if (!res.ok) throw new Error(String(res.status));
    const { revision } = (await res.json()) as { revision: number };
    baseRevision = revision;
    if (snap.state) snap.state.revision = revision;
    emit({ save: dirty ? 'saving' : 'saved' });
  } catch {
    dirty = true;
    emit({ save: 'error' });
    scheduleSave(3000);
  } finally {
    saving = false;
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
