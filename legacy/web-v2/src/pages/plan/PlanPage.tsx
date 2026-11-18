// 冲刺日历 — the sprint calendar: an overview strip (one cell per day, grouped by phase), one
// neutral card per phase with a compact tile per day (today and future days are buttons that edit
// the day's budget; a tile only says more than its date when the day differs: a mock, a rest day,
// other hours, or what was done on a past day), the exam day, score targets per subject, and a
// folded "怎么排的？" explainer. Phases are told apart by name and position, not colour: the current
// phase gets the indigo dot, the others stay neutral.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useReady, update } from '../../lib/store.ts';
import { Badge, Button, Chip, Dot, Empty, IconTile, Modal, PageHeader, StatTile, Tooltip, toast, type Tone } from '../../components/ui.tsx';
import { navigate } from '../../lib/router.ts';
import { Icon, SUBJECT_ICON, type IconName } from '../../components/Icon.tsx';
import type { AppState, Phase } from '@shared/types.ts';
import type { BankIndex } from '@shared/bank.ts';
import { PHASE_INFO, calendar, daysLeftOn, mockSchedule, phaseFor, type DaySkeleton, type ScheduledMock } from '@shared/planner.ts';
import { estimateAll, SCALE_MAX, type SubjectEstimate } from '@shared/stats.ts';
import { weekdayZh } from '@shared/dates.ts';
import { SUBJECT_NAME, cx, fmtDateShort, pct } from '../../lib/format.ts';
import { DurationDialog } from '../today/DurationDialog.tsx';
import { plainNumbers, regenerateDay } from '../today/blocks.ts';
import { SCORE_ORDER, TOTAL_MAX, isLowData, shownScore } from '../today/scores.ts';
import './plan.css';

function hours(min: number): string {
  return `${Math.round(min / 6) / 10} 小时`;
}

/** "45 分钟" under an hour, else "1.1 小时" for tight tiles. */
function compactMinutes(min: number): string {
  const m = Math.round(min);
  return m < 60 ? `${m} 分钟` : `${Math.round(m / 6) / 10} 小时`;
}

/** "数理整卷模考 ①" → "数理模考 1", "全真模拟（按考试日时间表）" → "全真模拟". */
function shortMockTitle(title: string): string {
  return plainNumbers(title.replace(/（[^）]*）/g, '').replace('整卷', '').trim());
}

function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}`;
}

interface PhaseGroup {
  phase: Phase;
  days: DaySkeleton[];
}

/** The current phase wears the indigo dot ("you are here"); the others stay neutral. */
function phaseTone(phase: Phase, current: Phase | null): Tone {
  return phase === current ? 'primary' : 'neutral';
}

const HOW_KEY = 'eju-plan-how-open';

export function PlanPage() {
  const { state, bank, today } = useReady();
  const start = state.profile.startDate <= today ? state.profile.startDate : today;
  const days = useMemo(() => calendar(state, bank, start), [state, bank, start]);
  const groups = useMemo(() => {
    const out: PhaseGroup[] = [];
    for (const d of days) {
      const last = out[out.length - 1];
      if (last && last.phase === d.phase) last.days.push(d);
      else out.push({ phase: d.phase, days: [d] });
    }
    return out;
  }, [days]);
  // A mock missed yesterday is moved into today's plan by the planner: show it on today's tile.
  const carried = useMemo(() => {
    const blocks = state.plans[today]?.blocks ?? [];
    return mockSchedule(state, bank).find(
      (m) => m.date < today && blocks.some((b) => b.kind === 'mock' && m.parts.some((p) => p.kind === b.mock?.kind && p.session === b.mock?.session)),
    );
  }, [state, bank, today]);
  const [editing, setEditing] = useState<string | null>(null);
  const [defaultOpen, setDefaultOpen] = useState(false);

  const todayIdx = days.findIndex((d) => d.date === today);
  const examDate = state.profile.examDate;
  const daysToExam = daysLeftOn(state, today);
  const current = daysToExam >= 0 ? phaseFor(daysToExam) : null;

  if (!days.length) {
    return (
      <div className="page plan">
        <PageHeader title="冲刺日历" />
        <Empty icon="award" title="这次考试已经结束了" desc="辛苦了。之后想继续练习，可以去题库或错题本。" action={<Button onClick={() => navigate('/practice')}>去题库</Button>} />
      </div>
    );
  }

  return (
    <div className="page plan">
      <PageHeader
        title={daysToExam > 0 ? `还有 ${daysToExam} 天` : '今天考试'}
        desc={
          <>
            {shortDate(start)} – {shortDate(examDate)} 冲刺 {days.length} 天
            {todayIdx >= 0 && daysToExam > 0 && (
              <>
                {' '}
                · 今天是第 <b className="num">{todayIdx + 1}</b> 天
              </>
            )}
          </>
        }
        info="点今天或之后的任意一天，可以单独调整那天的学习时长或设为休息日。考前最后几天会自动减量。"
        actions={
          <Button variant="secondary" icon="clock" onClick={() => setDefaultOpen(true)}>
            默认每天 {hours(state.profile.dailyMinutes)}
          </Button>
        }
      />

      <Overview state={state} days={days} groups={groups} today={today} current={current} />

      <div className="plan-phases">
        {groups.map((g) =>
          g.phase === 'exam' ? (
            <ExamCard key={g.phase} day={g.days[0]} left={daysToExam} />
          ) : (
            <PhaseCard key={g.phase} group={g} state={state} today={today} current={current} carried={carried} onEdit={setEditing} />
          ),
        )}
      </div>

      <TargetsCard state={state} bank={bank} />
      <HowCard />

      <DurationDialog open={!!editing} date={editing ?? today} onClose={() => setEditing(null)} allowRest />
      <DefaultDialog open={defaultOpen} onClose={() => setDefaultOpen(false)} />
    </div>
  );
}

// ─────────────────────────── Overview strip ───────────────────────────

function Overview({ state, days, groups, today, current }: { state: AppState; days: DaySkeleton[]; groups: PhaseGroup[]; today: string; current: Phase | null }) {
  const stats = useMemo(() => {
    let seconds = 0;
    let studied = 0;
    let blocks = 0;
    let done = 0;
    for (const d of days) {
      if (d.date > today) break;
      const log = state.days[d.date];
      seconds += log?.seconds ?? 0;
      if ((log?.seconds ?? 0) >= 1800) studied++;
      const plan = state.plans[d.date];
      if (plan) {
        blocks += plan.blocks.filter((b) => b.status !== 'skipped').length;
        done += plan.blocks.filter((b) => b.status === 'done').length;
      }
    }
    const remaining = days.filter((d) => d.date >= today).reduce((s, d) => s + d.budget, 0);
    return { seconds, studied, blocks, done, remaining };
  }, [state, days, today]);

  return (
    <section className="card plan-overview">
      <div className="plan-ov-stats">
        <StatTile icon="clock" label="已学习" value={Math.round(stats.seconds / 360) / 10} unit="小时" />
        <StatTile icon="flame" label="学满 30 分钟" value={stats.studied} unit="天" />
        <StatTile icon="checkCircle" label="完成任务" value={`${stats.done}/${stats.blocks}`} unit="项" />
        <StatTile icon="calendar" label="剩余计划" value={Math.round(stats.remaining / 6) / 10} unit="小时" />
      </div>
      {/* One cell per day; phases are groups with a gap and a label under each. */}
      <div className="plan-ov-track">
        {groups.map((g) => (
          <div key={g.phase} className={cx('plan-ov-group', g.phase === 'exam' && 'is-exam')} style={{ flexGrow: g.days.length }}>
            <div className="plan-ov-cells" style={{ gridTemplateColumns: `repeat(${g.days.length}, minmax(0, 1fr))` }}>
              {g.days.map((d) => {
                const log = state.days[d.date];
                const min = (log?.seconds ?? 0) / 60;
                const ratio = d.budget ? Math.min(1, min / d.budget) : min > 0 ? 1 : 0;
                const past = d.date < today;
                const isToday = d.date === today;
                const tip = `${fmtDateShort(d.date)} ${weekdayZh(d.date)} · ${past || isToday ? `已学 ${compactMinutes(min)}` : d.phase === 'exam' ? '考试' : d.budget ? hours(d.budget) : '休息'}${d.mocks ? ` · ${shortMockTitle(d.mocks.title)}` : ''}`;
                return (
                  <Tooltip key={d.date} label={tip}>
                    <span className={cx('plan-ov-seg', past && 'is-past', isToday && 'is-today', d.budget === 0 && d.phase !== 'exam' && 'is-rest', d.phase === 'exam' && 'is-exam')}>
                      {(past || isToday) && ratio > 0 && <span className="plan-ov-fill" style={{ height: `${Math.max(ratio, 0.12) * 100}%` }} />}
                      {d.phase === 'exam' && <Icon name="flag" size={12} />}
                      {isToday && <span className="plan-today plan-ov-today">今天</span>}
                    </span>
                  </Tooltip>
                );
              })}
            </div>
            <div className="plan-ov-label">
              <span className="plan-ov-name">
                {g.phase !== 'exam' && <Dot tone={phaseTone(g.phase, current)} size="sm" />}
                {g.phase === 'exam' ? '考试' : PHASE_INFO[g.phase].name}
              </span>
              <span className="plan-ov-range num">{g.days.length === 1 ? shortDate(g.days[0].date) : `${shortDate(g.days[0].date)}–${shortDate(g.days[g.days.length - 1].date)}`}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────── Phases ───────────────────────────

function PhaseCard({
  group,
  state,
  today,
  current,
  carried,
  onEdit,
}: {
  group: PhaseGroup;
  state: AppState;
  today: string;
  current: Phase | null;
  carried?: ScheduledMock;
  onEdit: (date: string) => void;
}) {
  const info = PHASE_INFO[group.phase];
  const first = group.days[0];
  const last = group.days[group.days.length - 1];
  const isCurrent = group.phase === current;
  const past = last.date < today;
  const total = group.days.reduce((s, d) => s + d.budget, 0);
  // The budget most days of the phase share: said once in the header, so tiles only show the exceptions.
  const usual = useMemo(() => {
    const count = new Map<number, number>();
    for (const d of group.days) if (d.budget > 0) count.set(d.budget, (count.get(d.budget) ?? 0) + 1);
    let best = 0;
    let n = 0;
    for (const [b, c] of count) if (c > n) [best, n] = [b, c];
    return n * 2 > group.days.length ? best : 0;
  }, [group.days]);
  return (
    <section className={cx('card plan-phase', isCurrent && 'is-current', past && 'is-past')}>
      <header className="plan-phase-head">
        <div className="plan-phase-title">
          <Dot tone={phaseTone(group.phase, current)} />
          <h2>{info.name}</h2>
          <span className="plan-phase-range num">
            {group.days.length === 1 ? `${fmtDateShort(first.date)} ${weekdayZh(first.date)}` : `${shortDate(first.date)} – ${shortDate(last.date)} · ${group.days.length} 天`}
            {usual > 0 && !past ? ` · 每天 ${hours(usual)}` : total > 0 && ` · 约 ${hours(total)}`}
          </span>
          {isCurrent && <Badge tone="primary">当前阶段</Badge>}
          {past && (
            <Badge tone="neutral" icon="check">
              已结束
            </Badge>
          )}
        </div>
        <p className="plan-phase-desc">{info.desc}</p>
      </header>
      <div className="plan-days">
        {group.days.map((d) => (
          <DayTile key={d.date} day={d} state={state} today={today} usual={usual} carried={d.date === today ? carried : undefined} onEdit={onEdit} />
        ))}
      </div>
    </section>
  );
}

function DayTile({ day, state, today, usual, carried, onEdit }: { day: DaySkeleton; state: AppState; today: string; usual: number; carried?: ScheduledMock; onEdit: (date: string) => void }) {
  const isToday = day.date === today;
  const past = day.date < today;
  const editable = !past;
  const override = state.profile.dayMinutes[day.date];
  const log = state.days[day.date];
  const plan = state.plans[day.date];
  const studiedMin = (log?.seconds ?? 0) / 60;
  const planned = plan ? plan.blocks.filter((b) => b.status !== 'skipped') : [];
  const doneBlocks = planned.filter((b) => b.status === 'done').length;
  const answered = log?.answered ?? 0;
  const slot = day.mocks ?? carried ?? null;
  const mocksDone = slot ? slot.parts.every((p) => p.done) : false;
  const missed = past && !!day.mocks && !mocksDone;
  const adjusted = typeof override === 'number';

  // Second line: only what makes this day different from the phase's usual day.
  let sub: ReactNode = null;
  if (past) {
    sub =
      studiedMin >= 1 ? (
        <>
          <span className="plan-day-strong num">{compactMinutes(studiedMin)}</span>
          {planned.length > 0 && <span className="plan-day-count num">{`${doneBlocks}/${planned.length}`}</span>}
        </>
      ) : (
        <span>{day.budget ? '没有记录' : '休息日'}</span>
      );
  } else if (!day.budget) {
    sub = (
      <span className="plan-day-rest">
        <Icon name="coffee" size={13} />
        休息
      </span>
    );
  } else if (isToday && planned.length > 0) {
    // Today's hours live on Today (the sum of its tasks); the tile shows how far the day is.
    sub = (
      <>
        <span className="plan-day-strong num">{`${doneBlocks}/${planned.length} 项`}</span>
        {adjusted && <span className="plan-day-count">已调整</span>}
      </>
    );
  } else if (day.budget !== usual || adjusted) {
    sub = (
      <>
        <span className="plan-day-strong num">{hours(day.budget)}</span>
        {adjusted && <span className="plan-day-count">已调整</span>}
      </>
    );
  }

  const mock = slot && (
    <span className={cx('plan-day-mock', mocksDone && 'is-done', missed && 'is-missed')}>
      <Icon name={mocksDone ? 'checkCircle' : 'target'} size={13} />
      <span>
        {slot === carried && !mocksDone ? '补做 ' : missed ? '没做 · ' : ''}
        {shortMockTitle(slot.title)}
      </span>
    </span>
  );

  const body = (
    <>
      <span className="plan-day-top">
        <span className="plan-day-date num">{shortDate(day.date)}</span>
        <span className="plan-day-wd">{weekdayZh(day.date)}</span>
        {isToday && <span className="plan-today">今天</span>}
      </span>
      {sub && <span className="plan-day-sub">{sub}</span>}
      {mock}
      {past && day.budget > 0 && studiedMin >= 1 && (
        <span className="plan-day-bar">
          <span style={{ width: `${Math.min(100, (studiedMin / day.budget) * 100)}%` }} />
        </span>
      )}
    </>
  );
  const cls = cx('plan-day', isToday && 'is-today', past && 'is-past', editable && 'is-editable', slot && 'has-mock');
  if (!editable) {
    const tip = [`${fmtDateShort(day.date)} ${weekdayZh(day.date)}`, studiedMin >= 1 ? `学习 ${compactMinutes(studiedMin)}` : '没有学习记录'];
    if (planned.length) tip.push(`完成 ${doneBlocks}/${planned.length} 项`);
    if (answered > 0) tip.push(`正确率 ${pct((log?.correct ?? 0) / answered)}`);
    return (
      <Tooltip label={tip.join(' · ')}>
        <div className={cls}>{body}</div>
      </Tooltip>
    );
  }
  const tip = `${fmtDateShort(day.date)} ${weekdayZh(day.date)} · ${day.budget ? hours(day.budget) : '休息'} · D-${day.daysLeft}`;
  return (
    <Tooltip label={`${tip} · 点一下调整`}>
      <button type="button" className={cls} onClick={() => onEdit(day.date)} aria-label={`${fmtDateShort(day.date)} ${weekdayZh(day.date)}，调整学习时长`}>
        {body}
      </button>
    </Tooltip>
  );
}

function ExamCard({ day, left }: { day: DaySkeleton; left: number }) {
  return (
    <section className="card plan-exam">
      <IconTile icon="flag" tone="neutral" size="md" />
      <div className="plan-exam-main">
        <h2 className="plan-exam-title">
          EJU 考试日
          <span className="plan-exam-date">
            {fmtDateShort(day.date)} {weekdayZh(day.date)}
          </span>
        </h2>
        <ul className="plan-exam-slots">
          <li>
            <span className="num">9:30</span>日语
          </li>
          <li>
            <span className="num">13:30</span>理科
          </li>
          <li>
            <span className="num">15:40</span>数学
          </li>
        </ul>
      </div>
      {left > 0 && <span className="plan-exam-left">还有 <span className="num">{left}</span> 天</span>}
    </section>
  );
}

// ─────────────────────────── Targets ───────────────────────────

function TargetsCard({ state, bank }: { state: AppState; bank: BankIndex }) {
  const est = useMemo(() => estimateAll(state, bank), [state, bank]);
  const { baseline, targets } = state.profile;
  const totalBase = SCORE_ORDER.reduce((s, k) => s + baseline[k], 0);
  const totalShown = SCORE_ORDER.reduce((s, k) => s + shownScore(est[k]), 0);
  const totalTarget = state.profile.targetTotal;

  const row = (key: string, label: ReactNode, base: number, cur: number, target: number, max: number, e?: SubjectEstimate) => {
    const span = target - base;
    // Measured from the baseline: never drawn below it.
    const progress = span > 0 ? Math.max(0, Math.min(1, (cur - base) / span)) : cur >= target ? 1 : 0;
    const gap = target - cur;
    const low = !!e && isLowData(e);
    // A prediction under the baseline (with enough data) is said plainly, never drawn as a drop.
    const under = !!e && !low && cur < base;
    const note = low && e ? '数据还少' : under ? '低于起点' : null;
    const noteTip =
      low && e
        ? `做题还少，${e.estimate < e.baseline ? `先按起点 ${e.baseline} 算` : '预测仅作参考'} · 估计 ${e.low}–${e.high}`
        : under && e
          ? `最近的练习估计 ${cur}，比填的起点 ${base} 低。多做几套模考后会更准 · 估计 ${e.low}–${e.high}`
          : null;
    return (
      <div key={key} className={cx('plan-tg-row', key === 'total' ? 'is-total' : `tone-${key}`, low && 'is-low')} role="row">
        <span className="plan-tg-subj" role="cell">
          {label}
        </span>
        <span className="plan-tg-num num plan-tg-base" role="cell">
          {base}
        </span>
        <span className="plan-tg-num num plan-tg-cur" role="cell">
          {cur}
        </span>
        <span className="plan-tg-num num" role="cell">
          {target}
          <small>/{max}</small>
        </span>
        <span className="plan-tg-prog" role="cell">
          <span className={cx('plan-tg-bar', gap <= 0 && 'is-ok')}>
            <span style={{ width: `${progress * 100}%` }} />
          </span>
          {note && noteTip && (
            <Tooltip label={noteTip}>
              <span className="plan-tg-note" tabIndex={0}>
                {note}
              </span>
            </Tooltip>
          )}
          {gap > 0 ? <Chip>还差 {gap}</Chip> : <Badge tone="success">已达标</Badge>}
        </span>
      </div>
    );
  };

  return (
    <section className="section plan-targets-wrap">
      <div className="section-head">
        <div>
          <h2 className="section-title">目标分配</h2>
          <p className="section-desc">从起点到目标的提分进度，预测随做题和模考更新</p>
        </div>
      </div>
      <div className="card plan-targets">
        <div className="plan-tg-table" role="table" aria-label="目标分配">
          <div className="plan-tg-row plan-tg-headrow" role="row">
            <span role="columnheader">科目</span>
            <span className="plan-tg-num" role="columnheader">
              起点
            </span>
            <span className="plan-tg-num" role="columnheader">
              预测
            </span>
            <span className="plan-tg-num" role="columnheader">
              目标
            </span>
            <span role="columnheader" className="plan-tg-progh">
              提分进度
            </span>
          </div>
          {SCORE_ORDER.map((s) =>
            row(
              s,
              <span className="plan-tg-subj-name">
                <IconTile icon={SUBJECT_ICON[s]} tone={s} />
                {SUBJECT_NAME[s]}
              </span>,
              baseline[s],
              shownScore(est[s]),
              targets[s],
              SCALE_MAX[s],
              est[s],
            ),
          )}
          {row('total', <span className="plan-tg-total">合计</span>, totalBase, totalShown, totalTarget, TOTAL_MAX)}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────── How the plan works ───────────────────────────

const HOW: { icon: IconName; title: string; text: string }[] = [
  { icon: 'layers', title: '先补知识，再练速度', text: '前期按「薄弱度 × 考频」轮换专题，把遗忘的知识先捡回来；之后整卷限时模考，练节奏和时间分配。' },
  { icon: 'clock', title: '理科每天都限时', text: '从第一天起，每天都有物理、化学的限时小测（每题约 2 分钟），速度是天天练出来的。' },
  { icon: 'sparkles', title: '新题按天分配', text: '没做过的题按剩余天数分到每一天，不会前几天就用光；模考要用的真题提前留好，不会在练习里做掉。' },
  { icon: 'refresh', title: '错题 2 天、4 天后回来', text: '做错或没把握的题隔 2 天、再隔 4 天重做，两次有把握地答对才移出错题本；做对但太慢的题也会回来再练。' },
  { icon: 'list', title: '错题混进当天练习', text: '到期的错题先单独重做一项，其余混进当天的专项练习和新题一起做，不会越堆越多。' },
  { icon: 'trending', title: '每天自动调整', text: '计划按你最新的正确率、用时和离目标的差距生成，差距越大的科目分到的时间越多。' },
  { icon: 'flag', title: '按考试日的顺序', text: '模考按 日语 → 理科 → 数学 的顺序安排；考前最后几天减量，把状态留给考场。' },
  { icon: 'file', title: '考前一页纸', text: '最后两天把你做错过的题里的易错点汇成一页，按科目排好，考前只看这一页。' },
];

function readHow(): boolean {
  try {
    return localStorage.getItem(HOW_KEY) === '1';
  } catch {
    return false;
  }
}

function HowCard() {
  const [open, setOpen] = useState(readHow);
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(HOW_KEY, o ? '0' : '1');
      } catch {
        /* per-viewer convenience only */
      }
      return !o;
    });
  };
  return (
    <section className={cx('card card-flush plan-how', open && 'is-open')}>
      <button type="button" className="plan-how-head" aria-expanded={open} onClick={toggle}>
        <IconTile icon="help" tone="neutral" size="md" />
        <span className="plan-how-text">
          <span className="plan-how-title">怎么排的？</span>
          <span className="plan-how-sub">先补知识再练速度 · 理科每天限时 · 错题 2 天、4 天后回来 · 每天自动调整</span>
        </span>
        <Icon name={open ? 'up' : 'down'} size={16} className="plan-how-chev" />
      </button>
      {open && (
        <ul className="plan-how-list">
          {HOW.map((s) => (
            <li key={s.title}>
              <Icon name={s.icon} size={16} className="plan-how-icon" />
              <div>
                <div className="plan-how-item">{s.title}</div>
                <div className="plan-how-desc">{s.text}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─────────────────────────── Default daily time ───────────────────────────

const DEFAULT_PRESETS = [4, 5, 6, 7, 8];

function DefaultDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, today } = useReady();
  const current = state.profile.dailyMinutes;
  const [minutes, setMinutes] = useState(current);
  useEffect(() => {
    if (open) setMinutes(current);
  }, [open, current]);
  const overrides = Object.keys(state.profile.dayMinutes).filter((d) => d >= today).length;

  const save = () => {
    update((d, bank, t) => {
      d.profile.dailyMinutes = minutes;
      if (typeof d.profile.dayMinutes[t] !== 'number') regenerateDay(d, bank, t);
    });
    onClose();
    toast(`默认每天 ${hours(minutes)}，今天的安排已更新`, 'success');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={440}
      title="默认每天学习多久"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={save} disabled={minutes === current}>
            保存
          </Button>
        </>
      }
    >
      <div className="plan-def">
        <div className="plan-def-grid" role="radiogroup" aria-label="默认每天学习时长">
          {DEFAULT_PRESETS.map((h) => (
            <button
              key={h}
              type="button"
              role="radio"
              aria-checked={minutes === h * 60}
              className={cx('plan-def-opt', minutes === h * 60 && 'is-on')}
              onClick={() => setMinutes(h * 60)}
            >
              <span className="num">{h}</span>
              <small>小时</small>
            </button>
          ))}
        </div>
        <p className="plan-def-note">
          <Icon name="info" size={15} />
          <span>
            从今天起生效{overrides > 0 ? `，单独调整过的 ${overrides} 天保持不变` : ''}。考前最后几天会自动减量。
          </span>
        </p>
      </div>
    </Modal>
  );
}

