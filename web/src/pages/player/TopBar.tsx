// Focus-mode top bar: one line (exit · subject dot + title · count · timers · actions) with the
// question track as a 3px segmented line on its bottom edge.
import type { ReactNode } from 'react';
import type { Subject } from '@shared/types.ts';
import { Icon } from '../../components/Icon.tsx';
import { IconButton, SubjectDot, Tooltip } from '../../components/ui.tsx';
import { cx, fmtClock } from '../../lib/format.ts';
import { useClock, type StudyClock } from './clock.ts';

export type CellState = 'todo' | 'right' | 'wrong' | 'answered';
export interface StripCell {
  state: CellState;
  reachable: boolean;
  /** Exam mode: marked for a second look. Drawn as its own marker — the item may still be empty. */
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
  return `${CELL_TITLE[c.state]} · 已标记`;
}

/** Top-bar controls should not keep focus after a click (Enter would press them again). */
const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();

/** The question track: full width on the bar's bottom edge; each segment jumps to its question. */
export function ProgressStrip({ cells, current, onJump }: { cells: StripCell[]; current: number; onJump: (i: number) => void }) {
  if (cells.length <= 1) return null;
  return (
    <div className="pl-strip" role="navigation" aria-label="题目导航">
      {cells.map((c, i) => (
        <Tooltip key={i} side="bottom" label={`第 ${i + 1} 题 · ${cellTitle(c)}`}>
          <button
            type="button"
            className={cx('pl-seg', `is-${c.state}`, c.flag && 'has-flag', i === current && 'is-current', !c.reachable && 'is-locked')}
            onClick={() => c.reachable && onJump(i)}
            onMouseDown={keepFocus}
            aria-label={`第 ${i + 1} 题 · ${cellTitle(c)}`}
            aria-current={i === current ? 'step' : undefined}
            tabIndex={-1}
          >
            <span />
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

/** Per-question time: "本题 0:12" over a 2px line that fills toward the target (warning past it). */
function ItemTimer({ clock, saved, target, live, total }: { clock: StudyClock; saved: number; target: number; live: boolean; total?: number }) {
  useClock(clock);
  const t = saved + (live ? clock.pendingItem() : 0);
  const frac = Math.min(1, t / Math.max(1, target));
  const over = t > target;
  const tip = `本题用时 · 目标 ${fmtClock(target)}${total !== undefined ? ` · 本组共 ${fmtClock(total)}` : ''}`;
  return (
    <Tooltip label={tip} side="bottom">
      <span className={cx('pl-timer', over && 'is-over')} tabIndex={-1}>
        <Icon name="timer" size={13} className="pl-timer-icon" />
        <span className="pl-timer-label">本题</span>
        <span className="pl-timer-value num">{fmtClock(t)}</span>
        <span className="pl-timer-line" aria-hidden>
          <i style={{ width: `${frac * 100}%` }} />
        </span>
      </span>
    </Tooltip>
  );
}

/** Practice: the per-item timer, with the session total in its tooltip (no second clock). */
function PracticeTimer({ clock, elapsed, saved, target, live }: { clock: StudyClock; elapsed: number; saved: number; target: number; live: boolean }) {
  useClock(clock);
  return <ItemTimer clock={clock} saved={saved} target={target} live={live} total={elapsed + clock.pendingStudy()} />;
}

/** Exam countdown: "剩余 9:39". Amber in the last 5 minutes, red in the last one — a static colour change. */
function Countdown({ clock, elapsed, limit }: { clock: StudyClock; elapsed: number; limit: number }) {
  useClock(clock);
  const left = Math.max(0, limit - elapsed - clock.pendingStudy());
  return (
    <span className={cx('pl-countdown', left <= 60 ? 'is-danger' : left <= 300 && 'is-warning')} role="timer" aria-label={`剩余时间 ${fmtClock(left)}`}>
      <span className="pl-countdown-label">剩余</span>
      <span className="pl-countdown-value num">{fmtClock(left)}</span>
    </span>
  );
}

/** Exam without a limit: elapsed time, quietly. */
function ExamElapsed({ clock, elapsed }: { clock: StudyClock; elapsed: number }) {
  useClock(clock);
  return (
    <span className="pl-countdown is-elapsed">
      <span className="pl-countdown-label">已用</span>
      <span className="pl-countdown-value num">{fmtClock(elapsed + clock.pendingStudy())}</span>
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
        <IconButton icon="arrowLeft" label="退出（进度会保存）" tooltipSide="bottom" onClick={onExit} />
        <div className="pl-top-title">
          <SubjectDot subject={subject} />
          <span className="pl-top-name">{title}</span>
          {exam && (
            <span className="pl-exam-tag">
              <Icon name="timer" size={12} />
              {limit ? '限时' : '考试模式'}
            </span>
          )}
        </div>
      </div>
      <div className="pl-top-center">
        {total > 1 && (
          <span className="pl-count">
            <b className="num">{index + 1}</b>
            <span className="pl-count-of num"> / {total}</span>
          </span>
        )}
      </div>
      <div className="pl-top-right">
        {exam ? (
          <>
            <ItemTimer clock={clock} saved={itemSaved} target={itemTarget} live={itemLive} />
            {limit ? <Countdown clock={clock} elapsed={elapsed} limit={limit} /> : <ExamElapsed clock={clock} elapsed={elapsed} />}
          </>
        ) : (
          <PracticeTimer clock={clock} elapsed={elapsed} saved={itemSaved} target={itemTarget} live={itemLive} />
        )}
        {actions}
      </div>
      <ProgressStrip cells={cells} current={index} onJump={onJump} />
    </header>
  );
}
