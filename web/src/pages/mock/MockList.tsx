// #/mock — next scheduled mock, results history with trends, and every paper that can be mocked.
import { useMemo, useState, type ReactNode } from 'react';
import type { MockKind, MockResult, PracticeSession } from '@shared/types.ts';
import { MOCK_LABEL, sessionLabel } from '@shared/bank.ts';
import { mockSchedule, PHASE_INFO, type ScheduledMock } from '@shared/planner.ts';
import { startBlock, startSession } from '@shared/actions.ts';
import { daysBetween, weekdayZh } from '@shared/dates.ts';
import { useReady, update } from '../../lib/store.ts';
import { navigate } from '../../lib/router.ts';
import { cx, fmtClock, fmtDateShort, pct } from '../../lib/format.ts';
import { Badge, Button, Card, Chip, Dot, Empty, IconTile, List, ListRow, Meta, PageHeader, Section, useConfirm } from '../../components/ui.tsx';
import { Icon, type IconName } from '../../components/Icon.tsx';
import { KIND_INFO, KIND_ORDER, kindTarget, MOCK_MAX, mockTitle, openMocks, paperFacts, paperMeta, paperMinutes } from './mockData.ts';
import { ScoreBar, TrendChart } from './charts.tsx';

/** Exam day itself, or after it: no more "do it soon" nudges. */
type ExamPhase = 'before' | 'day' | 'over';

function whenLabel(date: string, today: string): string {
  const d = daysBetween(today, date);
  if (d === 0) return '就是今天';
  if (d === 1) return '明天';
  if (d > 1) return `还有 ${d} 天`;
  return `已过 ${-d} 天，尽快补上`;
}

/** "还差 17" (neutral) or "达标 +3" (success): a gap is never red. */
export function TargetGap({ value, target }: { value: number; target: number }) {
  const gap = value - target;
  return gap >= 0 ? (
    <Badge tone="success" className="num">
      达标 +{gap}
    </Badge>
  ) : (
    <Chip className="num">还差 {-gap}</Chip>
  );
}

export function MockList() {
  const { state, bank, today } = useReady();
  const confirm = useConfirm();
  const schedule = useMemo(() => mockSchedule(state, bank), [state, bank]);
  const toExam = daysBetween(today, state.profile.examDate);
  const phase: ExamPhase = toExam > 0 ? 'before' : toExam === 0 ? 'day' : 'over';
  const next = phase === 'before' ? schedule.find((m) => m.parts.some((p) => !p.done)) : undefined;
  /** Unfinished attempts by `${kind}:${session}`: a paper with one offers 继续作答, never a second start. */
  const openByPaper = useMemo(() => openMocks(state), [state]);

  /** `${kind}:${session}` → scheduled slot (first one that uses the paper). */
  const slotOf = useMemo(() => {
    const m = new Map<string, ScheduledMock>();
    for (const s of schedule) for (const p of s.parts) if (!m.has(`${p.kind}:${p.session}`)) m.set(`${p.kind}:${p.session}`, s);
    return m;
  }, [schedule]);

  const unfinished = useMemo(() => {
    const open = Object.values(state.sessions).filter((s) => s.kind === 'mock' && !s.finishedAt);
    return open.find((s) => s.id === state.activeSessionId) ?? open.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  }, [state.sessions, state.activeSessionId]);

  const results = useMemo(() => [...state.mocks].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)), [state.mocks]);
  /** Paper libraries the learner unfolded ("其余 N 套"). */
  const [more, setMore] = useState<Set<MockKind>>(() => new Set());
  const toggleMore = (kind: MockKind) =>
    setMore((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  const latest = (kind: MockKind, session: string) => results.find((r) => r.kind === kind && r.session === session);

  const start = async (kind: MockKind, session: string) => {
    const open = openByPaper.get(`${kind}:${session}`);
    if (open) {
      navigate('/session/' + open.id);
      return;
    }
    const facts = paperFacts(state, bank, kind, session);
    const { items } = facts;
    if (!items.length) return;
    const limit = facts.limitSec;
    const seen = items.filter((it) => (state.progress[it.id]?.attempts ?? 0) > 0).length;
    const slot = slotOf.get(`${kind}:${session}`);
    const early = slot && slot.date > today;
    const ok = await confirm.ask(`开始模考 · ${sessionLabel(session)} ${KIND_INFO[kind].short}`, {
      body: (
        <ul className="mk-confirm">
          <li>
            <Icon name="clock" size={14} />
            <span>
              {items.length} 题，限时 <b className="num">{fmtClock(limit)}</b>，到时自动交卷
            </span>
          </li>
          {(facts.original > 0 || facts.short) && (
            <li className={cx(facts.short && 'is-warn')}>
              <Icon name="info" size={14} />
              <span>
                {facts.short
                  ? `原卷公开 ${facts.official} 题，加 ${facts.original} 道没做过的原创题也不足整卷 ${facts.full} 题，估分仅供参考`
                  : `原卷公开 ${facts.official} 题，补 ${facts.original} 道没做过的原创题凑足整卷`}
              </span>
            </li>
          )}
          <li>
            <Icon name="eyeOff" size={14} />
            <span>中途不显示对错和解析，交卷后统一批改、估分</span>
          </li>
          {early && (
            <li>
              <Icon name="calendar" size={14} />
              <span>
                原本安排在 {fmtDateShort(slot.date)}「{mockTitle(slot.title)}」，提前做也算完成
              </span>
            </li>
          )}
          {seen > 0 && (
            <li className="is-warn">
              <Icon name="alert" size={14} />
              <span>其中 {seen} 题你练过，估分会偏高</span>
            </li>
          )}
          {unfinished && (
            <li className="is-warn">
              <Icon name="alert" size={14} />
              <span>「{unfinished.title}」还没交卷，会先搁置</span>
            </li>
          )}
        </ul>
      ),
      ok: '开始计时',
    });
    if (!ok) return;
    const block = state.plans[today]?.blocks.find((b) => b.kind === 'mock' && b.status === 'todo' && b.mock?.kind === kind && b.mock.session === session);
    const s = update((d, bk) => {
      const b = block && d.plans[today]?.blocks.find((x) => x.id === block.id);
      const fromPlan = b ? startBlock(d, bk, b) : null;
      return (
        fromPlan ??
        startSession(d, {
          kind: 'mock',
          exam: true,
          mock: { kind, session },
          itemIds: items.map((it) => it.id),
          timeLimitSec: limit,
          title: `${sessionLabel(session)} ${MOCK_LABEL[kind]}`,
          subject: KIND_INFO[kind].subject,
        })
      );
    });
    navigate('/session/' + s.id);
  };

  return (
    <div className="page mk-page">
      <PageHeader
        title="模考"
        desc="按 EJU 真实时长整卷限时做，交卷后估分、逐题复盘。"
        info="和考场一样：按考试时长倒计时，到点自动交卷；中途不显示对错和解析；交卷后估分，看逐题对错、考点和用时。"
      />

      {unfinished && (
        <Card className="mk-resume">
          <IconTile icon="clock" tone="warning" size="md" />
          <div className="mk-resume-text">
            <b>有一场模考还没交卷</b>
            <span className="num">
              {unfinished.title} · 已用 {fmtClock(unfinished.elapsedSec)}
              {unfinished.timeLimitSec ? ` / ${fmtClock(unfinished.timeLimitSec)}` : ''}
            </span>
          </div>
          <Button variant="primary" iconRight="arrowRight" onClick={() => navigate('/session/' + unfinished.id)}>
            继续作答
          </Button>
        </Card>
      )}

      <NextMock next={next} schedule={schedule} today={today} phase={phase} openByPaper={openByPaper} quiet={!!unfinished} onStart={(k, s) => void start(k, s)} />

      <Section title="模考记录" desc="估分按得分率折算到 200 分制，看趋势比看单次更有意义。">
        {results.length ? (
          <History results={results} schedule={schedule} phase={phase} today={today} />
        ) : (
          <Card>
            <Empty
              icon="target"
              size="sm"
              title="还没有模考记录"
              desc={
                phase !== 'before'
                  ? '这次冲刺没有留下模考记录。'
                  : next
                    ? (
                        <>
                          第一场安排在 {fmtDateShort(next.date)}。
                          <br />
                          想先熟悉节奏，可以在下面展开「其余」，挑一套没排进计划的卷子。
                        </>
                      )
                    : '从下面挑一套卷子开始第一场模考。'
              }
            />
          </Card>
        )}
      </Section>

      <Section
        title="全部真题卷"
        desc={
          phase === 'day'
            ? '今天专心考试，这些卷子考完再看。'
            : phase === 'over'
              ? '考完想复盘或保持手感，可以挑一套整卷限时做。'
              : '带「计划」的卷子已排进冲刺日程，建议按日期做；其余可以随时加练。'
        }
      >
        <div className="mk-kinds">
          {KIND_ORDER.map((kind) => {
            const papers = bank.bundle.papers.filter((p) => p.mocks.includes(kind));
            if (!papers.length) return null;
            const info = KIND_INFO[kind];
            // In view: an open attempt or a paper on the schedule; the rest fold into one "其余 N 套" row.
            const keep = (session: string) => openByPaper.has(`${kind}:${session}`) || (phase === 'before' && slotOf.has(`${kind}:${session}`));
            let lead = papers.filter((p) => keep(p.session));
            if (!lead.length) lead = papers.slice(0, 3);
            const rest = papers.filter((p) => !lead.includes(p));
            const expanded = more.has(kind);
            const row = (p: (typeof papers)[number]) => {
              const done = latest(kind, p.session);
              const open = openByPaper.get(`${kind}:${p.session}`);
              const facts = paperFacts(state, bank, kind, p.session, { open, result: done });
              const slot = phase === 'before' ? slotOf.get(`${kind}:${p.session}`) : undefined;
              const seen = facts.items.filter((it) => (state.progress[it.id]?.attempts ?? 0) > 0).length;
              const go = open ? () => navigate('/session/' + open.id) : done ? () => navigate('/mock/' + done.id) : () => void start(kind, p.session);
              return (
                <ListRow
                  key={p.session}
                  className="mk-paper"
                  onClick={go}
                  current={!!open}
                  title={
                    <span className="mk-paper-title">
                      {p.label}
                      {done ? (
                        <Badge tone="success" icon="check" className="num">
                          已完成 · {done.estimate}
                        </Badge>
                      ) : open ? (
                        <Badge tone="warning" icon="clock">
                          未交卷
                        </Badge>
                      ) : slot ? (
                        <Chip icon="calendar">计划 {fmtDateShort(slot.date)}</Chip>
                      ) : null}
                    </span>
                  }
                  meta={
                    <span className="num">
                      {paperMeta(facts)}
                      {open ? (
                        <span> · 已用 {fmtClock(open.elapsedSec)}</span>
                      ) : (
                        !done && seen > 0 && <span> · 已练过 {seen} 题</span>
                      )}
                    </span>
                  }
                  trail={
                    open ? (
                      <Button variant="secondary" size="sm" iconRight="arrowRight" onClick={go}>
                        继续作答
                      </Button>
                    ) : undefined
                  }
                  hoverAction={
                    open ? undefined : (
                      <Button variant="ghost" size="sm" iconRight={done ? 'right' : 'arrowRight'} onClick={go} tabIndex={-1}>
                        {done ? '复盘' : '开始'}
                      </Button>
                    )
                  }
                />
              );
            };
            return (
              <Card key={kind} className="mk-kind" padding={false}>
                <header className="mk-kind-head">
                  <IconTile icon={info.icon} tone={info.tone} size="md" />
                  <div>
                    <h3 className="card-title">{info.name}</h3>
                    <p className="card-sub">{kind === 'math' || kind === 'science' ? '80 分钟 · 满分 200' : kind === 'ja-reading' ? '按题量折算时间 · 满分 200' : '每题只听一遍 · 满分 200'}</p>
                  </div>
                </header>
                <List className="mk-papers">
                  {lead.map(row)}
                  {expanded && rest.map(row)}
                </List>
                {rest.length > 0 && (
                  <button type="button" className="mk-more" aria-expanded={expanded} onClick={() => toggleMore(kind)}>
                    {expanded ? '收起' : `其余 ${rest.length} 套`}
                    <Icon name={expanded ? 'up' : 'down'} size={14} />
                  </button>
                )}
              </Card>
            );
          })}
        </div>
      </Section>
      {confirm.node}
    </div>
  );
}

function NextMock({
  next,
  schedule,
  today,
  phase,
  openByPaper,
  quiet,
  onStart,
}: {
  next?: ScheduledMock;
  schedule: ScheduledMock[];
  today: string;
  phase: ExamPhase;
  openByPaper: Map<string, PracticeSession>;
  /** Another card on the page already carries the filled primary (the resume banner). */
  quiet: boolean;
  onStart: (kind: MockKind, session: string) => void;
}) {
  const { state, bank } = useReady();
  const isToday = !!next && next.date <= today;
  const examDate = state.profile.examDate;
  // "日语 9:30–12:00 · 理科 13:30–15:00 · 数学 15:40–17:10。带好…" → timetable rows + what to bring.
  const [times = '', ...bring] = PHASE_INFO.exam.desc.split('。').filter(Boolean);
  // One filled button: the first part still to do today (or the open attempt to continue).
  const lead = next?.parts.find((p) => !p.done);
  return (
    <Card variant="hero" className="mk-hero">
      <div className={cx('mk-hero-top', phase !== 'day' && 'is-single')}>
        <div className="mk-hero-main">
          {phase === 'day' ? (
            <>
              <div className="mk-eyebrow">
                <Icon name="flag" size={14} />
                考试日 · {fmtDateShort(examDate)} {weekdayZh(examDate)}
              </div>
              <h2 className="mk-hero-title">今天就是 EJU</h2>
              <p className="mk-calm">不用再做模考了。按平时模考的节奏来：先易后难，每题都要填。</p>
              {bring.length > 0 && (
                <p className="mk-calm-sub">
                  <Icon name="checkCircle" size={14} />
                  {bring.join('。')}
                </p>
              )}
            </>
          ) : phase === 'over' ? (
            <>
              <div className="mk-eyebrow">
                <Icon name="award" size={14} />
                {fmtDateShort(examDate)} EJU 已结束
              </div>
              <h2 className="mk-hero-title">考完了，辛苦了</h2>
              <p className="mk-calm">{state.mocks.length ? `这次冲刺一共做了 ${state.mocks.length} 场模考，记录都留在下面，想复盘随时点开。` : '真题卷都还在，想复盘或保持手感随时可以回来。'}</p>
            </>
          ) : next ? (
            <>
              <div className="mk-eyebrow">
                <Icon name="calendar" size={14} />
                下一场 · {fmtDateShort(next.date)} {weekdayZh(next.date)}
                {isToday ? (
                  <Badge tone="primary" size="sm">
                    {whenLabel(next.date, today)}
                  </Badge>
                ) : (
                  <Chip className="mk-when">{whenLabel(next.date, today)}</Chip>
                )}
              </div>
              <h2 className="mk-hero-title">{mockTitle(next.title)}</h2>
              <div className="mk-parts">
                {next.parts.map((p) => {
                  const open = openByPaper.get(`${p.kind}:${p.session}`);
                  const result = p.done ? [...state.mocks].reverse().find((m) => m.kind === p.kind && m.session === p.session) : undefined;
                  const facts = paperFacts(state, bank, p.kind, p.session, { open, result });
                  const info = KIND_INFO[p.kind];
                  const filled = !quiet && p === lead && (isToday || !!open);
                  return (
                    <div key={p.kind} className={cx('mk-part', p.done && 'is-done')}>
                      <IconTile icon={p.done ? 'check' : info.icon} tone={p.done ? 'success' : info.tone} size="md" />
                      <span className="mk-part-text">
                        <b>{info.short}</b>
                        <span className="num">
                          {sessionLabel(p.session)} · {paperMinutes(facts)} 分钟
                        </span>
                      </span>
                      {p.done ? (
                        result ? (
                          <Button variant="ghost" size="sm" iconRight="right" onClick={() => navigate('/mock/' + result.id)}>
                            <span className="num">{result.estimate}</span> 分
                          </Button>
                        ) : (
                          <span className="mk-part-done">已完成</span>
                        )
                      ) : open ? (
                        <Button variant={filled ? 'primary' : 'secondary'} size="sm" onClick={() => navigate('/session/' + open.id)}>
                          继续作答
                        </Button>
                      ) : (
                        <Button
                          variant={filled ? 'primary' : 'secondary'}
                          size="sm"
                          iconRight={isToday ? undefined : 'arrowRight'}
                          onClick={() => onStart(p.kind, p.session)}
                        >
                          {isToday ? '开始' : '提前做'}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="mk-eyebrow">
                <Icon name="award" size={14} />
                计划内的模考
              </div>
              <h2 className="mk-hero-title">都做完了</h2>
              <p className="mk-calm">考前保持手感：从下面挑没做过的卷子加练，或者回到错题本。</p>
            </>
          )}
        </div>
        {phase === 'day' && (
          <ul className="mk-rules">
            {times.split(' · ').map((t) => {
              const [name, ...rest] = t.trim().split(' ');
              return <Rule key={t} icon="clock" title={name} text={<span className="num">{rest.join(' ')}</span>} />;
            })}
          </ul>
        )}
      </div>
      {phase === 'before' && schedule.length > 0 && (
        <ol className="mk-timeline">
          {schedule.map((m) => {
            const done = m.parts.every((p) => p.done);
            const current = m === next;
            return (
              <li key={m.date + m.title} className={cx('mk-step', done && 'is-done', current && 'is-current')}>
                <span className="mk-step-dot">{done && <Icon name="check" size={10} />}</span>
                <span className="mk-step-date num">{fmtDateShort(m.date)}</span>
                <span className="mk-step-title">{mockTitle(m.title, true)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

function Rule({ icon, title, text }: { icon: IconName; title: string; text: ReactNode }) {
  return (
    <li className="mk-rule">
      <IconTile icon={icon} />
      <span>
        <b>{title}</b>
        <span className="mk-rule-text">{text}</span>
      </span>
    </li>
  );
}

function History({ results, schedule, phase, today }: { results: MockResult[]; schedule: ScheduledMock[]; phase: ExamPhase; today: string }) {
  const { state } = useReady();
  const kinds = KIND_ORDER.filter((k) => results.some((r) => r.kind === k));
  return (
    <div className="stack mk-history">
      <div className="mk-trends">
        {kinds.map((kind) => {
          const list = results.filter((r) => r.kind === kind).sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
          const last = list[list.length - 1];
          const prev = list[list.length - 2];
          const target = kindTarget(state.profile, kind);
          const info = KIND_INFO[kind];
          // The next planned mock of this kind (only while there is still time before the exam).
          const upcoming = phase === 'before' ? schedule.find((m) => m.date >= today && m.parts.some((p) => p.kind === kind && !p.done)) : undefined;
          if (list.length < 2) {
            // One result: a compact stat row; the chart appears from the second result. Same header
            // as the chart card (name + meta left, score right) so the two sit together cleanly.
            return (
              <Card key={kind} className={cx('mk-trend mk-first', `tone-${info.tone}`)}>
                <button type="button" className="mk-first-body" onClick={() => navigate('/mock/' + last.id)} aria-label={`查看 ${fmtDateShort(last.date)} 的${info.short}模考成绩`}>
                  <span className="mk-trend-head">
                    <span className="mk-trend-id">
                      <span className="mk-trend-name">
                        <Dot tone={info.tone} />
                        {info.name}
                      </span>
                      <span className="mk-trend-meta num">首次 · {fmtDateShort(last.date)}</span>
                    </span>
                    <span className="mk-trend-last">
                      <span className="num num-lg">{last.estimate}</span>
                      <span className="num-unit">/ {MOCK_MAX}</span>
                      <TargetGap value={last.estimate} target={target} />
                    </span>
                  </span>
                  <ScoreBar value={last.estimate} target={target} max={MOCK_MAX} size="sm" className={`tone-${info.tone}`} />
                  <Meta className="mk-first-facts num">
                    <span>
                      答对 {last.correct}/{last.total}
                    </span>
                    <span>得分率 {pct(last.raw)}</span>
                    <span>用时 {fmtClock(last.seconds)}</span>
                  </Meta>
                </button>
                {phase === 'before' && (
                  <p className="mk-first-hint">
                    <Icon name="chart" size={14} />
                    再做一次同类模考，就能看到走势{upcoming ? `（下一次 ${fmtDateShort(upcoming.date)}）` : ''}
                  </p>
                )}
              </Card>
            );
          }
          const delta = last.estimate - prev.estimate;
          return (
            <Card key={kind} className={cx('mk-trend', `tone-${info.tone}`)}>
              <div className="mk-trend-head">
                <div className="mk-trend-id">
                  <div className="mk-trend-name">
                    <Dot tone={info.tone} />
                    {info.name}
                  </div>
                  <div className="mk-trend-meta num">
                    {list.length} 次 · 目标 {target}
                  </div>
                </div>
                <div className="mk-trend-last">
                  <span className="num num-lg">{last.estimate}</span>
                  <span className={cx('mk-delta num', delta > 0 && 'is-up')}>
                    {delta > 0 ? '+' : delta < 0 ? '−' : '±'}
                    {Math.abs(delta)}
                  </span>
                </div>
              </div>
              <TrendChart
                points={list.map((r) => ({ id: r.id, label: fmtDateShort(r.date).replace('月', '/').replace('日', ''), sub: `${sessionLabel(r.session)} · 得分率 ${pct(r.raw)}`, value: r.estimate }))}
                target={target}
                max={MOCK_MAX}
                height={150}
                onSelect={(id) => navigate('/mock/' + id)}
              />
            </Card>
          );
        })}
      </div>

      {/* With one result per kind the cards above already say everything; the table starts with a second one. */}
      {results.length > kinds.length && <MockTable results={results} />}
    </div>
  );
}

/**
 * One table for mock records (the 模考 page and, with `compact`, the 数据 page): 日期 · 科目 ·
 * 真题卷 · 估分 · 对比目标 · 得分率 · 用时. Compact hides 真题卷 and draws 得分率 as an inline bar.
 */
export function MockTable({ results, compact = false }: { results: MockResult[]; compact?: boolean }) {
  const { state } = useReady();
  return (
    <div className={cx('card card-flush mk-table', compact && 'is-compact')} role="table" aria-label="模考记录">
      <div className="mk-tr mk-th" role="row">
        <span role="columnheader">日期</span>
        <span role="columnheader">科目</span>
        {!compact && <span role="columnheader">真题卷</span>}
        <span role="columnheader" className="is-num">
          估分
        </span>
        <span role="columnheader">对比目标</span>
        <span role="columnheader" className="is-num">
          得分率
        </span>
        <span role="columnheader" className="is-num">
          用时
        </span>
        <span aria-hidden />
      </div>
      <div className="mk-tbody">
        {results.map((r) => {
          const info = KIND_INFO[r.kind];
          return (
            <button key={r.id} type="button" className="mk-tr" role="row" onClick={() => navigate('/mock/' + r.id)}>
              <span className="num" role="cell">
                {fmtDateShort(r.date)} <span className="faint">{weekdayZh(r.date)}</span>
              </span>
              <span className="mk-td-kind" role="cell">
                <Dot tone={info.tone} />
                {info.short}
                {compact && <span className="faint">{sessionLabel(r.session)}</span>}
              </span>
              {!compact && (
                <span className="mk-td-paper" role="cell">
                  {sessionLabel(r.session)}
                </span>
              )}
              <span className="num is-num" role="cell">
                <b className="mk-td-score">{r.estimate}</b>
                <span className="faint">/{MOCK_MAX}</span>
              </span>
              <span role="cell">
                <TargetGap value={r.estimate} target={kindTarget(state.profile, r.kind)} />
              </span>
              <span className="num is-num mk-td-raw" role="cell">
                {compact && (
                  <span className="mk-td-meter" aria-hidden>
                    <i style={{ width: `${Math.round(r.raw * 100)}%` }} />
                  </span>
                )}
                {pct(r.raw)}
              </span>
              <span className="num is-num" role="cell">
                {fmtClock(r.seconds)}
              </span>
              <Icon name="right" size={16} className="mk-tr-go" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
