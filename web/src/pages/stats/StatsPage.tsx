// 数据: score prediction, study time, accuracy, topic mastery, pace, mocks and vocabulary at a glance.
import { useMemo, useState } from 'react';
import type { AppState, MockKind, Subject } from '@shared/types.ts';
import type { BankIndex } from '@shared/bank.ts';
import { MOCK_LABEL, sessionLabel } from '@shared/bank.ts';
import { estimateAll, paceStats, SCALE_MAX, streak, topicStats, totalEstimate, type PaceStat, type SubjectEstimate, type TopicStat } from '@shared/stats.ts';
import { addDays, dateRange, daysBetween, parseDate, weekdayZh } from '@shared/dates.ts';
import { budgetFor, shortTopic, vocabDueCount, vocabSkills } from '@shared/planner.ts';
import { useReady, useApp } from '../../lib/store.ts';
import { navigate } from '../../lib/router.ts';
import { cx, fmtClock, fmtDateShort, pct, SUBJECT_NAME } from '../../lib/format.ts';
import { Badge, Button, Card, Empty, PageHeader, Ring, Segmented, SubjectDot, SubjectTag } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import { SUBJECT_ORDER, launch } from '../mistakes/helpers.ts';
import { pickDrill, reservedMap } from '../practice/practiceData.ts';
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
  type Band,
  type Finish,
  type ScienceSubject,
} from './model.ts';
import { MiniLine, PaceAxis, PaceDot, ScoreBar, Spark, StudyBars, fmtHM, type DayBar, type LinePoint, type TrendPoint } from './charts.tsx';
import './stats.css';

const EST_ORDER: Subject[] = ['japanese', 'math', 'physics', 'chemistry'];
const SCIENCE: ScienceSubject[] = ['physics', 'chemistry'];
const BANDS: Band[] = ['weak', 'near', 'good', 'none'];

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
  const total = totalEstimate(est);

  // Estimate trend: the day before the sprint (baseline) through today.
  const trend = useMemo(() => {
    const from = [addDays(profile.startDate, -1), addDays(today, -20)].sort()[1];
    return dateRange(from, today).map((d, i) => {
      const e = estimateAll({ ...state, attempts: attempts.filter((a) => a.date <= d), mocks: mocks.filter((m) => m.date <= d) }, bank);
      return { date: d, label: i === 0 && d < profile.startDate ? '起点' : fmtDateShort(d), est: e };
    });
  }, [attempts, mocks, profile, today, bank]);

  return (
    <div className="page st-page">
      <PageHeader title="数据" desc="预测只算每题的第一次作答，以官方真题为主，理科再按你现在的速度折算。当趋势看，别当成绩单。" />
      <ScoreHero est={est} total={total} trend={trend} state={state} today={today} />
      <div className="grid grid-4 st-subjects">
        {EST_ORDER.map((s) => (
          <SubjectCard key={s} e={est[s]} pace={pace[s]} trend={trend.map((t) => ({ label: t.label, value: t.est[s].estimate }))} />
        ))}
      </div>

      <div className="st-two">
        <StudyTime state={state} today={today} />
        <Accuracy state={state} today={today} />
      </div>

      <Mastery state={state} bank={bank} />

      <div className="st-two">
        <Pace pace={pace} />
        <div className="st-stack">
          <Vocab state={state} bank={bank} today={today} />
          <ScienceFinish est={est} pace={pace} />
        </div>
      </div>

      <Mocks state={state} />
    </div>
  );
}

// ───────────────────────── Score prediction ─────────────────────────

function ScoreHero({
  est,
  total,
  trend,
  state,
  today,
}: {
  est: Record<Subject, SubjectEstimate>;
  total: number;
  trend: { label: string; est: Record<Subject, SubjectEstimate> }[];
  state: AppState;
  today: string;
}) {
  const p = state.profile;
  const baseline = EST_ORDER.reduce((s, k) => s + p.baseline[k], 0);
  const target = p.targetTotal;
  const below = Math.round(Math.sqrt(EST_ORDER.reduce((s, k) => s + (est[k].estimate - est[k].low) ** 2, 0)));
  const above = Math.round(Math.sqrt(EST_ORDER.reduce((s, k) => s + (est[k].high - est[k].estimate) ** 2, 0)));
  const gap = target - total;
  const delta = total - baseline;
  const daysLeft = daysBetween(today, p.examDate);
  const left = Math.max(1, daysLeft);
  const perDay = gap > 0 ? gap / left : 0;
  const totals: TrendPoint[] = trend.map((t) => ({ label: t.label, value: totalEstimate(t.est) }));
  const samples = EST_ORDER.reduce((s, k) => s + est[k].samples, 0);
  const sci = scienceFinish(est).all;

  return (
    <section className="st-hero">
      <div className="st-hero-left">
        <div className="st-eyebrow">
          <Icon name="target" size={14} />
          预测总分
        </div>
        <div className="st-hero-num">
          <span className="st-big">{total}</span>
          <span className="st-hero-of">/ {target}</span>
        </div>
        <div className="st-hero-chips">
          <span className={cx('st-delta', delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : '')}>
            <Icon name={delta >= 0 ? 'trending' : 'down'} size={14} />
            比起点 {delta >= 0 ? '+' : ''}
            {delta}
          </span>
          <span className="faint">
            大约 {total - below}–{total + above}
          </span>
        </div>
        <p className="st-hero-say">
          {daysLeft < 0 ? (
            <>
              考试已经结束。冲刺期间预测从 {baseline} 到了 <b>{total}</b>
              {delta !== 0 && <>（{delta > 0 ? '+' : ''}{delta}）</>}，一共做了 <b>{firstTries(state)}</b> 道题。辛苦了，等成绩出来再对照看看。
            </>
          ) : daysLeft === 0 ? (
            <>今天考试。预测 {total} 分只是练习时的参考，进考场照平时的节奏做，先把会做的题做对。</>
          ) : daysLeft === 1 ? (
            <>
              {gap > 0 ? <>离 {target} 还差 {gap} 分。</> : <>已经够到 {target} 了。</>}明天就考了，今天只做轻量复习、早点睡，把会做的题做对就是在涨分。
            </>
          ) : gap > 0 ? (
            <>
              离 {target} 还差 <b>{gap}</b> 分。还有 {left} 天，平均每天涨 <b>{perDay.toFixed(1)}</b> 分就够。
            </>
          ) : (
            <>已经够到 {target} 了。接下来稳住正确率和节奏，别在简单题上丢分。</>
          )}
          {daysLeft > 1 && sci && sci.done < sci.total && (
            <>
              理科按现在的速度，80 分钟约能做完 <b>{sci.done}</b>/{sci.total} 题，先把速度提上来。
            </>
          )}
        </p>
      </div>
      <div className="st-hero-right">
        <ScoreBar size="lg" name="总分" estimate={total} low={total - below} high={total + above} baseline={baseline} target={target} max={800} />
        <div className="st-hero-trend">
          <div className="st-hero-trend-head">
            <span>每天的预测</span>
            <span className="faint">{samples} 题样本</span>
          </div>
          <Spark points={totals} name="预测总分" height={44} reference={baseline} />
          {totals.length > 1 && (
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
    </section>
  );
}

/** Questions answered for the first time (what the estimates are built on). */
function firstTries(state: AppState): number {
  return state.attempts.filter((a) => a.firstTry).length;
}

function SubjectCard({ e, pace, trend }: { e: SubjectEstimate; pace: PaceStat; trend: TrendPoint[] }) {
  const max = SCALE_MAX[e.subject];
  const reached = e.estimate >= e.target;
  return (
    <section className={cx('st-subj card', `tone-${e.subject}`)}>
      <header className="st-subj-head">
        <SubjectTag subject={e.subject} size="sm" />
        <span className="faint text-xs">{e.samples ? `近 ${e.samples} 题` : '暂无作答'}</span>
      </header>
      <div className="st-subj-mid">
        <div className="st-subj-num">
          <span className="st-num-lg">{e.estimate}</span>
          <span className="faint text-sm">/{max}</span>
        </div>
        <div className="st-subj-spark">
          <Spark points={trend} name={`${SUBJECT_NAME[e.subject]}预测`} color={COLOR[e.subject]} height={34} reference={e.baseline} />
        </div>
      </div>
      <ScoreBar name={SUBJECT_NAME[e.subject]} estimate={e.estimate} low={e.low} high={e.high} baseline={e.baseline} target={e.target} max={max} color={COLOR[e.subject]} />
      <footer className="st-subj-foot">
        <span className="faint">
          区间 {e.low}–{e.high}
        </span>
        {reached ? (
          <span className="st-ok">
            <Icon name="check" size={13} />
            已达标
          </span>
        ) : (
          <span className="muted">
            还差 <b className="num">{e.target - e.estimate}</b>
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
              <span>
                <b className="num">{parts[k]}</b>
                <span className="faint">/200</span>
              </span>
            </div>
            <Meter value={parts[k] / 200} mark={half / 200} label={`${label}预测 ${parts[k]}/200，目标约 ${Math.round(half)}`} />
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
          {e.accuracy !== null ? <b className="num">{pct(e.accuracy)}</b> : <span className="faint">还没有</span>}
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
          <span>考场上能做完多少</span>
          <span className="faint">再做 {Math.max(1, PACE_MIN_SAMPLES - pace.samples)} 题</span>
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
          按现在速度约做完 <b className="num">{f.done}</b>/{f.total} 题
        </span>
        <span className={cx('st-verdict', `is-${v.tone}`)}>{v.text}</span>
      </div>
      <Meter value={f.done / f.total} label={`80 分钟约做完 ${f.done}/${f.total} 题`} />
    </div>
  );
}

function Meter({ value, mark, label }: { value: number; mark?: number; label: string }) {
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  return (
    <span className="st-meter" role="img" aria-label={label} title={label}>
      {value > 0 && <i style={{ width: `${clamp(value) * 100}%` }} />}
      {mark !== undefined && <em style={{ left: `${clamp(mark) * 100}%` }} />}
    </span>
  );
}

// ───────────────────────── Study time ─────────────────────────

function StudyTime({ state, today }: { state: AppState; today: string }) {
  const start = state.profile.startDate;
  const bars = useMemo<DayBar[]>(
    () =>
      dateRange(addDays(today, -13), today).map((d, i) => {
        const log = state.days[d];
        return {
          date: d,
          label: d === today ? '今天' : i === 0 || d.endsWith('-01') ? shortLabel(d) : String(parseDate(d).getDate()),
          minutes: (log?.seconds ?? 0) / 60,
          budget: d < start ? null : (state.plans[d]?.budgetMinutes ?? budgetFor(state, d)),
          answered: log?.answered ?? 0,
          correct: log?.correct ?? 0,
          isToday: d === today,
          title: `${fmtDateShort(d)} ${weekdayZh(d)}`,
        };
      }),
    [state, today, start],
  );
  const sum = (from: string) => Object.entries(state.days).reduce((s, [d, l]) => (d >= from && d <= today ? s + l.seconds : s), 0) / 60;
  const dow = parseDate(today).getDay();
  const weekFrom = addDays(today, -((dow + 6) % 7));
  const week = sum(weekFrom);
  const all = sum(start);
  const sinceDays = Math.max(1, daysBetween(start, today) + 1);
  const todayMin = (state.days[today]?.seconds ?? 0) / 60;
  const todayBudget = state.plans[today]?.budgetMinutes ?? budgetFor(state, today);
  const st = streak(state, today);

  return (
    <Card title="学习时长" subtitle="最近 14 天 · 横线是当天计划" icon="clock" className="st-card">
      <div className="st-kpis">
        <Kpi label="今天" value={fmtHM(todayMin)} sub={todayBudget ? `计划 ${fmtHM(todayBudget)}` : '休息日'} />
        <Kpi label="本周" value={fmtHM(week)} sub="周一起算" />
        <Kpi label="开始以来" value={fmtHM(all)} sub={`日均 ${fmtHM(all / sinceDays)}`} />
        <Kpi label="连续学习" value={`${st} 天`} sub="每天 ≥30 分钟" />
      </div>
      <StudyBars days={bars} />
      <div className="st-legend">
        <span>
          <i className="st-key-bar" />
          实际学习
        </span>
        <span>
          <i className="st-key-line" />
          当天计划
        </span>
      </div>
    </Card>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="st-kpi">
      <div className="st-kpi-label">{label}</div>
      <div className="st-kpi-value">{value}</div>
      {sub && <div className="st-kpi-sub">{sub}</div>}
    </div>
  );
}

// ───────────────────────── Accuracy ─────────────────────────

function Accuracy({ state, today }: { state: AppState; today: string }) {
  const from = [state.profile.startDate, addDays(today, -13)].sort()[1];
  const series = useMemo(() => {
    const dates = dateRange(from, today);
    const agg = new Map<string, { n: number; s: number }>();
    for (const a of state.attempts) {
      if (a.date < from) continue;
      const k = `${a.subject}|${a.date}`;
      const v = agg.get(k) || { n: 0, s: 0 };
      v.n += 1;
      v.s += a.score;
      agg.set(k, v);
    }
    return SUBJECT_ORDER.map((s) => {
      const points: LinePoint[] = dates.map((d) => {
        const v = agg.get(`${s}|${d}`);
        return { date: d, label: fmtDateShort(d), value: v ? v.s / v.n : null, n: v?.n ?? 0 };
      });
      const n = points.reduce((x, p) => x + p.n, 0);
      const score = points.reduce((x, p) => x + (p.value ?? 0) * p.n, 0);
      return { subject: s, points, n, overall: n ? score / n : null };
    });
  }, [state.attempts, from, today]);

  return (
    <Card title="正确率" subtitle="按天统计 · 虚线是你目标分对应的正确率" icon="trending" className="st-card">
      <div className="st-multi">
        {series.map((x) => (
          <div key={x.subject} className="st-multi-cell">
            <div className="st-multi-head">
              <span className="st-multi-name">
                <SubjectDot subject={x.subject} />
                {SUBJECT_NAME[x.subject]}
              </span>
              <span className="st-multi-val">
                {x.overall !== null ? <b className="num">{pct(x.overall)}</b> : <span className="faint">—</span>}
                <span className="faint text-xs"> · {x.n} 题</span>
              </span>
            </div>
            <MiniLine points={x.points} target={targetRatio(state, x.subject)} color={COLOR[x.subject]} name={SUBJECT_NAME[x.subject]} />
          </div>
        ))}
      </div>
    </Card>
  );
}

// ───────────────────────── Topic mastery ─────────────────────────

function Mastery({ state, bank }: { state: AppState; bank: BankIndex }) {
  const today = useApp((s) => s.today);
  const stats = useMemo(() => topicStats(state, bank), [state.attempts, state.profile, bank]);
  const [subject, setSubject] = useState<Subject>(() => {
    // Open on the measured subject furthest below its target (fall back to the prior gap).
    const est = estimateAll(state, bank);
    const gap = (s: Subject) => (est[s].target - est[s].estimate) / SCALE_MAX[s] + (est[s].samples > 0 ? 1 : 0);
    return [...SUBJECT_ORDER].sort((a, b) => gap(b) - gap(a))[0];
  });
  const target = targetRatio(state, subject);
  const units = bank.bundle.taxonomy.subjects[subject].units;

  const weakest = useMemo(() => {
    const list: { id: string; subject: Subject; stat: TopicStat; gap: number; weight: number }[] = [];
    for (const [id, info] of bank.topics) {
      const st = stats.get(id);
      if (!st || st.attempts < 2 || !bank.byTopic.get(id)?.length) continue;
      const gap = st.mastery - targetRatio(state, info.subject);
      if (gap < 0) list.push({ id, subject: info.subject, stat: st, gap, weight: info.weight });
    }
    return list.sort((a, b) => a.gap * (1 + a.weight / 5) - b.gap * (1 + b.weight / 5)).slice(0, 6);
  }, [stats, bank, state]);

  return (
    <Card
      title="考点掌握度"
      subtitle="颜色看掌握，深浅看做题量。点一个考点看笔记和真题。"
      icon="grid"
      className="st-card st-mastery-card"
      actions={<Segmented<Subject> size="sm" value={subject} onChange={setSubject} options={SUBJECT_ORDER.map((s) => ({ value: s, label: SUBJECT_NAME[s] }))} />}
    >
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
                  const alpha = att === 0 ? 0 : 0.3 + 0.7 * Math.min(1, att / 10);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={cx('st-tile', `band-${band}`, count === 0 && 'is-empty')}
                      style={{ ['--a' as string]: alpha }}
                      onClick={() => navigate('/notes/' + t.id)}
                      title={`${t.name}${t.ja ? `（${t.ja}）` : ''}\n${BAND_TEXT[band]}${att ? ` · 掌握 ${pct(st?.mastery)} · 做过 ${att} 次` : ''} · 题库 ${count} 题\n点击看考点笔记`}
                    >
                      <span className="st-tile-name">{shortName(t.name)}</span>
                      <span className="st-tile-meta">
                        {att ? (
                          <>
                            <b className="num">{pct(st?.mastery)}</b>
                            <span className="num">{att}次</span>
                          </>
                        ) : (
                          <span>{count ? `${count} 题` : '—'}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="st-heat-legend">
            {BANDS.map((b) => (
              <span key={b}>
                <i className={`st-key band-${b}`} />
                {BAND_TEXT[b]}
              </span>
            ))}
            <span className="faint">目标正确率 {pct(target)} · 越深做得越多</span>
          </div>
        </div>
        <aside className="st-weak">
          <div className="st-weak-title">
            <Icon name="flame" size={15} />
            最该补的考点
          </div>
          {weakest.length === 0 ? (
            <p className="faint text-sm">还没有明显的薄弱考点。多做几组专项，这里会列出离目标最远的考点。</p>
          ) : (
            <ul className="st-weak-list">
              {weakest.map((w) => (
                <li key={w.id}>
                  <button type="button" className="st-weak-name" onClick={() => navigate('/notes/' + w.id)}>
                    <SubjectDot subject={w.subject} />
                    <span>{shortTopic(bank, w.id)}</span>
                  </button>
                  <span className="st-weak-meta num">
                    {pct(w.stat.mastery)} · {w.stat.attempts} 次
                  </span>
                  <Button size="sm" variant="soft" onClick={() => {
                      // Same picking rule as 题库练习: never-seen first, avoiding papers held for upcoming mocks.
                      const pick = pickDrill(state, bank.byTopic.get(w.id) ?? [], 8, reservedMap(state, bank), today + w.id);
                      launch({ kind: 'drill', title: `专项 · ${shortTopic(bank, w.id)}`, items: pick.ids.map((id) => bank.byId.get(id)!).filter(Boolean) });
                    }}>
                    练
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </Card>
  );
}

function shortName(name: string): string {
  return name.replace(/（[^）]*）/g, '');
}

// ───────────────────────── Pace ─────────────────────────

function paceVerdict(r: number | null): { text: string; tone: 'warning' | 'success' | 'primary' | 'neutral'; say: string } {
  if (r === null) return { text: '数据不足', tone: 'neutral', say: '首次作答的题还不够，做几组就有数了。' };
  if (r > 1.6) return { text: '明显偏慢', tone: 'warning', say: `每题用时是考场节奏的 ${r.toFixed(1)} 倍，考试会做不完。练习时开计时，卡住先跳。` };
  if (r > 1.15) return { text: '偏慢', tone: 'warning', say: `比考场节奏慢 ${Math.round((r - 1) * 100)}%。熟悉题型后先追速度，再追正确率。` };
  if (r < 0.7) return { text: '偏快', tone: 'primary', say: '比考场节奏快不少，时间有富余，留一点给检查和难题。' };
  return { text: '正常', tone: 'success', say: '和考场节奏差不多，保持住。' };
}

function Pace({ pace }: { pace: Record<Subject, PaceStat> }) {
  return (
    <Card title="答题节奏" subtitle="首次作答用时的中位数 ÷ EJU 考场节奏" icon="zap" className="st-card">
      {SUBJECT_ORDER.every((s) => pace[s].ratio === null) ? (
        <Empty icon="clock" title="还没有用时数据" desc="每道题第一次作答的用时都会记下来。做几组题后，这里会告诉你每科比考场节奏快还是慢。" />
      ) : (
        <div className="st-pace">
          {SUBJECT_ORDER.map((s) => {
            const p = pace[s];
            const v = paceVerdict(p.ratio);
            return (
              <div key={s} className="st-pace-row">
                <div className="st-pace-head">
                  <SubjectTag subject={s} size="sm" />
                  <Badge tone={v.tone}>{v.text}</Badge>
                </div>
                <PaceDot ratio={p.ratio} color={COLOR[s]} name={SUBJECT_NAME[s]} />
                <p className="st-pace-say">
                  {v.say}
                  <span className="faint"> · {p.samples} 题</span>
                </p>
              </div>
            );
          })}
          <div className="st-pace-axis">
            <span />
            <PaceAxis />
          </div>
          <div className="st-legend">
            <span>
              <i className="st-key-band" />
              正常区间 0.85–1.15×
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

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
    <Card title="理科整卷做得完吗" subtitle={`物理 ${SCIENCE_ITEMS.physics} 题 + 化学 ${SCIENCE_ITEMS.chemistry} 题，共 80 分钟`} icon="clock" className="st-card">
      {!known.length ? (
        <p className="st-finish-say">
          物理、化学各做满 {PACE_MIN_SAMPLES} 道新题，就能按你的速度算出 80 分钟约能做完多少题。现在还差：
          {rows.map((r) => `${SUBJECT_NAME[r.s]} ${r.need} 题`).join('，')}。
        </p>
      ) : (
        <div className="st-finish">
          <div className="st-finish-top">
            <span className="st-finish-num">
              {whole ? '80 分钟' : `${SUBJECT_NAME[known[0].s]}部分`}约能做完 <b className="num">{done}</b>
              <span className="st-finish-of"> / {total} 题</span>
            </span>
            <Badge tone={v.tone}>{v.text}</Badge>
          </div>
          <div className="st-finish-cells" role="img" aria-label={rows.map((r) => `${SUBJECT_NAME[r.s]} ${r.f ? `${r.f.done}/${r.f.total}` : '未知'}`).join('，')}>
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
                  <span>
                    <b className="num">{f.done}</b>/{f.total}
                  </span>
                ) : (
                  <span className="faint">再做 {need} 道新题才有数</span>
                )}
              </span>
            ))}
          </div>
          <p className="st-finish-say">
            {left === 0
              ? '按现在的速度能做完，还能留几分钟检查。'
              : `按现在的速度，最后约 ${left} 题来不及做、只能蒙。练习时开计时，卡住先跳，回头再做。`}
          </p>
        </div>
      )}
    </Card>
  );
}

// ───────────────────────── Vocabulary ─────────────────────────

function Vocab({ state, bank, today }: { state: AppState; bank: BankIndex; today: string }) {
  const v = useMemo(() => {
    let learned = 0;
    let seen = 0;
    // Only the skills each word trains (as on the vocab page), so 学过 matches its 已学.
    for (const w of bank.bundle.vocab) {
      const vp = state.vocab[w.id];
      if (!vp) continue;
      const skills = vocabSkills(w)
        .map((k) => vp[k])
        .filter((x) => x !== undefined);
      if (!skills.length) continue;
      seen += 1;
      if (skills.some((x) => x.box >= 2)) learned += 1;
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
    return { learned, seen, due, acc, week, total: bank.bundle.vocab.length };
  }, [state.vocab, state.vocabAttempts, bank, today]);

  return (
    <Card
      title="词汇"
      subtitle={`题库 ${v.total} 个 EJU 高频词`}
      icon="languages"
      className="st-card"
      actions={
        <Button size="sm" variant="soft" iconRight="arrowRight" onClick={() => navigate('/vocab')}>
          {v.due ? `复习 ${v.due} 张卡` : '去背词'}
        </Button>
      }
    >
      <div className="st-vocab">
        <Ring value={v.total ? v.learned / v.total : 0} size={116} stroke={10} tone="japanese">
          <span className="st-ring-num">{v.learned}</span>
          <span className="st-ring-sub">已记住</span>
        </Ring>
        <div className="st-vocab-side">
          <div className="st-vocab-kpis">
            <Kpi label="学过" value={`${v.seen}`} sub={`共 ${v.total}`} />
            <Kpi label="待复习" value={`${v.due}`} sub="张卡" />
            <Kpi label="近 7 天" value={`${v.week}`} sub="次作答" />
          </div>
          {(['read', 'meaning'] as const).map((k) => {
            const a = v.acc[k];
            const r = a.n ? a.c / a.n : 0;
            return (
              <div key={k} className="st-vbar">
                <div className="st-vbar-head">
                  <span>{k === 'read' ? '读音（看汉字写假名）' : '词义（看词选意思）'}</span>
                  <span>
                    <b className="num">{a.n ? pct(r) : '—'}</b>
                    <span className="faint text-xs"> · {a.n} 次</span>
                  </span>
                </div>
                <svg className="st-vbar-svg" width="100%" height="8" role="img" aria-label={`${k === 'read' ? '读音' : '词义'}正确率 ${pct(r)}`}>
                  <rect x="0" y="0" width="100%" height="8" rx="4" className="st-track" />
                  {a.n > 0 && <rect x="0" y="0" width={`${Math.max(2, r * 100)}%`} height="8" rx="4" className={k === 'read' ? 'st-vfill-read' : 'st-vfill-meaning'} />}
                </svg>
              </div>
            );
          })}
          <p className="faint text-xs">任一项连续答对、升到第 2 级以上算「已记住」。</p>
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
    <Card
      title="模考记录"
      subtitle="整卷限时模考的得分率和换算分（满分 200）"
      icon="award"
      className="st-card st-mocks-card"
      actions={
        <Button size="sm" variant="ghost" iconRight="arrowRight" onClick={() => navigate('/mock')}>
          模考中心
        </Button>
      }
    >
      {list.length === 0 ? (
        <Empty
          icon="target"
          title="还没做过整卷模考"
          desc="冲刺计划会在考前 11 天开始安排整卷模考。也可以现在就去做一套，看看真实节奏。"
          action={
            <Button variant="primary" onClick={() => navigate('/mock')}>
              去模考
            </Button>
          }
        />
      ) : (
        <>
          {kinds.length > 0 && (
            <div className="st-mock-trends">
              {kinds.map(([k, pts]) => (
                <div key={k} className="st-mock-trend">
                  <div className="st-mock-trend-head">
                    <span>{MOCK_LABEL[k]}</span>
                    <b className="num">
                      {Math.round(pts[pts.length - 1].value)}
                      <span className="faint">/200</span>
                    </b>
                  </div>
                  <Spark points={pts} name={MOCK_LABEL[k]} format={(x) => `${Math.round(x)}/200`} height={40} />
                </div>
              ))}
            </div>
          )}
          <div className="st-mock-table" role="table">
            <div className="st-mock-row is-head" role="row">
              <span>日期</span>
              <span>科目</span>
              <span>正确</span>
              <span>得分率</span>
              <span>换算</span>
              <span>用时</span>
              <span />
            </div>
            {list.map((m) => (
              <button key={m.id} type="button" className="st-mock-row" role="row" onClick={() => navigate('/mock/' + m.id)}>
                <span className="num">{fmtDateShort(m.date)}</span>
                <span className="st-mock-name">
                  <b>{MOCK_LABEL[m.kind]}</b>
                  <span className="faint">{sessionLabel(m.session)}</span>
                </span>
                <span className="num">
                  {m.correct}/{m.total}
                </span>
                <span className="st-mock-raw">
                  <span className="st-mock-meter">
                    <i style={{ width: `${Math.round(m.raw * 100)}%` }} />
                  </span>
                  <span className="num">{pct(m.raw)}</span>
                </span>
                <span className="num">
                  <b>{m.estimate}</b>
                  <span className="faint">/200</span>
                </span>
                <span className="num faint">{fmtClock(m.seconds)}</span>
                <Icon name="right" size={16} className="st-mock-go" />
              </button>
            ))}
          </div>
          {list.some((m) => m.bySubject) && (
            <div className="st-mock-split">
              {list.slice(0, 3).flatMap((m) =>
                m.kind === 'science'
                  ? SCIENCE.map((s) => {
                      const b = m.bySubject?.[s];
                      return b ? (
                        <span key={m.id + s} className="st-mock-chip">
                          <SubjectDot subject={s} />
                          {fmtDateShort(m.date)} {SUBJECT_NAME[s]} {b.correct}/{b.total} · 约 {b.estimate}/100
                        </span>
                      ) : null;
                    })
                  : [],
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
