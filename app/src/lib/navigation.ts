import { useEffect, useState } from 'react';

export const routes = ['today', 'plan', 'practice', 'review', 'mock', 'notes', 'insights'] as const;
export type SectionName = (typeof routes)[number] | 'settings';
export const link = (page: SectionName) => page === 'today' ? '#/' : '#/' + page;
export const itemLink = (id: string) => '#/session/' + encodeURIComponent(id);
export const noteLink = (topic: string) => link('notes') + '?' + new URLSearchParams({ topic });
export function go(hash: string) { window.location.hash = hash; }

export function useHash() {
  const [hash, setHash] = useState(() => window.location.hash || '#/');
  useEffect(() => {
    const update = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return hash;
}

export function parseRoute(hash: string) {
  const [path, query] = hash.replace(/^#\/?/, '').split('?');
  const [name, ...tail] = path.split('/');
  const arg = tail.join('/');
  let id = '';
  try { id = decodeURIComponent(arg); } catch { /* invalid hash */ }
  return { name: name || 'today', id, params: new URLSearchParams(query) };
}

export function isTyping(event: KeyboardEvent) {
  return event.isComposing || (event.target instanceof HTMLElement && Boolean(event.target.closest('input, textarea, select, [contenteditable]')));
}
