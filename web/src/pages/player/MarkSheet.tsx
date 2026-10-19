// EJU mark sheet for "blanks" items: one cell per letter, grouped like the boxes in the stem,
// plus a bubble row (− 0–9) for the active letter that works like the real answer sheet.
import type { BlankGroupResult } from '@shared/grading.ts';
import { Icon } from '../../components/Icon.tsx';
import { Kbd } from '../../components/ui.tsx';
import { cx } from '../../lib/format.ts';

const MARKS = ['-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function MarkSheet({
  groups,
  values,
  active,
  onActivate,
  onMark,
  onErase,
  results,
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
}) {
  const editable = !!onMark && !results;
  const letters = groups.flatMap((g) => [...g]);
  const filled = letters.filter((l) => values[l]).length;
  const byGroup = new Map((results || []).map((r) => [r.group, r]));
  const cur = active && letters.includes(active) ? active : null;

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
          <span className={cx('pl-sheet-count num', filled === letters.length && 'is-full')}>
            已填 {filled} / {letters.length}
          </span>
        )}
      </div>

      <div className="pl-sheet-groups">
        {groups.map((g) => {
          const r = byGroup.get(g);
          const isActiveGroup = !!cur && g.includes(cur);
          return (
            <div key={g} className={cx('pl-grp', isActiveGroup && editable && 'is-active', r && (r.correct ? 'is-right' : 'is-wrong'))}>
              <div className="pl-grp-cells">
                {[...g].map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={cx('pl-cell', cur === l && editable && 'is-active', values[l] && 'is-filled')}
                    onClick={() => onActivate?.(l)}
                    onMouseDown={(e) => e.preventDefault()}
                    disabled={!editable}
                    aria-label={`格子 ${l}${values[l] ? `：${values[l]}` : ''}`}
                  >
                    <span className="pl-cell-letter">{l}</span>
                    <span className="pl-cell-val num">{values[l] === '-' ? '−' : values[l] || ''}</span>
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
            <span>填入并跳到下一格</span>
            <Kbd>⌫</Kbd>
            <span>删除</span>
            <Kbd>↑↓</Kbd>
            <span>换格</span>
          </div>
        </div>
      )}
    </div>
  );
}
