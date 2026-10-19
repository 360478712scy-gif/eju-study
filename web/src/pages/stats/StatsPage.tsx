// 数据: score prediction, study time, accuracy, topic mastery, pace, mocks and vocabulary at a glance.
import { useMemo, useState } from 'react';
import type { AppState, MockKind, Subject } from '@shared/types.ts';
import type { BankIndex } from '@shared/bank.ts';
import { MOCK_LABEL, sessionLabel } from '@shared/bank.ts';
import { estimateAll, paceStats, SCALE_MAX, streak, topicStats, totalEstimate, type SubjectEstimate, type TopicStat } from '@shared/stats.ts';
import { addDays, dateRange, daysBetween, parseDate, weekdayZh } from '@shared/dates.ts';
import { budgetFor, shortTopic } from '@shared/planner.ts';
import { useReady } from '../../lib/store.ts';
import { navigate } from '../../lib/router.ts';
import { cx, fmtClock, fmtDateShort, pct, SUBJECT_NAME } from '../../lib/format.ts';
import { Badge, Button, Card, Empty, PageHeader, Ring, Segmented, SubjectDot, SubjectTag } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import { SUBJECT_ORDER, drillOrder, launch } from '../mistakes/helpers.ts';
import { BAND_TEXT, COLOR, masteryBand, targetRatio, type Band } from './model.ts';
import { MiniLine, PaceAxis, PaceDot, ScoreBar, Spark, StudyBars, fmtHM, type DayBar, type LinePoint, type TrendPoint } from './charts.tsx';
import './stats.css';

const EST_ORDER: Subject[] = ['japanese', 'math', 'physics', 'chemistry'];

function shortLabel(d: string): string {
  const dt = parseDate(d);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

export function StatsPage() {
  const { state, bank, today } = useReady();
  const { attempts, mocks, profile } = state;

  const est = useMemo(() => estimateAll(state), [attempts, mocks, profile]);
  const total = totalEstimate(est);

  // Estimate trend: the day before the sprint (baseline) through today.
  const trend = useMemo(() => {
    const from = [addDays(profile.startDate, -1), addDays(today, -20)].sort()[1];
    return dateRange(from, today).map((d, i) => {
      const e = estimateAll({ ...state, attempts: attempts.filter((a) => a.date <= d), mocks: mocks.filter((m) => m.date <= d) });
      return { date: d, label: i === 0 && d < profile.startDate ? '起点' : fmtDateShort(d), est: e };
    });
  }, [attempts, mocks, profile, today]);

  return (
    <div className="page st-page">
      <PageHeader title="数据" desc="预测来自你最近的作答和模考，每做一题都会更新。把它当趋势看，别当成绩单。" />
      <ScoreHero est={est} total={total} trend={trend} state={state} today={today} />
      <div className="grid grid-4 st-subjects">
        {EST_ORDER.map((s) => (
          <SubjectCard key={s} e={est[s]} trend={trend.map((t) => ({ label: t.label, value: t.est[s].estimate }))} />
        ))}
      </div>

      <div className="st-two">
        <StudyTime state={state} today={today} />
        <Accuracy state={state} today={today} />
      </div>

      <Mastery state={state} bank={bank} />

      <div className="st-two">
        <Pace state={state} bank={bank} />
        <Vocab state={state} bank={bank} today={today} />
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
  const left = Math.max(1, daysBetween(today, p.examDate));
  const perDay = gap > 0 ? gap / left : 0;
  const totals: TrendPoint[] = trend.map((t) => ({ label: t.label, value: totalEstimate(t.est) }));
  const samples = EST_ORDER.reduce((s, k) => s + est[k].samples, 0);

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
          {gap > 0 ? (
            <>
              离目标还差 <b>{gap}</b> 分。还有 {left} 天，平均每天涨 <b>{perDay.toFixed(1)}</b> 分就能到。
            </>
          ) : (
            <>已经够到 {target} 了。接下来稳住正确率和节奏，别在简单题上丢分。</>
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
        </div>
      </div>
    </section>
  );
}

function SubjectCard({ e, trend }: { e: SubjectEstimate; trend: TrendPoint[] }) {
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
    </section>
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
  const stats = useMemo(() => topicStats(state, bank), [state.attempts, state.profile, bank]);
  const [subject, setSubject] = useState<Subject>(() => {
    // Open on the subject furthest below target.
    let worst: Subject = 'math';
    let gap = -Infinity;
    for (const s of SUBJECT_ORDER) {
      const g = (state.profile.targets[s] - state.profile.baseline[s]) / SCALE_MAX[s];
      if (g > gap) {
        gap = g;
        worst = s;
      }
    }
    return worst;
  });
  const target = targetRatio(state, subject);
  const units = bank.bundle.taxonomy.subjects[subject].units;

  const weakest = useMemo(() => {
    const list: { id: string; subject: Subject; stat: TopicStat; gap: number; weight: number }[] = [];
    for (const [id, info] of bank.topics) {
      const st = stats.get(id);
      if (!st || st.attempts < 2 || !(bank.byTopic.get(id)?.length)) continue;
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
      actions={
        <Segmented<Subject>
          size="sm"
          value={subject}
          onChange={setSubject}
          options={SUBJECT_ORDER.map((s) => ({ value: s, label: SUBJECT_NAME[s] }))}
        />
      }
    >
      <div className="st-mastery">
        <div className="st-heat">
          {units.map((u) => (
            <div key={u.id} className="st-heat-unit">
              <div className="st-heat-unit-name">{u.name}</div>
              <div className="st-heat-tiles">
                {u.topics.map((t) => {
                  const st = stats.get(t.id);
                  const band = masteryBand(st, target);
                  const count = bank.byTopic.get(t.id)?.length ?? 0;
                  const att = st?.attempts ?? 0;
                  const alpha = att === 0 ? 0 : 0.28 + 0.72 * Math.min(1, att / 10);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={cx('st-tile', `band-${band}`)}
                      style={{ ['--a' as string]: alpha }}
                      onClick={() => navigate('/notes/' + t.id)}
                      title={`${t.name}${t.ja ? `（${t.ja}）` : ''}\n${BAND_TEXT[band]}${att ? ` · 掌握 ${pct(st?.mastery)} · 做过 ${att} 次` : ''} · 题库 ${count} 题\n点击看考点笔记`}
                    >
                      <span className="st-tile-name">{shortName(t.name)}</span>
                      <span className="st-tile-meta">
                        {att ? (
                          <>
                            <b className="num">{pct(st?.mastery)}</b>
                            <span>{att} 次</span>
                          </>
                        ) : (
                          <span>{count ? `${count} 题未练` : '暂无真题'}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="st-heat-legend">
            {(['weak', 'near', 'good', 'none'] as Band[]).map((b) => (
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
                  <Button
                    size="sm"
                    variant="soft"
                    onClick={() => launch({ kind: 'drill', title: `专项 · ${shortTopic(bank, w.id)}`, items: drillOrder(state, bank, w.id, 8) })}
                  >
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

function Pace({ state, bank }: { state: AppState; bank: BankIndex }) {
  const pace = useMemo(() => paceStats(state, bank), [state.attempts, bank]);
  return (
    <Card title="答题节奏" subtitle="首次作答用时的中位数 ÷ EJU 考场节奏" icon="zap" className="st-card">
      <div className="st-pace">
        {SUBJECT_ORDER.map((s) => {
          const p = pace[s];
          const v = paceVerdict(p.ratio);
          return (
            <div key={s} className="st-pace-row">
              <div className="st-pace-head">
                <SubjectTag subject={s} size="sm" />
                <Badge tone={v.tone}>{v.text}</Badge>
                <span className="faint text-xs st-pace-n">{p.samples} 题</span>
              </div>
              <PaceDot ratio={p.ratio} color={COLOR[s]} name={SUBJECT_NAME[s]} />
              <p className="st-pace-say">{v.say}</p>
            </div>
          );
        })}
        <PaceAxis />
        <div className="st-legend">
          <span>
            <i className="st-key-band" />
            正常区间 0.85–1.15×
          </span>
        </div>
      </div>
    </Card>
  );
}

// ───────────────────────── Vocabulary ─────────────────────────

function Vocab({ state, bank, today }: { state: AppState; bank: BankIndex; today: string }) {
  const v = useMemo(() => {
    let learned = 0;
    let seen = 0;
    let due = 0;
    for (const [id, vp] of Object.entries(state.vocab)) {
      if (!bank.vocabById.has(id)) continue;
      const skills = [vp.read, vp.meaning].filter((x) => x !== undefined);
      if (!skills.length) continue;
      seen += 1;
      if (skills.some((x) => x.box >= 2)) learned += 1;
      if (skills.some((x) => x.due <= today)) due += 1;
    }
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
          {v.due ? `复习 ${v.due} 个` : '去背词'}
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
            <Kpi label="今天到期" value={`${v.due}`} sub="读音或词义" />
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
      arr.push({ label: `${fmtDateShort(r.date)} ${sessionLabel(r.session)}`, value: r.raw * 100 });
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
        <Empty icon="target" title="还没做过整卷模考" desc="冲刺计划会在考前 11 天开始安排整卷模考。也可以现在就去做一套，看看真实节奏。" action={<Button variant="primary" onClick={() => navigate('/mock')}>去模考</Button>} />
      ) : (
        <>
          {kinds.length > 0 && (
            <div className="st-mock-trends">
              {kinds.map(([k, pts]) => (
                <div key={k} className="st-mock-trend">
                  <div className="st-mock-trend-head">
                    <span>{MOCK_LABEL[k]}</span>
                    <b className="num">{Math.round(pts[pts.length - 1].value)}%</b>
                  </div>
                  <Spark points={pts} name={MOCK_LABEL[k]} format={(x) => `${Math.round(x)}%`} height={40} />
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
                Object.entries(m.bySubject || {})
                  .filter(([s]) => m.kind === 'science' && (s === 'physics' || s === 'chemistry'))
                  .map(([s, b]) =>
                    b ? (
                      <span key={m.id + s} className="st-mock-chip">
                        <SubjectDot subject={s as Subject} />
                        {fmtDateShort(m.date)} {SUBJECT_NAME[s as Subject]} {b.correct}/{b.total} · 约 {b.estimate}/100
                      </span>
                    ) : null,
                  ),
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
