// Focus-mode top bar: exit, title, question strip, counters and timers.
import type { ReactNode } from 'react';
import type { Subject } from '@shared/types.ts';
import { Icon } from '../../components/Icon.tsx';
import { IconButton, SubjectTag } from '../../components/ui.tsx';
import { cx, fmtClock } from '../../lib/format.ts';
import { useClock, type StudyClock } from './clock.ts';

export type CellState = 'todo' | 'right' | 'wrong' | 'answered';
export interface StripCell {
  state: CellState;
  reachable: boolean;
  /** Exam mode: marked 没把握 / 猜的. Drawn as its own marker — the item may still be empty. */
  flag?: 'unsure' | 'guess';
}

const CELL_TITLE: Record<CellState, string> = {
  todo: '未作答',
  right: '答对',
  wrong: '答错',
  answered: '已作答',
};

export function cellTitle(c: StripCell): string {
  if (!c.flag) return CELL_TITLE[c.state];
  if (c.state === 'todo') return '未作答 · 已标记';
  return `${CELL_TITLE[c.state]} · ${c.flag === 'guess' ? '猜的' : '没把握'}`;
}

/** Top-bar controls should not keep focus after a click (Enter would press them again). */
const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();

export function ProgressStrip({ cells, current, onJump }: { cells: StripCell[]; current: number; onJump: (i: number) => void }) {
  return (
    <div className="pl-strip" role="navigation" aria-label="题目导航">
      {cells.map((c, i) => (
        <button
          key={i}
          type="button"
          className={cx('pl-seg', `is-${c.state}`, c.flag && 'has-flag', i === current && 'is-current', !c.reachable && 'is-locked')}
          onClick={() => c.reachable && onJump(i)}
          onMouseDown={keepFocus}
          title={`第 ${i + 1} 题 · ${i === current ? `当前 · ${cellTitle(c)}` : cellTitle(c)}`}
          tabIndex={-1}
        >
          <span />
        </button>
      ))}
    </div>
  );
}

/** Per-question time with a tiny ring against the target. */
function ItemTimer({ clock, saved, target, live }: { clock: StudyClock; saved: number; target: number; live: boolean }) {
  useClock(clock);
  const t = saved + (live ? clock.pendingItem() : 0);
  const frac = Math.min(1, t / Math.max(1, target));
  const over = t > target;
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <span className={cx('pl-timer', over && 'is-over')} title={`本题用时 · 目标 ${fmtClock(target)}`}>
      <svg width="18" height="18" viewBox="0 0 18 18" className="pl-timer-ring" aria-hidden>
        <circle cx="9" cy="9" r={r} className="pl-timer-track" />
        <circle cx="9" cy="9" r={r} className="pl-timer-fill" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 9 9)" />
      </svg>
      <span className="pl-timer-label">本题</span>
      <span className="num">{fmtClock(t)}</span>
    </span>
  );
}

function SessionTimer({ clock, elapsed, limit }: { clock: StudyClock; elapsed: number; limit?: number }) {
  useClock(clock);
  const t = elapsed + clock.pendingStudy();
  if (limit) {
    const left = Math.max(0, limit - t);
    return (
      <span className={cx('pl-countdown', left <= 60 ? 'is-danger' : left <= 300 && 'is-warning')} title="剩余时间">
        <Icon name="clock" size={15} />
        <span className="pl-timer-label">剩余</span>
        <span className="num">{fmtClock(left)}</span>
      </span>
    );
  }
  return (
    <span className="pl-timer pl-timer-total" title="本组累计用时（只计前台时间）">
      <Icon name="clock" size={14} />
      <span className="num">{fmtClock(t)}</span>
    </span>
  );
}

export function IdlePill({ clock }: { clock: StudyClock }) {
  useClock(clock);
  if (!clock.isIdle) return null;
  return (
    <div className="pl-idle" role="status">
      <Icon name="pause" size={13} />
      计时已暂停 · 动一下鼠标或键盘继续
    </div>
  );
}

export function TopBar({
  title,
  subject,
  exam,
  index,
  total,
  clock,
  elapsed,
  limit,
  itemSaved,
  itemTarget,
  itemLive,
  cells,
  onJump,
  onExit,
  actions,
}: {
  title: string;
  subject: Subject | 'mixed';
  exam: boolean;
  index: number;
  total: number;
  clock: StudyClock;
  elapsed: number;
  limit?: number;
  itemSaved: number;
  itemTarget: number;
  itemLive: boolean;
  cells: StripCell[];
  onJump: (i: number) => void;
  onExit: () => void;
  actions?: ReactNode;
}) {
  return (
    <header className="pl-top">
      <div className="pl-top-left">
        <IconButton icon="arrowLeft" label="退出（进度会保存）" onClick={onExit} />
        <div className="pl-top-title">
          <span className="pl-top-name" title={title}>
            {title}
          </span>
          <span className="pl-top-meta">
            <SubjectTag subject={subject} size="sm" />
            {exam && (
              <span className="pl-exam-tag">
                <Icon name="target" size={11} />
                {limit ? '限时' : '考试模式'}
              </span>
            )}
          </span>
        </div>
      </div>
      <div className="pl-top-center">
        <ProgressStrip cells={cells} current={index} onJump={onJump} />
      </div>
      <div className="pl-top-right">
        <span className="pl-count">
          第 <b className="num">{index + 1}</b> / <span className="num">{total}</span> 题
        </span>
        <ItemTimer clock={clock} saved={itemSaved} target={itemTarget} live={itemLive} />
        <SessionTimer clock={clock} elapsed={elapsed} limit={limit} />
        {actions}
      </div>
    </header>
  );
}
