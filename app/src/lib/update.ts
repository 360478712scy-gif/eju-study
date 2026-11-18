// Updates from GitHub Releases, through the macOS shell (desktop/Chengxue.swift): the shell checks the
// latest release, downloads the zip, verifies it and swaps the app. Pages only read this store.
import { useSyncExternalStore } from 'react';

export interface UpdateInfo {
  mode: 'standalone' | 'dev';
  current: string;
  latest?: string;
  available: boolean;
  notes?: string;
  size?: number;
  publishedAt?: string;
  error?: string;
}
export type UpdatePhase = 'idle' | 'checking' | 'download' | 'verify' | 'install' | 'error';
type Snapshot = { info?: UpdateInfo; phase: UpdatePhase; fraction: number; message?: string; checkedAt: number; version?: string };

let snap: Snapshot = { phase: 'idle', fraction: 0, checkedAt: 0 };
const subs = new Set<() => void>();
const emit = (patch: Partial<Snapshot>) => {
  snap = { ...snap, ...patch };
  subs.forEach((f) => f());
};
export const useUpdate = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => snap,
    () => snap,
  );

/** The shell can check (both builds) — only the standalone build can install. */
export const canCheck = () => typeof window !== 'undefined' && !!window.ejuNative?.checkUpdate;

export async function check(force = false): Promise<UpdateInfo | undefined> {
  if (!canCheck()) return undefined;
  if (snap.phase === 'download' || snap.phase === 'verify' || snap.phase === 'install') return snap.info;
  if (!force && snap.info && Date.now() - snap.checkedAt < 10 * 60_000) return snap.info;
  emit({ phase: 'checking', message: undefined });
  try {
    const info = await window.ejuNative!.checkUpdate!();
    emit({ info, phase: 'idle', checkedAt: Date.now() });
    return info;
  } catch (e) {
    emit({ phase: 'idle', info: { mode: snap.info?.mode ?? 'dev', current: snap.info?.current ?? '', available: false, error: (e as Error).message } });
    return undefined;
  }
}

export async function install() {
  if (!window.ejuNative?.installUpdate || !snap.info?.available) return;
  emit({ phase: 'download', fraction: 0, message: undefined });
  try {
    await window.ejuNative.installUpdate();
  } catch (e) {
    emit({ phase: 'error', message: (e as Error).message });
  }
}

/** Version the running server reports (also works in the browser build). */
export async function loadVersion() {
  if (snap.version) return snap.version;
  try {
    const r = await fetch('/api/health');
    const v = ((await r.json()) as { version?: string }).version;
    if (v) emit({ version: v });
    return v;
  } catch {
    return undefined;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('eju-update-progress', (e) => {
    const d = ((e as CustomEvent).detail ?? {}) as { phase?: string; fraction?: string; message?: string };
    if (d.phase === 'download') emit({ phase: 'download', fraction: Math.max(0, Math.min(1, Number(d.fraction) || 0)) });
    else if (d.phase === 'verify' || d.phase === 'install') emit({ phase: d.phase, fraction: 1 });
    else if (d.phase === 'error') emit({ phase: 'error', message: d.message });
  });
}
