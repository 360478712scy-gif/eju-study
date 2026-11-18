// Keyboard helpers: never steal keys from text fields, the IME or focused controls.

export function isTextField(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Enter / Space on a focused button or link should activate that control, not a player shortcut —
 * except for controls marked with data-hotkeys (options, confidence, keypad), which only take clicks.
 */
export function isFocusedControl(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const ctl = t.closest('button, a, summary, [role="button"], [role="tab"]');
  return !!ctl && !ctl.closest('[data-hotkeys]');
}

/** Map a keyboard event to a mark-sheet character, if it is one. */
export function markKey(e: KeyboardEvent): string | null {
  if (/^[0-9]$/.test(e.key)) return e.key;
  if (e.key === '-' || e.key === '−' || e.key === 'ー' || e.code === 'Minus' || e.code === 'NumpadSubtract') return '-';
  if (/^Numpad[0-9]$/.test(e.code)) return e.code.slice(6);
  return null;
}
