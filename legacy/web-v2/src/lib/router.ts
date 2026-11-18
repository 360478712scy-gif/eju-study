// Hash router. The native shell only allows the "/" document, so every page lives in the hash.
import { useSyncExternalStore } from 'react';

export interface Route {
  path: string;
  parts: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [p, q = ''] = raw.split('?');
  const path = p.startsWith('/') ? p : '/' + p;
  return { path, parts: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q) };
}

let current = parse();
const listeners = new Set<() => void>();
window.addEventListener('hashchange', () => {
  current = parse();
  for (const l of listeners) l();
});

export function useRoute(): Route {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

/** Guards can veto navigation (e.g. an exam in progress). */
type Guard = (to: string) => boolean;
const guards = new Set<Guard>();
export function addNavGuard(g: Guard) {
  guards.add(g);
  return () => guards.delete(g);
}

export function navigate(to: string, opts: { replace?: boolean; force?: boolean } = {}) {
  if (!opts.force) for (const g of guards) if (!g(to)) return;
  const hash = '#' + (to.startsWith('/') ? to : '/' + to);
  if (opts.replace) window.location.replace(hash);
  else window.location.hash = hash;
}

export function href(to: string) {
  return '#' + (to.startsWith('/') ? to : '/' + to);
}
