// EJU mark sheet for "blanks" items: one cell per letter, grouped like the boxes in the stem,
// plus a bubble row (− 0–9) for the active letter that works like the real answer sheet.
import { normalizeMark, type BlankGroupResult } from '@shared/grading.ts';
import { Icon } from '../../components/Icon.tsx';
import { Kbd } from '../../components/ui.tsx';
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
  return runs.map((r) => (r.length === 1 ? r[0] : r.length === 2 ? `${r[0]}${r[1]}` : `${r[0]}–${r[r.length - 1]}`)).join('、');
}

/** One mark-sheet character for display (typographic minus). */
function show(v: string | undefined): string {
  const c = normalizeMark(v ?? '');
  return c === '-' ? '−' : c;
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
}) {
  const editable = !!onMark && !results;
  const letters = groups.flatMap((g) => [...g]);
  const isLocked = (l: string) => !!locked && l in locked;
  const open = letters.filter((l) => !isLocked(l));
  const lockedLetters = letters.filter(isLocked);
  const filled = open.filter((l) => values[l]).length;
  const byGroup = new Map((results || []).map((r) => [r.group, r]));
  const cur = active && letters.includes(active) && !isLocked(active) ? active : null;

  return (
    <div className={cx('pl-sheet', !editable && 'is-readonly')} data-hotkeys>
      <div className="pl-sheet-head">
        <span className="pl-sheet-title">
          <Icon name="grid" size={14} />
          答题卡
        </span>
        {results ? (
          <span className="pl-sheet-count num">
            对 {results.filter((r) => r.correct).length} / {results.length} 组
          </span>
        ) : (
          <span className={cx('pl-sheet-count num', filled === open.length && 'is-full')}>
            已填 {filled} / {open.length}
          </span>
        )}
      </div>

      {lockedLetters.length > 0 && !results && (
        <div className="pl-sheet-lock">
          <span className="pl-lock-tag">
            <LockGlyph size={11} />
            已答对·锁定
          </span>
          <span>
            {span(lockedLetters)} 沿用上次的答案，只需重做 {span(open)}
          </span>
        </div>
      )}

      <div className="pl-sheet-groups">
        {groups.map((g) => {
          const r = byGroup.get(g);
          const isActiveGroup = !!cur && g.includes(cur);
          const groupLocked = [...g].every(isLocked);
          return (
            <div
              key={g}
              className={cx('pl-grp', isActiveGroup && editable && 'is-active', groupLocked && 'is-locked', r && (r.correct ? 'is-right' : 'is-wrong'))}
              title={groupLocked ? '上次已答对，已锁定' : undefined}
            >
              <div className="pl-grp-cells">
                {[...g].map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={cx('pl-cell', cur === l && editable && 'is-active', values[l] && 'is-filled', isLocked(l) && 'is-locked')}
                    onClick={() => onActivate?.(l)}
                    onMouseDown={(e) => e.preventDefault()}
                    disabled={!editable || isLocked(l)}
                    aria-label={`格子 ${l}${values[l] ? `：${values[l]}` : ''}${isLocked(l) ? '（已答对，锁定）' : ''}`}
                  >
                    <span className="pl-cell-letter">{l}</span>
                    {isLocked(l) && (
                      <span className="pl-cell-lock">
                        <LockGlyph size={9} />
                      </span>
                    )}
                    <span className="pl-cell-val num">{show(values[l])}</span>
                  </button>
                ))}
              </div>
              {r && !r.correct && (
                <div className="pl-grp-fix num" title="正确答案">
                  <Icon name="check" size={11} />
                  {r.expected.replace(/-/g, '−')}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editable && (
        <div className="pl-bubbles">
          <div className="pl-bubbles-head">
            <span className="pl-bubbles-cur">
              <span className="pl-bubbles-letter">{cur ?? '·'}</span>
              <span className="faint">{cur ? '选一个，或直接按键盘' : '点一个格子开始'}</span>
            </span>
            <button type="button" className="pl-erase" onClick={onErase} onMouseDown={(e) => e.preventDefault()} disabled={!cur} title="删除（⌫）">
              <Icon name="arrowLeft" size={14} />
              删除
            </button>
          </div>
          <div className="pl-bubble-row">
            {MARKS.map((m) => (
              <button
                key={m}
                type="button"
                className={cx('pl-bubble', cur && values[cur] === m && 'is-on')}
                onClick={() => onMark?.(m)}
                onMouseDown={(e) => e.preventDefault()}
                disabled={!cur}
                aria-label={m === '-' ? '负号' : m}
              >
                {m === '-' ? '−' : m}
              </button>
            ))}
          </div>
          <div className="pl-sheet-hint">
            <Kbd>0–9</Kbd>
            <Kbd>−</Kbd>
            <span>填写</span>
            <Kbd>⌫</Kbd>
            <span>删除</span>
            <Kbd>↑↓</Kbd>
            <span>换格</span>
            <span className="pl-sheet-hint-tip">点题中的方框也能跳转</span>
          </div>
        </div>
      )}
    </div>
  );
}
