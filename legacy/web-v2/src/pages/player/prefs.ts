// Per-viewer player conveniences kept in browser storage. The page works the same without them.

/**
 * Key hints (按 1–4 选择, the keypad legend) are spelled out during the learner's first three
 * sessions only; after that a small keyboard button opens the ⌘/ sheet instead.
 */
const HINT_KEY = 'eju-player-hint-sessions';
const HINT_SESSIONS = 3;

export function hintsFor(sessionId: string): boolean {
  try {
    const seen: string[] = JSON.parse(localStorage.getItem(HINT_KEY) || '[]');
    if (seen.includes(sessionId)) return seen.indexOf(sessionId) < HINT_SESSIONS;
    if (seen.length >= HINT_SESSIONS) return false;
    seen.push(sessionId);
    localStorage.setItem(HINT_KEY, JSON.stringify(seen));
    return true;
  } catch {
    return false;
  }
}

/** Japanese reading passages: 明朝 (as on the real paper) or 黑体. */
export type JaFont = 'mincho' | 'gothic';
const FONT_KEY = 'eju-ja-reading-font';

export function readJaFont(): JaFont {
  try {
    return localStorage.getItem(FONT_KEY) === 'gothic' ? 'gothic' : 'mincho';
  } catch {
    return 'mincho';
  }
}

export function writeJaFont(f: JaFont) {
  try {
    localStorage.setItem(FONT_KEY, f);
  } catch {
    /* a convenience only */
  }
}
