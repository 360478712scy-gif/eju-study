// 冲刺计划 — the sprint calendar: phases as coloured bands, one cell per day with its budget
// (editable for today and future days), scheduled mocks and, for past days, what was done.
// Below: score targets per subject and a short explainer of how the plan adapts.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useReady, update } from '../../lib/store.ts';
import { Badge, Button, Empty, Modal, PageHeader, SubjectTag, toast } from '../../components/ui.tsx';
import { navigate } from '../../lib/router.ts';
import { Icon, type IconName } from '../../components/Icon.tsx';
import type { AppState, Phase, Subject } from '@shared/types.ts';
import { PHASE_INFO, calendar, daysLeftOn, type DaySkeleton } from '@shared/planner.ts';
import { estimateAll, SCALE_MAX } from '@shared/stats.ts';
import { weekdayZh } from '@shared/dates.ts';
import { cx, fmtDateShort, pct } from '../../lib/format.ts';
import { DurationDialog } from '../today/DurationDialog.tsx';
import { PHASE_TONE, regenerateDay } from '../today/blocks.ts';
import './plan.css';

const SUBJECT_ORDER: Subject[] = ['japanese', 'math', 'physics', 'chemistry'];

function hours(min: number): string {
  return `${Math.round(min / 6) / 10} 小时`;
}

/** "1 小时 5 分" → "1.1 小时" for tight cells. */
function compactMinutes(min: number): string {
  const m = Math.round(min);
  return m < 60 ? `${m} 分钟` : `${Math.round(m / 6) / 10} 小时`;
}

/** "数理整卷模考 ①" → "数理模考 ①", "全真模拟（按考试日时间表）" → "全真模拟". */
function shortMockTitle(title: string): string {
  return title.replace(/（[^）]*）/g, '').replace('整卷', '').trim();
}

function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}`;
}

interface PhaseGroup {
  phase: Phase;
  days: DaySkeleton[];
}

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
  const [editing, setEditing] = useState<string | null>(null);
  const [defaultOpen, setDefaultOpen] = useState(false);

  const todayIdx = days.findIndex((d) => d.date === today);
  const examDate = state.profile.examDate;
  const daysToExam = daysLeftOn(state, today);

  if (!days.length) {
    return (
      <div className="page plan">
        <PageHeader eyebrow="冲刺计划" title="冲刺日历" />
        <Empty icon="award" title="这次考试已经结束了" desc="辛苦了。之后想继续练习，可以去题库或错题本。" action={<Button onClick={() => navigate('/practice')}>去题库</Button>} />
      </div>
    );
  }

  return (
    <div className="page plan">
      <PageHeader
        eyebrow="冲刺计划"
        title={`${days.length} 天冲刺日历`}
        desc={
          <>
            {fmtDateShort(start)} – {fmtDateShort(examDate)}
            {todayIdx >= 0 && daysToExam > 0 && (
              <>
                ，今天是第 <b className="num">{todayIdx + 1}</b> 天，距考试还有 <b className="num">{daysToExam}</b> 天
              </>
            )}
            。点任意一天可调整那天的时长。
          </>
        }
        actions={
          <Button variant="secondary" icon="clock" onClick={() => setDefaultOpen(true)}>
            默认每天 {hours(state.profile.dailyMinutes)}
          </Button>
        }
      />

      <Overview state={state} days={days} groups={groups} today={today} />

      <div className="plan-phases">
        {groups.map((g) => (
          <PhaseBand key={g.phase} group={g} state={state} today={today} onEdit={setEditing} />
        ))}
      </div>

      <div className="plan-bottom">
        <TargetsCard state={state} />
        <StrategyCard />
      </div>

      <DurationDialog open={!!editing} date={editing ?? today} onClose={() => setEditing(null)} allowRest />
      <DefaultDialog open={defaultOpen} onClose={() => setDefaultOpen(false)} />
    </div>
  );
}

// ─────────────────────────── Overview strip ───────────────────────────

function Overview({ state, days, groups, today }: { state: AppState; days: DaySkeleton[]; groups: PhaseGroup[]; today: string }) {
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
  const cols = { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` };

  return (
    <section className="card plan-overview">
      <div className="plan-ov-stats">
        <OvStat icon="clock" value={hours(Math.round(stats.seconds / 60))} label="已学习" />
        <OvStat icon="flame" value={`${stats.studied} 天`} label="学满 30 分钟" />
        <OvStat icon="checkCircle" value={`${stats.done}/${stats.blocks}`} label="完成学习块" />
        <OvStat icon="calendar" value={hours(stats.remaining)} label="剩余计划时长" />
      </div>
      <div className="plan-ov-track" style={cols}>
        {days.map((d) => {
          const log = state.days[d.date];
          const ratio = d.budget ? Math.min(1, (log?.seconds ?? 0) / 60 / d.budget) : 0;
          return (
            <span
              key={d.date}
              className={cx('plan-ov-seg', `tone-${PHASE_TONE[d.phase]}`, d.date < today && 'is-past', d.date === today && 'is-today', d.budget === 0 && d.phase !== 'exam' && 'is-rest')}
              title={`${fmtDateShort(d.date)} ${weekdayZh(d.date)}`}
            >
              {d.date < today && <span className="plan-ov-fill" style={{ height: `${Math.max(ratio, 0.08) * 100}%` }} />}
              {d.date === today && <span className="plan-ov-today">今天</span>}
            </span>
          );
        })}
      </div>
      <div className="plan-ov-labels" style={cols}>
        {groups.map((g) => (
          <div key={g.phase} className={cx('plan-ov-label', `tone-${PHASE_TONE[g.phase]}`, g.days.length <= 2 && 'is-narrow')} style={{ gridColumn: `span ${g.days.length}` }}>
            <div className="plan-ov-label-in">
              <b>{g.phase === 'exam' ? '考试' : PHASE_INFO[g.phase].name}</b>
              <span className="num">{g.days.length === 1 ? shortDate(g.days[0].date) : `${shortDate(g.days[0].date)}–${shortDate(g.days[g.days.length - 1].date)}`}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function OvStat({ icon, value, label }: { icon: IconName; value: ReactNode; label: string }) {
  return (
    <div className="plan-ov-stat">
      <Icon name={icon} size={16} />
      <div>
        <div className="plan-ov-val num">{value}</div>
        <div className="plan-ov-lab">{label}</div>
      </div>
    </div>
  );
}

// ─────────────────────────── Phase bands ───────────────────────────

function PhaseBand({ group, state, today, onEdit }: { group: PhaseGroup; state: AppState; today: string; onEdit: (date: string) => void }) {
  const info = PHASE_INFO[group.phase];
  const first = group.days[0];
  const last = group.days[group.days.length - 1];
  const current = group.days.some((d) => d.date === today);
  const past = last.date < today;
  const total = group.days.reduce((s, d) => s + d.budget, 0);
  return (
    <section className={cx('plan-phase', `tone-${PHASE_TONE[group.phase]}`, current && 'is-current', past && 'is-past')}>
      <header className="plan-phase-head">
        <div className="plan-phase-title">
          <span className="plan-phase-dot" />
          <h2>{info.name}</h2>
          <span className="plan-phase-range num">
            {group.days.length === 1 ? `${fmtDateShort(first.date)} ${weekdayZh(first.date)}` : `${fmtDateShort(first.date)} – ${fmtDateShort(last.date)} · ${group.days.length} 天`}
            {total > 0 && ` · 共约 ${hours(total)}`}
          </span>
          {current && <Badge tone={PHASE_TONE[group.phase]}>当前阶段</Badge>}
          {past && (
            <Badge tone="neutral" icon="check">
              已结束
            </Badge>
          )}
        </div>
        <p className="plan-phase-desc">{info.desc}</p>
      </header>
      <div className={cx('plan-days', group.phase === 'exam' && 'is-exam')}>
        {group.days.map((d) => (
          <DayCell key={d.date} day={d} state={state} today={today} onEdit={onEdit} />
        ))}
      </div>
    </section>
  );
}

function DayCell({ day, state, today, onEdit }: { day: DaySkeleton; state: AppState; today: string; onEdit: (date: string) => void }) {
  const isToday = day.date === today;
  const past = day.date < today;
  const exam = day.phase === 'exam';
  const editable = !past && !exam;
  const override = state.profile.dayMinutes[day.date];
  const log = state.days[day.date];
  const plan = state.plans[day.date];
  const studiedMin = (log?.seconds ?? 0) / 60;
  const planned = plan ? plan.blocks.filter((b) => b.status !== 'skipped') : [];
  const doneBlocks = planned.filter((b) => b.status === 'done').length;
  const answered = log?.answered ?? 0;
  const mocksDone = day.mocks ? day.mocks.parts.every((p) => p.done) : false;

  const top = (
    <span className="plan-day-top">
      <span className="plan-day-date num">{shortDate(day.date)}</span>
      <span className="plan-day-wd">{weekdayZh(day.date)}</span>
      {!isToday && !past && <span className="plan-day-left num">{exam ? '考试' : `D-${day.daysLeft}`}</span>}
      {isToday && <span className="plan-day-today">今天</span>}
    </span>
  );

  let body: ReactNode;
  if (exam) {
    body = (
      <div className="plan-exam">
        <div className="plan-exam-title">
          <Icon name="flag" size={15} />
          EJU 考试日
        </div>
        <ul>
          <li>
            <span className="num">9:30</span>日本語
          </li>
          <li>
            <span className="num">13:30</span>理科
          </li>
          <li>
            <span className="num">15:40</span>数学
          </li>
        </ul>
      </div>
    );
  } else if (past) {
    body =
      studiedMin < 1 && !doneBlocks ? (
        <span className="plan-day-none">{day.budget ? '没有学习记录' : '休息日'}</span>
      ) : (
        <span className="plan-day-res">
          <span className="plan-day-bar">
            <span style={{ width: `${Math.min(100, day.budget ? (studiedMin / day.budget) * 100 : 100)}%` }} />
          </span>
          <span className="plan-day-res-main num">{hours(Math.round(studiedMin))}</span>
          <span className="plan-day-res-sub">
            {planned.length > 0 && (
              <span>
                {doneBlocks}/{planned.length} 块
              </span>
            )}
            {answered > 0 && <span>正确率 {pct((log?.correct ?? 0) / answered)}</span>}
          </span>
        </span>
      );
  } else {
    body = (
      <>
        <span className={cx('plan-day-budget', !day.budget && 'is-rest')}>
          {day.budget ? (
            <>
              <span className="num">{hours(day.budget)}</span>
            </>
          ) : (
            <>
              <Icon name="coffee" size={14} />
              休息
            </>
          )}
          {typeof override === 'number' && <span className="plan-day-adj">已调整</span>}
          <Icon name="pen" size={13} className="plan-day-edit" />
        </span>
        {isToday && (
          <span className="plan-day-now">
            <span>{studiedMin >= 1 ? `已学 ${compactMinutes(studiedMin)}` : '还没开始'}</span>
            {planned.length > 0 && <span>完成 {doneBlocks}/{planned.length} 块</span>}
          </span>
        )}
      </>
    );
  }

  const mocks = day.mocks && (
    <span className={cx('plan-mock', mocksDone && 'is-done')} title={day.mocks.title}>
      <Icon name={mocksDone ? 'checkCircle' : 'target'} size={13} />
      <span>{shortMockTitle(day.mocks.title)}</span>
    </span>
  );

  const cls = cx('plan-day', isToday && 'is-today', past && 'is-past', exam && 'is-exam', editable && 'is-editable', day.mocks && 'has-mock');
  if (!editable) {
    return (
      <div className={cls}>
        {top}
        {body}
        {mocks}
      </div>
    );
  }
  return (
    <button type="button" className={cls} onClick={() => onEdit(day.date)} title="调整这一天的学习时长">
      {top}
      {body}
      {mocks}
    </button>
  );
}

// ─────────────────────────── Targets & strategy ───────────────────────────

function TargetsCard({ state }: { state: AppState }) {
  const est = useMemo(() => estimateAll(state), [state]);
  const { baseline, targets } = state.profile;
  const sum = (m: Record<Subject, number>) => SUBJECT_ORDER.reduce((s, k) => s + m[k], 0);
  const totalBase = sum(baseline);
  const totalEst = SUBJECT_ORDER.reduce((s, k) => s + est[k].estimate, 0);
  const totalTarget = state.profile.targetTotal;

  const row = (key: string, label: ReactNode, base: number, cur: number, target: number, tone: string, extra?: string) => {
    const span = target - base;
    const progress = span > 0 ? Math.max(0, Math.min(1, (cur - base) / span)) : cur >= target ? 1 : 0;
    const gap = target - cur;
    return (
      <div key={key} className={cx('plan-tg-row', `tone-${tone}`, extra)}>
        <span className="plan-tg-subj">{label}</span>
        <span className="plan-tg-num num faint">{base}</span>
        <span className="plan-tg-num num plan-tg-cur">{cur}</span>
        <span className="plan-tg-num num">{target}</span>
        <span className="plan-tg-prog">
          <span className="plan-tg-bar">
            <span style={{ width: `${progress * 100}%` }} />
          </span>
          <span className={cx('plan-tg-gap', gap <= 0 && 'is-ok')}>{gap > 0 ? `差 ${gap}` : '已达标'}</span>
        </span>
      </div>
    );
  };

  return (
    <section className="card plan-targets">
      <div className="plan-card-head">
        <div>
          <h2 className="plan-h2">目标分配</h2>
          <p className="plan-card-sub">从起点到目标的提分进度（预测值，随做题和模考更新）</p>
        </div>
      </div>
      <div className="plan-tg-table">
        <div className="plan-tg-row plan-tg-headrow">
          <span>科目</span>
          <span className="plan-tg-num">起点</span>
          <span className="plan-tg-num">预测</span>
          <span className="plan-tg-num">目标</span>
          <span>提分进度</span>
        </div>
        {SUBJECT_ORDER.map((s) => row(s, <SubjectTag subject={s} size="sm" />, baseline[s], est[s].estimate, targets[s], s))}
        {row('total', <span className="plan-tg-total">合计</span>, totalBase, totalEst, totalTarget, 'primary', 'is-total')}
      </div>
      <p className="plan-tg-note">
        满分：日语 {SCALE_MAX.japanese} · 数学 {SCALE_MAX.math} · 物理 {SCALE_MAX.physics} · 化学 {SCALE_MAX.chemistry}（理科两科合计 200）
      </p>
    </section>
  );
}

const STRATEGY: { icon: IconName; title: string; text: string }[] = [
  { icon: 'layers', title: '先补知识，再练速度', text: '前期按「薄弱度 × 考频」轮换专题，把遗忘的知识先捡回来；之后整卷限时模考，练节奏和时间分配。' },
  { icon: 'trending', title: '每天自动调整', text: '计划按你最新的正确率、用时和离目标的差距生成，差距越大的科目分到的时间越多。' },
  { icon: 'refresh', title: '错题自动回炉', text: '做错或没把握的题会在 1、2、4 天后回来，连续三次隔天答对才移出错题本。' },
  { icon: 'flag', title: '按考试日的顺序', text: '模考按 日语 → 理科 → 数学 的顺序安排；考前最后几天减量，把状态留给考场。' },
];

function StrategyCard() {
  return (
    <section className="card plan-strategy">
      <div className="plan-card-head">
        <h2 className="plan-h2">计划是怎么安排的</h2>
      </div>
      <ul className="plan-st-list">
        {STRATEGY.map((s) => (
          <li key={s.title}>
            <span className="plan-st-icon">
              <Icon name={s.icon} size={16} />
            </span>
            <div>
              <div className="plan-st-title">{s.title}</div>
              <div className="plan-st-text">{s.text}</div>
            </div>
          </li>
        ))}
      </ul>
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
    toast(`默认每天 ${hours(minutes)}，今天的计划已更新`, 'success');
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
        <div className="plan-def-grid">
          {DEFAULT_PRESETS.map((h) => (
            <button key={h} type="button" className={cx('plan-def-opt', minutes === h * 60 && 'is-on')} onClick={() => setMinutes(h * 60)}>
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
