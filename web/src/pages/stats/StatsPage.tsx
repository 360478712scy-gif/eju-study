// 数据: score prediction with the one thing to do next, subjects, topic mastery, study time,
// accuracy and pace, vocabulary, the science paper and mocks.
import { useMemo, useState } from 'react';
import type { AppState, MockKind, Subject } from '@shared/types.ts';
import type { BankIndex } from '@shared/bank.ts';
import { MOCK_LABEL, sessionLabel } from '@shared/bank.ts';
import { estimateAll, paceStats, SCALE_MAX, streak, topicStats, type PaceStat, type SubjectEstimate, type TopicStat } from '@shared/stats.ts';
import { addDays, dateRange, daysBetween, parseDate, weekdayZh } from '@shared/dates.ts';
import { budgetFor, shortTopic, vocabDueCount, vocabSkills } from '@shared/planner.ts';
import { useReady } from '../../lib/store.ts';
import { navigate } from '../../lib/router.ts';
import { cx, fmtDateShort, fmtMinutes, pct, SUBJECT_NAME } from '../../lib/format.ts';
import {
  Badge,
  Button,
  Card,
  Chip,
  Empty,
  IconTile,
  Legend,
  Meta,
  PageHeader,
  Progress,
  Section,
  Segmented,
  StatTile,
  SubjectDot,
  SubjectTag,
  Tooltip,
} from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import { SUBJECT_ORDER, launch } from '../mistakes/helpers.ts';
import { pickDrill, reservedMap } from '../practice/practiceData.ts';
import { MockTable } from '../mock/MockList.tsx';
import { isLowData, lowDataNote, shownScore, TOTAL_MAX } from '../today/scores.ts';
import {
  BAND_TEXT,
  COLOR,
  finishOf,
  finishVerdict,
  masteryBand,
  PACE_MIN_SAMPLES,
  SCIENCE_ITEMS,
  SCIENCE_TOTAL,
  targetRatio,
  WEAK_BELOW,
  type Finish,
  type ScienceSubject,
} from './model.ts';
import { ScoreBar, Spark, StudyBars, type DayBar, type TrendPoint } from './charts.tsx';
import '../mock/mock.css';
import './stats.css';

const EST_ORDER: Subject[] = ['japanese', 'math', 'physics', 'chemistry'];
const SCIENCE: ScienceSubject[] = ['physics', 'chemistry'];

function shortLabel(d: string): string {
  const dt = parseDate(d);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

/** Questions finished in 80 minutes per science subject, and for the whole paper once both are known. */
function scienceFinish(est: Record<Subject, SubjectEstimate>): Record<ScienceSubject, Finish | null> & { all: Finish | null } {
  const physics = finishOf('physics', est.physics.completion);
  const chemistry = finishOf('chemistry', est.chemistry.completion);
  return { physics, chemistry, all: physics && chemistry ? { done: physics.done + chemistry.done, total: SCIENCE_TOTAL } : null };
}

export function StatsPage() {
  const { state, bank, today } = useReady();
  const { attempts, mocks, profile } = state;

  const est = useMemo(() => estimateAll(state, bank), [attempts, mocks, profile, bank]);
  const pace = useMemo(() => paceStats(state, bank), [attempts, bank]);
  const stats = useMemo(() => topicStats(state, bank), [attempts, profile, bank]);

  // Estimate trend: the day before the sprint (baseline) through today.
  const trend = useMemo(() => {
    const from = [addDays(profile.startDate, -1), addDays(today, -20)].sort()[1];
    return dateRange(from, today).map((d, i) => {
      const e = estimateAll({ ...state, attempts: attempts.filter((a) => a.date <= d), mocks: mocks.filter((m) => m.date <= d) }, bank);
      return { date: d, label: i === 0 && d < profile.startDate ? '起点' : fmtDateShort(d), est: e };
    });
  }, [attempts, mocks, profile, today, bank]);

  // Topics furthest below target, weighted by how often the exam asks them.
  const weakest = useMemo(() => {
    const list: Weak[] = [];
    for (const [id, info] of bank.topics) {
      const st = stats.get(id);
      if (!st || st.attempts < 2 || !bank.byTopic.get(id)?.length) continue;
      const target = targetRatio(state, info.subject);
      const gap = st.mastery - target;
      if (gap < 0) list.push({ id, subject: info.subject, stat: st, gap, target, weight: info.weight });
    }
    return list.sort((a, b) => a.gap * (1 + a.weight / 5) - b.gap * (1 + b.weight / 5)).slice(0, 6);
  }, [stats, bank, state]);

  const focusCount = useMemo(
    () => (weakest[0] ? pickDrill(state, bank.byTopic.get(weakest[0].id) ?? [], 8, reservedMap(state, bank), today + weakest[0].id).ids.length : 0),
    [weakest, state, bank, today],
  );

  const drill = (id: string) => {
    // Same picking rule as 题库练习: never-seen first, avoiding papers held for upcoming mocks.
    const pick = pickDrill(state, bank.byTopic.get(id) ?? [], 8, reservedMap(state, bank), today + id);
    launch({ kind: 'drill', title: `专项 · ${shortTopic(bank, id)}`, items: pick.ids.map((x) => bank.byId.get(x)!).filter(Boolean) });
  };

  return (
    <div className="page st-page">
      <PageHeader title="数据" desc="预测只算第一次作答，当趋势看，别当成绩单。" info={RULES} />
      <ScoreHero est={est} trend={trend} state={state} today={today} focus={focusCount ? weakest[0] : undefined} focusCount={focusCount} bank={bank} onDrill={drill} />
      <div className="grid grid-4 st-subjects">
        {EST_ORDER.map((s) => (
          <SubjectCard key={s} e={est[s]} pace={pace[s]} trend={trend.map((t) => ({ label: t.label, value: shownScore(t.est[s]) }))} />
        ))}
      </div>

      <Mastery state={state} bank={bank} stats={stats} weakest={weakest} />

      <div className="st-two">
        <StudyTime state={state} today={today} />
        <Accuracy state={state} today={today} pace={pace} />
      </div>

      <div className="st-two is-pair">
        <Vocab state={state} bank={bank} today={today} />
        <ScienceFinish est={est} pace={pace} />
      </div>

      <Mocks state={state} />
    </div>
  );
}

interface Weak {
  id: string;
  subject: Subject;
  stat: TopicStat;
  gap: number;
  target: number;
  weight: number;
}

const RULES = '预测只算每题的第一次作答，以官方真题为主；理科再按你现在的答题速度，折算成 80 分钟内能拿到的分。某科首答不到 30 题时数据还少，先按起点算，并给出大约的区间。';

/** The total as Today and Plan show it: subjects with little data count at their starting score. */
function shownTotal(est: Record<Subject, SubjectEstimate>): number {
  return EST_ORDER.reduce((s, k) => s + shownScore(est[k]), 0);
}

// ───────────────────────── Score prediction ─────────────────────────

function ScoreHero({
  est,
  trend,
  state,
  today,
  focus,
  focusCount,
  bank,
  onDrill,
}: {
  est: Record<Subject, SubjectEstimate>;
  trend: { label: string; est: Record<Subject, SubjectEstimate> }[];
  state: AppState;
  today: string;
  focus?: Weak;
  focusCount: number;
  bank: BankIndex;
  onDrill: (id: string) => void;
}) {
  const p = state.profile;
  const total = shownTotal(est);
  const baseline = EST_ORDER.reduce((s, k) => s + p.baseline[k], 0);
  const target = p.targetTotal;
  const below = Math.round(Math.sqrt(EST_ORDER.reduce((s, k) => s + (est[k].estimate - est[k].low) ** 2, 0)));
  const above = Math.round(Math.sqrt(EST_ORDER.reduce((s, k) => s + (est[k].high - est[k].estimate) ** 2, 0)));
  const gap = target - total;
  const delta = total - baseline;
  const daysLeft = daysBetween(today, p.examDate);
  const left = Math.max(1, daysLeft);
  const perDay = gap > 0 ? gap / left : 0;
  const totals: TrendPoint[] = trend.map((t) => ({ label: t.label, value: shownTotal(t.est) }));
  const samples = EST_ORDER.reduce((s, k) => s + est[k].samples, 0);
  const sprinting = daysLeft > 1;

  return (
    <section className="card card-hero st-hero">
      <div className="st-hero-main">
        <div className="t-eyebrow">预测总分</div>
        <div className="st-hero-score">
          <span className="num num-2xl">{total}</span>
          <span className="num-unit">/ {TOTAL_MAX}</span>
          {delta > 0 ? (
            <Badge tone="success" icon="trending">
              较起点 +{delta}
            </Badge>
          ) : (
            <Chip>{delta < 0 ? `较起点 ${delta}` : '和起点持平'}</Chip>
          )}
        </div>
        <div className="st-hero-bar">
          <ScoreBar size="lg" label="总分" value={total} max={TOTAL_MAX} target={target} />
        </div>
        <Meta className="st-hero-meta">
          <span>
            大约 <span className="num">{total - below}–{total + above}</span>
          </span>
          <span>{gap > 0 ? <>离目标还差 <span className="num">{gap}</span> 分</> : '已到目标线'}</span>
        </Meta>
      </div>
      <div className="st-hero-side">
        <div className="st-hero-trend">
          <div className="st-hero-trend-head">
            <span>每天的预测</span>
            <span className="num">{samples} 题样本</span>
          </div>
          {samples > 0 ? (
            <Spark points={totals} name="预测总分" height={96} reference={baseline} />
          ) : (
            <p className="st-hero-trend-empty">做几组题后，这里会画出每天的预测。</p>
          )}
          {samples > 0 && totals.length > 1 && (
            <div className="st-hero-trend-foot">
              <span>
                {totals[0].label} <b className="num">{Math.round(totals[0].value)}</b>
              </span>
              <span>
                今天 <b className="num">{Math.round(totals[totals.length - 1].value)}</b>
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="st-next">
        <IconTile icon={!sprinting ? 'coffee' : focus ? 'target' : 'sparkles'} tone={focus && sprinting ? focus.subject : 'neutral'} size="md" />
        <div className="st-next-text">
          {daysLeft < 0 ? (
            <>
              <b>考试已经结束，辛苦了</b>
              <span>
                冲刺期间预测从 {baseline} 到了 <span className="num">{total}</span>，一共做了 <span className="num">{firstTries(state)}</span> 道题。
              </span>
            </>
          ) : daysLeft === 0 ? (
            <>
              <b>今天考试</b>
              <span>照平时的节奏做，先把会做的题做对。</span>
            </>
          ) : daysLeft === 1 ? (
            <>
              <b>明天就考了</b>
              <span>今天只做轻量复习、早点睡。</span>
            </>
          ) : focus ? (
            <>
              <b>
                先补「{shortTopic(bank, focus.id)}」：掌握 <span className="num">{pct(focus.stat.mastery)}</span>，目标 <span className="num">{pct(focus.target)}</span>
              </b>
              <span>{gap > 0 ? `还有 ${left} 天，平均每天涨 ${perDay.toFixed(1)} 分就能到目标。` : '已到目标线，接下来补弱项、稳住正确率。'}</span>
            </>
          ) : (
            <>
              <b>{gap > 0 ? `还有 ${left} 天，平均每天涨 ${perDay.toFixed(1)} 分就够` : '已到目标线'}</b>
              <span>还没有明显的薄弱考点，按今天的计划做就好。</span>
            </>
          )}
        </div>
        {sprinting &&
          (focus ? (
            <Button variant="primary" icon="play" onClick={() => onDrill(focus.id)}>
              练 {shortTopic(bank, focus.id)} · {focusCount} 题
            </Button>
          ) : (
            <Button variant="primary" iconRight="arrowRight" onClick={() => navigate('/')}>
              去做今天的任务
            </Button>
          ))}
      </div>
    </section>
  );
}

/** Questions answered for the first time (what the estimates are built on). */
function firstTries(state: AppState): number {
  return state.attempts.filter((a) => a.firstTry).length;
}

function SubjectCard({ e, pace, trend }: { e: SubjectEstimate; pace: PaceStat; trend: TrendPoint[] }) {
  const max = SCALE_MAX[e.subject];
  const value = shownScore(e);
  const low = isLowData(e);
  const reached = value >= e.target;
  return (
    <section className={cx('card st-subj', `tone-${e.subject}`)}>
      <header className="st-subj-head">
        <SubjectTag subject={e.subject} size="sm" />
        <span className="st-subj-n">{e.samples ? `近 ${e.samples} 题` : '暂无作答'}</span>
      </header>
      <div className="st-subj-mid">
        <div className="st-subj-score">
          <span className="num num-lg">{value}</span>
          <span className="st-of num">/ {max}</span>
        </div>
        {e.samples > 0 && (
          <div className="st-subj-spark">
            <Spark points={trend} name={`${SUBJECT_NAME[e.subject]}预测`} color="var(--text-3)" dot={COLOR[e.subject]} height={34} reference={e.baseline} />
          </div>
        )}
      </div>
      <div className={cx('st-subj-bar', low && 'is-low')}>
        <ScoreBar label={SUBJECT_NAME[e.subject]} value={value} max={max} target={e.target} tone={e.subject} />
      </div>
      <footer className="st-subj-foot">
        <Tooltip label={lowDataNote(e) ?? `起点 ${e.baseline} · 区间 ${e.low}–${e.high}`}>
          <span className="st-subj-range" tabIndex={0}>
            {low ? '数据还少' : <>起点 <span className="num">{e.baseline}</span></>}
            <span className="st-sep">·</span>约 <span className="num">{e.low}–{e.high}</span>
          </span>
        </Tooltip>
        {reached ? (
          <span className="st-ok">
            <Icon name="check" size={13} />
            已达标
          </span>
        ) : (
          <span className="st-gap">
            还差 <span className="num">{e.target - value}</span>
          </span>
        )}
      </footer>
      <SubjectExtra e={e} pace={pace} />
    </section>
  );
}

/** One more line under each subject: Japanese halves, math first-try accuracy, science finish share. */
function SubjectExtra({ e, pace }: { e: SubjectEstimate; pace: PaceStat }) {
  if (e.subject === 'japanese') {
    const half = e.target / 2;
    const parts = e.parts ?? { reading: Math.round(e.estimate / 2), listening: Math.round(e.estimate / 2) };
    return (
      <div className="st-subj-extra st-halves">
        {(
          [
            ['reading', '读解'],
            ['listening', '听解'],
          ] as const
        ).map(([k, label]) => (
          <div key={k} className="st-half">
            <div className="st-extra-line">
              <span>{label}</span>
              <span className="num">
                <b>{parts[k]}</b>
                <span className="st-of"> / 200</span>
              </span>
            </div>
            <Meter value={parts[k] / 200} mark={half / 200} label={`${label}预测 ${parts[k]} / 200，目标约 ${Math.round(half)}`} />
          </div>
        ))}
      </div>
    );
  }
  if (e.subject === 'math') {
    const goal = e.target / SCALE_MAX.math;
    return (
      <div className="st-subj-extra">
        <div className="st-extra-line">
          <span>首答正确率</span>
          {e.accuracy !== null ? <b className="num">{pct(e.accuracy)}</b> : <span className="st-of">还没有</span>}
        </div>
        <Meter value={e.accuracy ?? 0} mark={goal} label={`首答正确率 ${e.accuracy !== null ? pct(e.accuracy) : '—'}，目标 ${pct(goal)}`} />
      </div>
    );
  }
  const f = finishOf(e.subject, e.completion);
  if (!f) {
    return (
      <div className="st-subj-extra">
        <div className="st-extra-line">
          <span>80 分钟能做完多少</span>
          <span className="st-of">再做 {Math.max(1, PACE_MIN_SAMPLES - pace.samples)} 题</span>
        </div>
        <Meter value={0} label="用时数据还不够" />
      </div>
    );
  }
  const v = finishVerdict(f);
  return (
    <div className="st-subj-extra">
      <div className="st-extra-line">
        <span>
          80 分钟约做完 <b className="num">{f.done}</b>
          <span className="st-of num"> / {f.total}</span>
        </span>
        <span className={cx('st-verdict', `tone-${v.tone}`)}>{v.text}</span>
      </div>
      <Meter value={f.done / f.total} label={`80 分钟约做完 ${f.done} / ${f.total} 题`} />
    </div>
  );
}

function Meter({ value, mark, label }: { value: number; mark?: number; label: string }) {
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  return (
    <span className="st-meter" role="img" aria-label={label}>
      {value > 0 && <i style={{ width: `${clamp(value) * 100}%` }} />}
      {mark !== undefined && <em style={{ left: `${clamp(mark) * 100}%` }} />}
    </span>
  );
}


// ───────────────────────── Study time ─────────────────────────

/** "4 小时 17 分" (the words fmtMinutes uses) with the units set small next to tabular digits. */
function HM({ min }: { min: number }) {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) {
    return (
      <>
        {r}
        <span className="st-u">分钟</span>
      </>
    );
  }
  return (
    <>
      {h}
      <span className="st-u">小时</span>
      {r > 0 && (
        <>
          {' '}
          {r}
          <span className="st-u">分</span>
        </>
      )}
    </>
  );
}

/** Days shown in the study-time chart: since the sprint started (at most 14), padded with the next planned days to a week. */
const MIN_DAYS = 7;

function StudyTime({ state, today }: { state: AppState; today: string }) {
  const start = state.profile.startDate;
  const exam = state.profile.examDate;
  const bars = useMemo<DayBar[]>(() => {
    const from = [start, addDays(today, -13)].sort()[1];
    const past = dateRange(from, today);
    const ahead = Math.max(0, MIN_DAYS - past.length);
    const future = ahead ? dateRange(addDays(today, 1), [addDays(today, ahead), exam].sort()[0]) : [];
    return [...past, ...future].map((d, i) => {
      const log = state.days[d];
      const isFuture = d > today;
      return {
        date: d,
        label: d === today ? '今天' : i === 0 || d.endsWith('-01') ? shortLabel(d) : String(parseDate(d).getDate()),
        minutes: isFuture ? 0 : (log?.seconds ?? 0) / 60,
        budget: d < start ? null : (state.plans[d]?.budgetMinutes ?? budgetFor(state, d)),
        answered: log?.answered ?? 0,
        correct: log?.correct ?? 0,
        isToday: d === today,
        isFuture,
        title: `${fmtDateShort(d)} ${weekdayZh(d)}`,
      };
    });
  }, [state, today, start, exam]);
  const sum = (from: string) => Object.entries(state.days).reduce((s, [d, l]) => (d >= from && d <= today ? s + l.seconds : s), 0) / 60;
  const dow = parseDate(today).getDay();
  const weekFrom = addDays(today, -((dow + 6) % 7));
  const week = sum(weekFrom);
  const all = sum(start);
  const sinceDays = Math.max(1, daysBetween(start, today) + 1);
  const todayMin = (state.days[today]?.seconds ?? 0) / 60;
  const todayBudget = state.plans[today]?.budgetMinutes ?? budgetFor(state, today);
  const st = streak(state, today);
  const recent = sinceDays <= 14;

  return (
    <Card title="学习时长" subtitle={recent ? `${fmtDateShort(start)}开始 · 第 ${sinceDays} 天` : '最近 14 天'} icon="clock" className="st-card">
      <div className="st-kpis">
        <StatTile label="今天" value={<HM min={todayMin} />} sub={todayBudget ? `计划 ${fmtMinutes(todayBudget)}` : '休息日'} />
        <StatTile label="本周" value={<HM min={week} />} sub="周一起算" />
        <StatTile label="开始以来" value={<HM min={all} />} sub={`日均 ${fmtMinutes(all / sinceDays)}`} />
        <StatTile label="连续学习" value={st} unit="天" sub="每天 ≥30 分钟" />
      </div>
      <StudyBars days={bars} />
      <Legend
        className="st-legend"
        items={[
          { label: '实际学习', color: 'var(--mixed)', shape: 'square' },
          { label: '当天计划', color: 'var(--text-2)', shape: 'bar' },
        ]}
      />
    </Card>
  );
}

// ───────────────────────── Accuracy and pace ─────────────────────────

function paceVerdict(r: number | null): { text: string; tone: 'warning' | 'success' | 'neutral'; say: string } {
  if (r === null) return { text: '数据不足', tone: 'neutral', say: '首次作答的题还不够，做几组就有数了。' };
  if (r > 1.6) return { text: '明显偏慢', tone: 'warning', say: `每题用时是考场节奏的 ${r.toFixed(1)} 倍，考试会做不完。练习时开计时，卡住先跳。` };
  if (r > 1.15) return { text: '偏慢', tone: 'warning', say: `比考场节奏慢 ${Math.round((r - 1) * 100)}%。熟悉题型后先追速度，再追正确率。` };
  if (r < 0.7) return { text: '偏快', tone: 'neutral', say: '比考场节奏快不少，时间有富余，留一点给检查和难题。' };
  return { text: '正常', tone: 'success', say: '和考场节奏差不多，保持住。' };
}

/** Accuracy against the target per subject, and first-try pace against the exam, in one table. */
function Accuracy({ state, today, pace }: { state: AppState; today: string; pace: Record<Subject, PaceStat> }) {
  const start = state.profile.startDate;
  const from = [start, addDays(today, -13)].sort()[1];
  const rows = useMemo(() => {
    const agg = new Map<Subject, { n: number; s: number }>();
    for (const a of state.attempts) {
      if (a.date < from || a.date > today) continue;
      const v = agg.get(a.subject) || { n: 0, s: 0 };
      v.n += 1;
      v.s += a.score;
      agg.set(a.subject, v);
    }
    return SUBJECT_ORDER.map((s) => {
      const v = agg.get(s);
      return { subject: s, n: v?.n ?? 0, value: v && v.n ? v.s / v.n : null, target: targetRatio(state, s) };
    });
  }, [state, from, today]);

  return (
    <Card title="正确率与答题节奏" subtitle={`${from === start ? '开始以来' : '最近 14 天'} · 竖线是目标分对应的正确率`} icon="trending" className="st-card">
      <div className="st-acc" role="table" aria-label="各科正确率与答题节奏">
        <div className="st-acc-row is-head" role="row">
          <span role="columnheader">科目</span>
          <span role="columnheader">正确率</span>
          <span role="columnheader" className="is-num" />
          <span role="columnheader" className="is-num">
            节奏
          </span>
        </div>
        {rows.map((r) => {
          const p = pace[r.subject];
          const v = paceVerdict(p.ratio);
          const band = r.value === null ? 'none' : r.value >= r.target ? 'good' : r.value >= WEAK_BELOW ? 'near' : 'weak';
          return (
            <div key={r.subject} className={cx('st-acc-row', `band-${band}`)} role="row">
              <span className="st-acc-name" role="cell">
                <SubjectDot subject={r.subject} />
                {SUBJECT_NAME[r.subject]}
              </span>
              <span className="st-acc-bar" role="cell">
                <Meter value={r.value ?? 0} mark={r.target} label={`${SUBJECT_NAME[r.subject]}正确率 ${pct(r.value)}，目标 ${pct(r.target)}`} />
              </span>
              <span className="st-acc-val is-num" role="cell">
                {r.value !== null ? <b className="num">{pct(r.value)}</b> : <span className="st-of">—</span>}
                <span className="st-of num">
                  {r.n ? ` · ${r.n} 题` : ' · 还没做'}
                </span>
              </span>
              <Tooltip label={`${v.say}${p.samples ? `（${p.samples} 题首答）` : ''}`}>
                <span className="st-acc-pace is-num" role="cell" tabIndex={0}>
                  {p.ratio !== null && <span className="num">{p.ratio >= 2.5 ? '>2.5' : p.ratio.toFixed(1)}×</span>}
                  <span className={cx('st-verdict', `tone-${v.tone}`)}>{v.text}</span>
                </span>
              </Tooltip>
            </div>
          );
        })}
      </div>
      <p className="st-acc-note">节奏 = 首答用时中位数 ÷ 考场节奏，0.85–1.15× 算正常。</p>
    </Card>
  );
}

// ───────────────────────── Topic mastery ─────────────────────────

function Mastery({ state, bank, stats, weakest }: { state: AppState; bank: BankIndex; stats: Map<string, TopicStat>; weakest: Weak[] }) {
  const [subject, setSubject] = useState<Subject>(() => {
    // Open on the measured subject furthest below its target (fall back to the prior gap).
    const est = estimateAll(state, bank);
    const gap = (s: Subject) => (est[s].target - est[s].estimate) / SCALE_MAX[s] + (est[s].samples > 0 ? 1 : 0);
    return [...SUBJECT_ORDER].sort((a, b) => gap(b) - gap(a))[0];
  });
  const target = targetRatio(state, subject);
  const units = bank.bundle.taxonomy.subjects[subject].units;

  return (
    <Card
      title="考点掌握度"
      subtitle="点一个考点看笔记和真题"
      icon="grid"
      className="st-card st-mastery-card"
      actions={<Segmented<Subject> size="sm" value={subject} onChange={setSubject} options={SUBJECT_ORDER.map((s) => ({ value: s, label: SUBJECT_NAME[s] }))} />}
    >
      {weakest.length > 0 && (
        <div className="st-weak" aria-label="最该补的考点">
          <span className="t-eyebrow st-weak-title">最该补</span>
          {weakest.map((w) => (
            <Tooltip key={w.id} label={`${SUBJECT_NAME[w.subject]} · 掌握 ${pct(w.stat.mastery)}，目标 ${pct(w.target)} · 做过 ${w.stat.attempts} 次`}>
              <button type="button" className={cx('st-weak-chip', w.stat.mastery < WEAK_BELOW && 'is-weak')} onClick={() => navigate('/notes/' + w.id)}>
                <SubjectDot subject={w.subject} />
                {shortTopic(bank, w.id)}
                <span className="num">{pct(w.stat.mastery)}</span>
              </button>
            </Tooltip>
          ))}
        </div>
      )}
      <div className="st-mastery">
        <div className="st-heat">
          <div className="st-heat-cols">
            {units.map((u) => (
              <div key={u.id} className="st-heat-unit">
                <div className="st-heat-unit-name">{u.name}</div>
                {u.topics.map((t) => {
                  const st = stats.get(t.id);
                  const band = masteryBand(st, target);
                  const count = bank.byTopic.get(t.id)?.length ?? 0;
                  const att = st?.attempts ?? 0;
                  const m = st?.mastery ?? 0;
                  const tip = `${shortName(t.name)} · ${BAND_TEXT[band]}${att ? ` ${pct(m)} · 做过 ${att} 次` : ''} · 题库 ${count} 题`;
                  return (
                    <Tooltip key={t.id} label={tip} side="right">
                      <button type="button" className={cx('st-topic', `band-${band}`, count === 0 && 'is-empty')} onClick={() => navigate('/notes/' + t.id)}>
                        <span className="st-topic-name">{shortName(t.name)}</span>
                        <span className="st-topic-bar" aria-hidden>
                          {att > 0 && <i style={{ width: `${Math.max(4, Math.min(100, m * 100))}%` }} />}
                        </span>
                        <span className="st-topic-val num">{att ? pct(m) : ''}</span>
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </div>
          <Legend
            className="st-heat-legend"
            items={[
              { label: `达标 ≥${pct(target)}`, tone: 'success', shape: 'bar' },
              { label: '未达标', color: 'var(--text-3)', shape: 'bar' },
              { label: '薄弱 <50%', tone: 'danger', shape: 'bar' },
              { label: '还没练', color: 'var(--border-strong)', shape: 'bar' },
            ]}
          />
        </div>
      </div>
    </Card>
  );
}

function shortName(name: string): string {
  return name.replace(/（[^）]*）/g, '');
}

// ───────────────────────── Science paper ─────────────────────────

/** 理科整卷：19 physics + 20 chemistry questions in 80 minutes, at the current pace. */
function ScienceFinish({ est, pace }: { est: Record<Subject, SubjectEstimate>; pace: Record<Subject, PaceStat> }) {
  const sci = scienceFinish(est);
  const rows = SCIENCE.map((s) => ({ s, f: sci[s], need: Math.max(1, PACE_MIN_SAMPLES - pace[s].samples) }));
  const known = rows.filter((r) => r.f);
  const done = known.reduce((n, r) => n + r.f!.done, 0);
  const total = known.reduce((n, r) => n + r.f!.total, 0);
  const v = finishVerdict({ done, total });
  const left = total - done;
  const whole = known.length === SCIENCE.length;
  return (
    <Card title="理科整卷做得完吗" subtitle={`物理 ${SCIENCE_ITEMS.physics} 题 + 化学 ${SCIENCE_ITEMS.chemistry} 题，共 80 分钟`} icon="timer" className="st-card">
      {!known.length ? (
        <p className="st-finish-say">
          物理、化学各做满 {PACE_MIN_SAMPLES} 道新题，就能按你的速度算出 80 分钟约能做完多少题。现在还差：
          {rows.map((r) => `${SUBJECT_NAME[r.s]} ${r.need} 题`).join('，')}。
        </p>
      ) : (
        <div className="st-finish">
          <div className="st-finish-top">
            <span className="st-finish-num">
              <span className="st-finish-label">{whole ? '80 分钟约能做完' : `${SUBJECT_NAME[known[0].s]}部分约能做完`}</span>
              <span className="num num-lg">{done}</span>
              <span className="num-unit">/ {total} 题</span>
            </span>
            <Badge tone={v.tone}>{v.text}</Badge>
          </div>
          <div className="st-finish-cells" role="img" aria-label={rows.map((r) => `${SUBJECT_NAME[r.s]} ${r.f ? `${r.f.done} / ${r.f.total}` : '未知'}`).join('，')}>
            {rows.map(({ s, f }) => (
              <span key={s} className={cx('st-cells', `tone-${s}`)} style={{ flexGrow: SCIENCE_ITEMS[s] }}>
                {Array.from({ length: SCIENCE_ITEMS[s] }, (_, i) => (
                  <i key={i} className={!f ? 'is-unknown' : i < f.done ? 'is-on' : 'is-off'} />
                ))}
              </span>
            ))}
          </div>
          <div className="st-finish-legend">
            {rows.map(({ s, f, need }) => (
              <span key={s}>
                <SubjectDot subject={s} />
                {SUBJECT_NAME[s]}
                {f ? (
                  <span className="num">
                    <b>{f.done}</b> / {f.total}
                  </span>
                ) : (
                  <span className="st-of">再做 {need} 道新题才有数</span>
                )}
              </span>
            ))}
          </div>
          <p className="st-finish-say">
            {left === 0 ? '按现在的速度能做完，还能留几分钟检查。' : `最后约 ${left} 题来不及做、只能蒙。练习时开计时，卡住先跳，回头再做。`}
          </p>
        </div>
      )}
    </Card>
  );
}

// ───────────────────────── Vocabulary ─────────────────────────

/** A skill counts as 已稳 from level 3, as on the vocab page. */
const SOLID_BOX = 3;

function Vocab({ state, bank, today }: { state: AppState; bank: BankIndex; today: string }) {
  const v = useMemo(() => {
    let learned = 0;
    let solid = 0;
    // Only the skills each word trains, with the vocab page's rules: 已学 = any skill started, 已稳 = every skill at level 3+.
    for (const w of bank.bundle.vocab) {
      const vp = state.vocab[w.id];
      if (!vp) continue;
      const skills = vocabSkills(w);
      if (!skills.some((k) => vp[k])) continue;
      learned += 1;
      if (skills.every((k) => (vp[k]?.box ?? 0) >= SOLID_BOX)) solid += 1;
    }
    // Cards, the same number as Today, the vocab page and the day plan (读音 and 词义 count separately).
    const due = vocabDueCount(state, bank, today);
    const acc = { read: { n: 0, c: 0 }, meaning: { n: 0, c: 0 } };
    const weekFrom = addDays(today, -6);
    let week = 0;
    for (const a of state.vocabAttempts) {
      acc[a.skill].n += 1;
      acc[a.skill].c += a.correct ? 1 : 0;
      if (a.date >= weekFrom) week += 1;
    }
    return { learned, solid, due, acc, week, total: bank.bundle.vocab.length };
  }, [state.vocab, state.vocabAttempts, bank, today]);
  const learning = v.learned - v.solid;
  const fresh = v.total - v.learned;

  return (
    <Card
      title="词汇"
      subtitle={`题库 ${v.total} 个 EJU 高频词`}
      icon="languages"
      className="st-card"
      actions={
        <Button size="sm" variant="ghost" iconRight="arrowRight" onClick={() => navigate('/vocab')}>
          {v.due ? `复习 ${v.due} 张卡` : '去背词'}
        </Button>
      }
    >
      <div className="st-vocab">
        <div className="st-vocab-top">
          <div className="st-vocab-big">
            <span className="t-eyebrow">已学的词</span>
            <span>
              <span className="num num-lg">{v.learned}</span>
              <span className="num-unit">/ {v.total}</span>
            </span>
          </div>
          <StatTile label="待复习" value={v.due} unit="张" />
          <StatTile label="近 7 天" value={v.week} unit="次" />
        </div>
        <div className="st-vstack" role="img" aria-label={`未学 ${fresh} 个，在学 ${learning} 个，已稳 ${v.solid} 个`}>
          {v.solid > 0 && <i className="is-solid" style={{ flexGrow: v.solid }} />}
          {learning > 0 && <i className="is-learning" style={{ flexGrow: learning }} />}
          {fresh > 0 && <i className="is-new" style={{ flexGrow: fresh }} />}
        </div>
        <Legend
          className="st-vstack-legend"
          items={[
            { label: '已稳', tone: 'success' as const, value: v.solid },
            { label: '在学', tone: 'japanese' as const, value: learning },
            { label: '未学', color: 'var(--border-strong)', value: fresh },
          ].filter((x) => x.value > 0)}
        />
        <div className="st-vbars">
          {(['read', 'meaning'] as const).map((k) => {
            const a = v.acc[k];
            const r = a.n ? a.c / a.n : 0;
            return (
              <div key={k} className="st-vbar">
                <div className="st-vbar-head">
                  <span>{k === 'read' ? '读音正确率' : '词义正确率'}</span>
                  <span className="num">
                    <b>{a.n ? pct(r) : '—'}</b>
                    <span className="st-of"> · {a.n} 次</span>
                  </span>
                </div>
                <Progress value={r} tone="mixed" size="sm" />
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

// ───────────────────────── Mocks ─────────────────────────

function Mocks({ state }: { state: AppState }) {
  const list = useMemo(() => [...state.mocks].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)), [state.mocks]);
  const kinds = useMemo(() => {
    const m = new Map<MockKind, TrendPoint[]>();
    for (const r of [...state.mocks].sort((a, b) => a.finishedAt.localeCompare(b.finishedAt))) {
      const arr = m.get(r.kind) || [];
      arr.push({ label: `${fmtDateShort(r.date)} ${sessionLabel(r.session)}`, value: r.estimate });
      m.set(r.kind, arr);
    }
    return [...m.entries()].filter(([, pts]) => pts.length >= 2);
  }, [state.mocks]);

  return (
    <Section
      title="模考记录"
      desc="整卷限时模考的估分（满分 200）"
      className="st-mocks"
      actions={
        <Button size="sm" variant="ghost" iconRight="arrowRight" onClick={() => navigate('/mock')}>
          模考中心
        </Button>
      }
    >
      {list.length === 0 ? (
        <div className="card">
          <Empty
            size="sm"
            icon="target"
            title="还没做过整卷模考"
            desc="冲刺计划会在考前 11 天开始安排整卷模考。也可以现在就去做一套，看看真实节奏。"
            action={
              <Button variant="secondary" iconRight="arrowRight" onClick={() => navigate('/mock')}>
                去模考
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {kinds.length > 0 && (
            <div className="st-mock-trends">
              {kinds.map(([k, pts]) => (
                <div key={k} className="card st-mock-trend">
                  <div className="st-mock-trend-head">
                    <span>{MOCK_LABEL[k]}</span>
                    <span className="num">
                      <b>{Math.round(pts[pts.length - 1].value)}</b>
                      <span className="st-of"> / 200</span>
                    </span>
                  </div>
                  <Spark points={pts} name={MOCK_LABEL[k]} format={(x) => `${Math.round(x)} / 200`} height={40} />
                </div>
              ))}
            </div>
          )}
          <MockTable results={list} compact />
          {list.some((m) => m.bySubject) && (
            <div className="st-mock-split">
              {list.slice(0, 3).flatMap((m) =>
                m.kind === 'science'
                  ? SCIENCE.map((s) => {
                      const b = m.bySubject?.[s];
                      return b ? (
                        <span key={m.id + s} className="st-mock-chip">
                          <SubjectDot subject={s} />
                          {shortLabel(m.date)} {SUBJECT_NAME[s]}
                          <span className="num">
                            {b.correct} / {b.total} · 约 {b.estimate} / 100
                          </span>
                        </span>
                      ) : null;
                    })
                  : [],
              )}
            </div>
          )}
        </>
      )}
    </Section>
  );
}
