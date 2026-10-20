// Today's side panel: progress, bedtime, predicted score, due reviews and the next mock.
import { useMemo, type ReactNode } from 'react';
import { href } from '../../lib/router.ts';
import { Badge, Callout, Chip, Ring, StatTile, SubjectDot, Tooltip } from '../../components/ui.tsx';
import { Icon, type IconName } from '../../components/Icon.tsx';
import type { AppState, DayPlan } from '@shared/types.ts';
import { MOCK_LABEL, sessionLabel, type BankIndex } from '@shared/bank.ts';
import { mockSchedule, vocabDueCount } from '@shared/planner.ts';
import { estimateAll, streak, SCALE_MAX } from '@shared/stats.ts';
import { isDue } from '@shared/srs.ts';
import { daysBetween, weekdayZh } from '@shared/dates.ts';
import { SUBJECT_NAME, cx, fmtDateShort, fmtMinutes, pct } from '../../lib/format.ts';
import { SCORE_ORDER, TOTAL_MAX, isLowData, lowDataNote, shownScore } from './scores.ts';
import { plainNumbers } from './blocks.ts';

interface Ctx {
  state: AppState;
  bank: BankIndex;
  today: string;
}

// ─── Bedtime ───
// From D-10 the target finishing time moves 20 minutes earlier each night, 01:30 → 23:00 (D-3),
// so the body clock is awake for 日本語 at 9:30 on exam day. Times are minutes from midnight
// (negative = the evening before midnight).
const SHIFT_FROM = 10;
const SHIFT_START = 90;
const SHIFT_STEP = 20;
const SHIFT_END = -60;
/** The bedtime banner shows from this many minutes before the target. */
export const BEDTIME_WINDOW = 90;

export function bedtimeFor(left: number): number | null {
  if (left > SHIFT_FROM || left < 1) return null;
  if (left <= 3) return SHIFT_END;
  return Math.max(SHIFT_END, SHIFT_START - SHIFT_STEP * (SHIFT_FROM - left));
}

export function clockText(m: number): string {
  const t = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** Minutes since the study day began (04:00), so 01:30 counts as later than 23:00. */
function dayMinute(m: number): number {
  return (((m - 240) % 1440) + 1440) % 1440;
}

/** Minutes until tonight's target (negative once it has passed), or null when no target applies. */
export function minutesToBed(left: number, now: Date): number | null {
  const target = bedtimeFor(left);
  if (target === null) return null;
  return dayMinute(target) - dayMinute(now.getHours() * 60 + now.getMinutes());
}

/** "2026-11-04" → "11/4". */
function md(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}`;
}

/** "1 小时 25 分钟" with numerals. */
export function HM({ minutes, className }: { minutes: number; className?: string }) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return (
    <span className={cx('td-hm', className)}>
      {h > 0 && (
        <>
          <span className="num">{h}</span>
          <span className="td-hm-unit">小时</span>
        </>
      )}
      {(r > 0 || h === 0) && (
        <>
          <span className="num">{r}</span>
          <span className="td-hm-unit">分钟</span>
        </>
      )}
    </span>
  );
}

// ─── Progress ───

export function ProgressCard({
  state,
  today,
  plan,
  done,
  total,
  started,
  onAdjust,
}: {
  state: AppState;
  today: string;
  plan?: DayPlan;
  done: number;
  total: number;
  /** The first task is under way (a session with answers). */
  started?: boolean;
  onAdjust: () => void;
}) {
  const day = state.days[today];
  const studied = (day?.seconds ?? 0) / 60;
  const budget = plan?.budgetMinutes ?? 0;
  const answered = day?.answered ?? 0;
  const st = streak(state, today);
  const all = total > 0 && done >= total;
  const adjust = (
    <button type="button" className="td-link" onClick={onAdjust}>
      调整
    </button>
  );

  return (
    <section className="card td-progress">
      <div className="td-pg-head">
        {done > 0 ? (
          <div className="td-pg-ringrow">
            <Ring value={all ? 1 : Math.max(0.04, done / total)} size={72} stroke={7} tone={all ? 'success' : 'primary'}>
              {all ? (
                <Icon name="check" size={26} className="td-pg-check" />
              ) : (
                <span className="td-pg-ratio num">
                  {done}
                  <span>/{total}</span>
                </span>
              )}
            </Ring>
            <div className="td-pg-text">
              <div className="td-pg-title">{all ? `${total} 项全部完成` : `完成 ${done} 项，还剩 ${total - done} 项`}</div>
              <span className="td-pg-line">
                已学 {fmtMinutes(studied)} / 计划 {budget ? fmtMinutes(budget) : '休息'}
              </span>
            </div>
          </div>
        ) : (
          <div className="td-pg-start">
            <div className="td-pg-start-top">
              <span className="td-pg-title">{studied >= 1 ? <>已学 {fmtMinutes(studied)}</> : total > 0 ? '今天还没开始' : '今天休息'}</span>
              {total > 0 && <span className="td-pg-count num">0 / {total} 项</span>}
            </div>
            {total > 0 && (
              <div className="td-seg" aria-hidden>
                {Array.from({ length: total }, (_, i) => (
                  <span key={i} className={cx(i === 0 && started && 'is-started')} />
                ))}
              </div>
            )}
            <span className="td-pg-line">
              计划 {budget ? fmtMinutes(budget) : '休息'}
              {adjust}
            </span>
          </div>
        )}
      </div>
      <div className="td-pg-stats">
        <StatTile boxed label="今日做题" value={answered} unit="题" sub={answered ? `正确率 ${pct((day?.correct ?? 0) / answered)}` : '正确率 —'} />
        <StatTile boxed label="连续学习" value={st} unit="天" sub="每天学满 30 分钟" />
      </div>
    </section>
  );
}

// ─── Bedtime ───

export function SleepCard({ state, bank, left, now, showCountdown }: Ctx & { left: number; now: Date; showCountdown: boolean }) {
  const sim = useMemo(
    () => mockSchedule(state, bank).find((m) => m.daysLeft === left - 1 && m.parts.length >= 4 && m.parts.some((p) => !p.done)),
    [state, bank, left],
  );
  const target = bedtimeFor(left);
  if (target === null) return null;
  const exam = state.profile.examDate;
  const prev = bedtimeFor(left + 1);
  const trend =
    prev === null
      ? `每晚提前 ${SHIFT_STEP} 分钟`
      : prev > target
        ? `比昨晚早 ${prev - target} 分钟`
        : left === 1
          ? '明早就考试，早点睡'
          : '保持到考前一晚';
  const toGo = minutesToBed(left, now) ?? 0;
  return (
    <section className="card td-sleep">
      <div className="td-sleep-top">
        <span className="icon-tile icon-tile-md tone-neutral" aria-hidden>
          <Icon name="moon" size={18} />
        </span>
        <div className="td-sleep-main">
          <div className="td-sleep-label">
            <span className="t-eyebrow">今晚收工</span>
            {showCountdown && (toGo <= 0 ? <Badge tone="warning">已到点</Badge> : toGo <= 60 && <Badge tone="neutral">还有 {toGo} 分钟</Badge>)}
          </div>
          <div className="td-sleep-time">
            <span className="num">{clockText(target)}</span>
            <span>前</span>
            <span className="td-sleep-trend">{trend}</span>
          </div>
        </div>
      </div>
      <p className="td-sleep-note">{md(exam)} 日语 9:30 开考，占总分一半，生物钟要跟着往前挪。</p>
      {sim && (
        <Callout tone="primary" icon="sun" className="td-sleep-alert">
          {md(sim.date)} 全真模拟请早上 9:30 开始
        </Callout>
      )}
    </section>
  );
}

// ─── Predicted score ───

export function ScoreCard({ state, bank }: { state: AppState; bank: BankIndex }) {
  const est = useMemo(() => estimateAll(state, bank), [state, bank]);
  const shown = SCORE_ORDER.map((s) => shownScore(est[s]));
  const total = shown.reduce((a, b) => a + b, 0);
  const target = state.profile.targetTotal;
  const base = SCORE_ORDER.reduce((s, k) => s + state.profile.baseline[k], 0);
  const delta = total - base;
  const gap = target - total;
  const thin = SCORE_ORDER.filter((s) => isLowData(est[s]));
  return (
    <section className="card td-score">
      <div className="td-card-head">
        <h3 className="td-h3">预测总分</h3>
        <a className="td-link" href={href('/stats')}>
          详细
          <Icon name="right" size={14} />
        </a>
      </div>
      <div className="td-score-total">
        <span className="num td-score-num">{total}</span>
        <span className="td-score-of num">/ {TOTAL_MAX}</span>
        {delta > 0 ? (
          <Badge tone="success" icon="trending">
            较起点 +{delta}
          </Badge>
        ) : (
          delta < 0 && <Chip>较起点 {delta}</Chip>
        )}
      </div>
      <div className="td-score-gap">
        目标 {target}
        <span className="td-dot-sep">·</span>
        {gap > 0 ? `还差 ${gap} 分` : '已到目标线，保持住'}
      </div>
      <ul className="td-subj">
        {SCORE_ORDER.map((s, i) => {
          const e = est[s];
          const max = SCALE_MAX[s];
          const low = isLowData(e);
          const note = lowDataNote(e);
          return (
            <li key={s} className={cx('td-subj-row', `tone-${s}`, low && 'is-low')}>
              <span className="td-subj-name">
                <SubjectDot subject={s} />
                {SUBJECT_NAME[s]}
              </span>
              <Tooltip label={`${note ? note + ' · ' : ''}估计 ${e.low}–${e.high} · 目标 ${e.target} / ${max}`}>
                <span className="td-subj-bar">
                  <span className="td-subj-fill" style={{ width: `${Math.min(100, (shown[i] / max) * 100)}%` }} />
                  <span className="td-subj-target" style={{ left: `${Math.min(100, (e.target / max) * 100)}%` }} />
                </span>
              </Tooltip>
              <span className="td-subj-val num">{shown[i]}</span>
            </li>
          );
        })}
      </ul>
      {thin.length > 0 && (
        <p className="td-score-note">
          {thin.map((s) => SUBJECT_NAME[s]).join('、')}数据还少
          {thin.every((s) => est[s].estimate < est[s].baseline) ? '，先按起点算' : thin.some((s) => est[s].estimate < est[s].baseline) ? '，低于起点的先按起点算' : '，预测仅作参考'}
        </p>
      )}
    </section>
  );
}

// ─── Due reviews ───

export function DueCard({ state, bank, today }: Ctx) {
  const mistakes = useMemo(() => Object.values(state.progress).filter((p) => isDue(p, today)).length, [state.progress, today]);
  // Same count as the vocab block and the vocab page: cards the engine schedules today.
  const vocab = useMemo(() => vocabDueCount(state, bank, today), [state, bank, today]);
  return (
    <section className="card td-due">
      <DueRow icon="alert" tone="warning" label="到期错题" value={mistakes} unit="题" empty="没有到期的错题" action="去重做" to="/mistakes" />
      <DueRow icon="kana" tone="japanese" label="待复习词卡" value={vocab} unit="张" empty="词汇都复习完了" action="去背" to="/vocab?start=1" />
    </section>
  );
}

function DueRow({ icon, tone, label, value, unit, empty, action, to }: { icon: IconName; tone: 'warning' | 'japanese'; label: string; value: number; unit: string; empty: string; action: string; to: string }) {
  return (
    <a className={cx('td-due-row', !value && 'is-empty')} href={href(to)}>
      <span className={cx('icon-tile icon-tile-md', `tone-${value ? tone : 'success'}`)} aria-hidden>
        <Icon name={value ? icon : 'check'} size={18} />
      </span>
      <span className="td-due-text">
        <span className="t-eyebrow">{label}</span>
        {value ? (
          <span className="td-due-val">
            <b className="num">{value}</b> {unit}
          </span>
        ) : (
          <span className="td-due-empty">{empty}</span>
        )}
      </span>
      <span className="td-due-go">
        {value ? action : '查看'}
        <Icon name="right" size={14} />
      </span>
    </a>
  );
}

// ─── Next mock ───

export function MockCard({ state, bank, today }: Ctx) {
  const schedule = useMemo(() => mockSchedule(state, bank), [state, bank]);
  // The mock in today's plan first (the planner moves the oldest missed one to a free day), else the next one ahead.
  const planned = state.plans[today]?.blocks.filter((b) => b.kind === 'mock' && b.mock && b.status !== 'done') ?? [];
  const inPlan = schedule.find((m) => m.parts.some((p) => !p.done && planned.some((b) => b.mock!.kind === p.kind && b.mock!.session === p.session)));
  const next = inPlan ?? schedule.find((m) => m.date >= today && m.parts.some((p) => !p.done));
  const done = state.mocks.length;
  if (!next) {
    const missed = schedule.some((m) => m.parts.some((p) => !p.done));
    const doneText = done ? `已完成 ${done} 次模考` : '';
    let text: ReactNode;
    if (!missed) text = done ? `${doneText}，计划内的模考都做完了。` : '计划内暂时没有模考。';
    else if (daysBetween(today, state.profile.examDate) <= 3) text = `${doneText ? doneText + '。' : ''}考前几天不再做整卷，留着状态进考场。`;
    else text = `${doneText ? doneText + '。' : ''}计划里没做的卷子可以在模考页挑时间补做。`;
    return (
      <section className="card td-mock">
        <div className="td-card-head">
          <h3 className="td-h3">模考</h3>
        </div>
        <p className="td-mock-empty">{text}</p>
      </section>
    );
  }
  const n = inPlan ? Math.min(0, daysBetween(today, next.date)) : daysBetween(today, next.date);
  return (
    <a className="card td-mock" href={href('/mock')}>
      <div className="td-card-head">
        <h3 className="td-h3">下次模考</h3>
        <Badge tone={n <= 1 ? 'warning' : 'neutral'}>{n < 0 ? '今天补做' : n === 0 ? '今天' : n === 1 ? '明天' : `${n} 天后`}</Badge>
      </div>
      <div className="td-mock-title">{plainNumbers(next.title)}</div>
      <div className="td-mock-date">
        {fmtDateShort(next.date)} {weekdayZh(next.date)}
      </div>
      <ul className="td-mock-parts">
        {next.parts.map((p) => (
          <li key={p.kind + p.session} className={cx(p.done && 'is-done')}>
            <Icon name={p.done ? 'checkCircle' : 'file'} size={14} />
            <span>{MOCK_LABEL[p.kind]}</span>
            <span className="td-mock-paper">{sessionLabel(p.session)}</span>
          </li>
        ))}
      </ul>
    </a>
  );
}
