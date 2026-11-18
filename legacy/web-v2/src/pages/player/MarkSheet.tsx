// EJU mark sheet for "blanks" items: one cell per letter, grouped like the boxes in the stem,
// plus a keypad (− 0–9) for the active letter that works like the real answer sheet.
// After grading every cell shows the right digit; a wrong one keeps the learner's digit small,
// struck through, in its corner.
import { normalizeMark, type BlankGroupResult } from '@shared/grading.ts';
import { Icon } from '../../components/Icon.tsx';
import { IconButton, Kbd } from '../../components/ui.tsx';
import { cx } from '../../lib/format.ts';

const MARKS = ['-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Small padlock (the icon set has none). */
function LockGlyph({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden className="pl-lock-glyph">
      <rect x="2" y="5.2" width="8" height="5.8" rx="1.4" fill="currentColor" />
      <path d="M4 5.4V3.9a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/** Letters as alphabetical runs: ["A","B","C","G"] → "A–C、G". */
function span(letters: string[]): string {
  const sorted = [...letters].sort();
  const runs: string[][] = [];
  for (const l of sorted) {
    const last = runs[runs.length - 1];
    if (last && l.charCodeAt(0) === last[last.length - 1].charCodeAt(0) + 1) last.push(l);
    else runs.push([l]);
  }
  return runs.map((r) => (r.length === 1 ? r[0] : r.length === 2 ? `${r[0]}、${r[1]}` : `${r[0]}–${r[r.length - 1]}`)).join('、');
}

/** One mark-sheet character for display (typographic minus). */
function show(v: string | undefined): string {
  const c = normalizeMark(v ?? '');
  return c === '-' ? '−' : c;
}

/** Opens the ⌘/ shortcut sheet (App listens for the key). */
export function openShortcuts() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', metaKey: true, bubbles: true }));
}

export function MarkSheet({
  groups,
  values,
  active,
  onActivate,
  onMark,
  onErase,
  results,
  locked,
  hints,
}: {
  groups: string[];
  values: Record<string, string>;
  /** Active letter (cell). */
  active: string | null;
  onActivate?: (letter: string) => void;
  onMark?: (ch: string) => void;
  onErase?: () => void;
  /** After grading: per-group result. */
  results?: BlankGroupResult[];
  /** Re-test: letters kept from the last correct attempt (pre-filled, not editable). */
  locked?: Record<string, string>;
  /** First sessions: spell out the keys under the keypad. */
  hints?: boolean;
}) {
  const editable = !!onMark && !results;
  const letters = groups.flatMap((g) => [...g]);
  const isLocked = (l: string) => !!locked && l in locked;
  const open = letters.filter((l) => !isLocked(l));
  const lockedLetters = letters.filter(isLocked);
  const filled = open.filter((l) => values[l]).length;
  const byGroup = new Map((results || []).map((r) => [r.group, r]));
  const cur = active && letters.includes(active) && !isLocked(active) ? active : null;
  const noFocus = (e: { preventDefault: () => void }) => e.preventDefault();

  return (
    <div className={cx('pl-sheet', !editable && 'is-readonly', results && 'is-graded')} data-hotkeys>
      <div className="pl-sheet-head">
        <span className="pl-sheet-title">答题卡</span>
        {results ? (
          <span className="pl-sheet-count">
            对 <span className="num">{results.filter((r) => r.correct).length}</span> / <span className="num">{results.length}</span> 组
          </span>
        ) : (
          <span className={cx('pl-sheet-count', filled === open.length && 'is-full')}>
            已填 <span className="num">{filled}</span> / <span className="num">{open.length}</span>
          </span>
        )}
        {editable && !hints && <IconButton icon="keyboard" label="快捷键（⌘/）" size="sm" className="pl-sheet-keys" onClick={openShortcuts} onMouseDown={noFocus} />}
      </div>

      {lockedLetters.length > 0 && !results && (
        <div className="pl-sheet-lock">
          <LockGlyph size={11} />
          <span>
            {span(lockedLetters)} 上次已答对，沿用；这次只做 {span(open)}
          </span>
        </div>
      )}

      <div className="pl-sheet-groups">
        {groups.map((g) => {
          const r = byGroup.get(g);
          const isActiveGroup = !!cur && g.includes(cur);
          const groupLocked = [...g].every(isLocked);
          return (
            <div key={g} className={cx('pl-grp', isActiveGroup && editable && 'is-active', groupLocked && 'is-locked', r && (r.correct ? 'is-right' : 'is-wrong'))}>
              <div className="pl-grp-cells">
                {[...g].map((l, k) => {
                  const expected = r ? r.expected[k] : undefined;
                  const got = r ? normalizeMark(values[l] ?? '') : '';
                  const wrongCell = !!r && got !== expected;
                  return (
                    <button
                      key={l}
                      type="button"
                      className={cx('pl-cell', cur === l && editable && 'is-active', values[l] && 'is-filled', isLocked(l) && 'is-locked', wrongCell && 'is-wrong')}
                      onClick={() => onActivate?.(l)}
                      onMouseDown={noFocus}
                      disabled={!editable || isLocked(l)}
                      aria-label={
                        r
                          ? `格子 ${l}：正确 ${show(expected)}${wrongCell ? `，你填了 ${got ? show(got) : '空'}` : ''}`
                          : `格子 ${l}${values[l] ? `：${values[l]}` : ''}${isLocked(l) ? '（已答对，锁定）' : ''}`
                      }
                    >
                      <span className="pl-cell-letter">{l}</span>
                      {isLocked(l) && !r && (
                        <span className="pl-cell-lock">
                          <LockGlyph size={9} />
                        </span>
                      )}
                      {wrongCell && <s className="pl-cell-mine num">{got ? show(got) : '空'}</s>}
                      <span className="pl-cell-val num">{r ? show(expected) : show(values[l])}</span>
                    </button>
                  );
                })}
              </div>
              {r && (
                <span className={cx('pl-grp-verdict', r.correct ? 'is-right' : 'is-wrong')} role="img" aria-label={r.correct ? `${g} 对` : `${g} 错`}>
                  <Icon name={r.correct ? 'check' : 'x'} size={13} style={{ strokeWidth: 2.4 }} />
                </span>
              )}
            </div>
          );
        })}
      </div>

      {editable && (
        <div className="pl-pad">
          <div className="pl-pad-head">
            <span className="pl-pad-letter">{cur ?? '·'}</span>
            <span className="pl-pad-tip">{cur ? '选一个数字，或直接按键盘' : '点一个格子开始'}</span>
          </div>
          <div className="pl-pad-keys">
            {MARKS.map((m) => (
              <button
                key={m}
                type="button"
                className={cx('pl-bubble', cur && normalizeMark(values[cur] ?? '') === m && 'is-on')}
                onClick={() => onMark?.(m)}
                onMouseDown={noFocus}
                disabled={!cur}
                aria-label={m === '-' ? '负号' : m}
              >
                {m === '-' ? '−' : m}
              </button>
            ))}
            <button type="button" className="pl-bubble pl-bubble-erase" onClick={onErase} onMouseDown={noFocus} disabled={!cur} aria-label="删除（⌫）">
              <Icon name="arrowLeft" size={15} />
            </button>
          </div>
          {hints && (
            <div className="pl-sheet-hint">
              <span>
                <Kbd>0–9</Kbd> <Kbd>−</Kbd> 填写
              </span>
              <span>
                <Kbd>⌫</Kbd> 删除
              </span>
              <span>
                <Kbd>↑</Kbd> <Kbd>↓</Kbd> 换格
              </span>
              <span>点题中的方框也能跳转</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
