// #/mock — next scheduled mock, results history with trends, and every paper that can be mocked.
import { useMemo, type ReactNode } from 'react';
import type { MockKind, MockResult } from '@shared/types.ts';
import { MOCK_LABEL, sessionLabel } from '@shared/bank.ts';
import { mockItemsPadded, mockLimitFor } from '@shared/planner.ts';
import { mockSchedule, type ScheduledMock } from '@shared/planner.ts';
import { startBlock, startSession } from '@shared/actions.ts';
import { daysBetween, weekdayZh } from '@shared/dates.ts';
import { useReady, update } from '../../lib/store.ts';
import { navigate } from '../../lib/router.ts';
import { cx, fmtClock, fmtDateShort, pct } from '../../lib/format.ts';
import { Badge, Button, Card, Empty, PageHeader, Section, useConfirm } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import { KIND_INFO, KIND_ORDER, kindTarget, MOCK_MAX } from './mockData.ts';
import { TrendChart } from './charts.tsx';

function whenLabel(date: string, today: string): string {
  const d = daysBetween(today, date);
  if (d === 0) return '就是今天';
  if (d === 1) return '明天';
  if (d > 1) return `还有 ${d} 天`;
  return `已过 ${-d} 天，尽快补上`;
}

export function MockList() {
  const { state, bank, today } = useReady();
  const confirm = useConfirm();
  const schedule = useMemo(() => mockSchedule(state, bank), [state, bank]);
  const next = schedule.find((m) => m.parts.some((p) => !p.done));

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
  const latest = (kind: MockKind, session: string) => results.find((r) => r.kind === kind && r.session === session);

  const start = async (kind: MockKind, session: string) => {
    const items = mockItemsPadded(state, bank, kind, session);
    if (!items.length) return;
    const limit = mockLimitFor(kind, items);
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
          <li>
            <Icon name="eyeOff" size={14} />
            <span>中途不显示对错和解析，交卷后统一批改、估分</span>
          </li>
          {early && (
            <li>
              <Icon name="calendar" size={14} />
              <span>
                原本安排在 {fmtDateShort(slot.date)}「{slot.title}」，提前做也算完成
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
      <PageHeader title="模考" desc="按 EJU 真实时长整卷限时做，交卷后估分、逐题复盘。" />

      {unfinished && (
        <div className="mk-resume">
          <span className="mk-resume-icon">
            <Icon name="clock" size={18} />
          </span>
          <div className="mk-resume-text">
            <b>有一场模考还没交卷</b>
            <span className="muted num">
              {unfinished.title} · 已用 {fmtClock(unfinished.elapsedSec)}
              {unfinished.timeLimitSec ? ` / ${fmtClock(unfinished.timeLimitSec)}` : ''}
            </span>
          </div>
          <Button variant="primary" iconRight="arrowRight" onClick={() => navigate('/session/' + unfinished.id)}>
            继续作答
          </Button>
        </div>
      )}

      <NextMock next={next} schedule={schedule} today={today} onStart={(k, s) => void start(k, s)} />

      <Section title="模考记录" desc="估分按得分率折算到 200 分制，看趋势比看单次更有意义。">
        {results.length ? <History results={results} /> : <Empty icon="target" title="还没有模考记录" desc={next ? `第一场安排在 ${fmtDateShort(next.date)}。想先熟悉节奏，可以从下面挑一套没有计划的卷子。` : '从下面挑一套卷子开始第一场模考。'} />}
      </Section>

      <Section title="全部真题卷" desc="带「计划」的卷子已排进冲刺日程，建议按日期做；其余可以随时加练。">
        <div className="mk-kinds">
          {KIND_ORDER.map((kind) => {
            const papers = bank.bundle.papers.filter((p) => p.mocks.includes(kind));
            if (!papers.length) return null;
            const info = KIND_INFO[kind];
            return (
              <Card key={kind} className={cx('mk-kind', `tone-${info.tone}`)} padding={false}>
                <header className="mk-kind-head">
                  <span className="mk-kind-icon">
                    <Icon name={info.icon} size={17} />
                  </span>
                  <div>
                    <h3>{info.name}</h3>
                    <p className="faint text-sm">{kind === 'math' || kind === 'science' ? '80 分钟 · 满分 200' : kind === 'ja-reading' ? '按题量折算时间 · 满分 200' : '每题只听一遍 · 满分 200'}</p>
                  </div>
                </header>
                <div className="mk-papers">
                  {papers.map((p) => {
                    const items = mockItemsPadded(state, bank, kind, p.session);
                    const done = latest(kind, p.session);
                    const slot = slotOf.get(`${kind}:${p.session}`);
                    const seen = items.filter((it) => (state.progress[it.id]?.attempts ?? 0) > 0).length;
                    return (
                      <div key={p.session} className="mk-paper">
                        <div className="mk-paper-main">
                          <div className="mk-paper-title">
                            <b>{p.label}</b>
                            {done ? (
                              <Badge tone="success" icon="check">
                                已完成 · {done.estimate}
                              </Badge>
                            ) : slot ? (
                              <Badge tone="primary" icon="calendar">
                                计划 {fmtDateShort(slot.date)}
                              </Badge>
                            ) : null}
                          </div>
                          <div className="mk-paper-meta num">
                            {items.length} 题 · {Math.round(mockLimitFor(kind, items) / 60)} 分钟
                            {!done && seen > 0 && <span className="mk-seen"> · 已练过 {seen} 题</span>}
                          </div>
                        </div>
                        {done ? (
                          <Button variant="ghost" size="sm" iconRight="right" onClick={() => navigate('/mock/' + done.id)}>
                            复盘
                          </Button>
                        ) : (
                          <Button variant="secondary" size="sm" icon="play" onClick={() => void start(kind, p.session)}>
                            开始
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      </Section>
      {confirm.node}
    </div>
  );
}

function NextMock({ next, schedule, today, onStart }: { next?: ScheduledMock; schedule: ScheduledMock[]; today: string; onStart: (kind: MockKind, session: string) => void }) {
  const { state, bank } = useReady();
  const isToday = !!next && next.date <= today;
  return (
    <section className="mk-hero">
      <div className="mk-hero-top">
        <div className="mk-hero-main">
          {next ? (
            <>
              <div className="mk-eyebrow">
                <Icon name="calendar" size={14} />
                下一场 · {fmtDateShort(next.date)} {weekdayZh(next.date)}
                <span className={cx('mk-when', isToday && 'is-today')}>{whenLabel(next.date, today)}</span>
              </div>
              <h2 className="mk-hero-title">{next.title}</h2>
              <div className="mk-parts">
                {next.parts.map((p) => {
                  const items = mockItemsPadded(state, bank, p.kind, p.session);
                  const info = KIND_INFO[p.kind];
                  return (
                    <div key={p.kind} className={cx('mk-part', `tone-${info.tone}`, p.done && 'is-done')}>
                      <span className="mk-part-icon">
                        <Icon name={p.done ? 'check' : info.icon} size={15} />
                      </span>
                      <span className="mk-part-text">
                        <b>{info.short}</b>
                        <span className="faint num">
                          {sessionLabel(p.session)} · {Math.round(mockLimitFor(p.kind, items) / 60)} 分钟
                        </span>
                      </span>
                      {p.done ? (
                        <span className="mk-part-done">已完成</span>
                      ) : (
                        <Button variant={isToday ? 'primary' : 'ghost'} size="sm" onClick={() => onStart(p.kind, p.session)}>
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
              <p className="muted">考前保持手感：从下面挑没做过的卷子加练，或者回到错题本。</p>
            </>
          )}
        </div>
        <ul className="mk-rules">
          <Rule icon="clock" title="限时" text="按考试时长倒计时，到点自动交卷" />
          <Rule icon="eyeOff" title="中途不看解析" text="和考场一样，做完整卷再批改" />
          <Rule icon="chart" title="交卷后估分" text="估分、逐题对错、考点与用时分析" />
        </ul>
      </div>
      {schedule.length > 0 && (
        <ol className="mk-timeline">
          {schedule.map((m) => {
            const done = m.parts.every((p) => p.done);
            const current = m === next;
            return (
              <li key={m.date + m.title} className={cx('mk-step', done && 'is-done', current && 'is-current')}>
                <span className="mk-step-dot">{done && <Icon name="check" size={11} />}</span>
                <span className="mk-step-date num">{fmtDateShort(m.date)}</span>
                <span className="mk-step-title">{m.title.replace('（按考试日时间表）', '')}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function Rule({ icon, title, text }: { icon: 'clock' | 'eyeOff' | 'chart'; title: string; text: ReactNode }) {
  return (
    <li className="mk-rule">
      <span className="mk-rule-icon">
        <Icon name={icon} size={15} />
      </span>
      <span>
        <b>{title}</b>
        <span className="faint">{text}</span>
      </span>
    </li>
  );
}

function History({ results }: { results: MockResult[] }) {
  const { state } = useReady();
  const kinds = KIND_ORDER.filter((k) => results.some((r) => r.kind === k));
  return (
    <div className="stack">
      <div className="mk-trends">
        {kinds.map((kind) => {
          const list = results.filter((r) => r.kind === kind).sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
          const last = list[list.length - 1];
          const prev = list[list.length - 2];
          const target = kindTarget(state.profile, kind);
          const info = KIND_INFO[kind];
          return (
            <Card key={kind} className={cx('mk-trend', `tone-${info.tone}`)}>
              <div className="mk-trend-head">
                <div>
                  <div className="mk-trend-name">
                    <span className="mk-swatch" />
                    {info.name}
                  </div>
                  <div className="faint text-sm">
                    {list.length} 次 · 目标 {target}
                  </div>
                </div>
                <div className="mk-trend-last">
                  <span className="num mk-trend-value">{last.estimate}</span>
                  {prev ? (
                    <span className={cx('mk-delta num', last.estimate >= prev.estimate ? 'is-up' : 'is-down')}>
                      {last.estimate >= prev.estimate ? '+' : ''}
                      {last.estimate - prev.estimate}
                    </span>
                  ) : (
                    <span className="faint text-xs">首次</span>
                  )}
                </div>
              </div>
              <TrendChart
                points={list.map((r) => ({ id: r.id, label: fmtDateShort(r.date).replace('月', '/').replace('日', ''), sub: `${sessionLabel(r.session)} · 得分率 ${pct(r.raw)}`, value: r.estimate }))}
                target={target}
                max={MOCK_MAX}
                height={140}
                onSelect={(id) => navigate('/mock/' + id)}
              />
              {list.length === 1 && <p className="mk-trend-hint faint text-xs">再做一次同类模考，就能看到走势。</p>}
            </Card>
          );
        })}
      </div>

      <div className="mk-table" role="table">
        <div className="mk-tr mk-th" role="row">
          <span>日期</span>
          <span>科目</span>
          <span>真题卷</span>
          <span>估分 / 目标</span>
          <span>得分率</span>
          <span>用时</span>
          <span />
        </div>
        {results.map((r) => {
          const target = kindTarget(state.profile, r.kind);
          const gap = r.estimate - target;
          return (
            <button key={r.id} type="button" className="mk-tr" role="row" onClick={() => navigate('/mock/' + r.id)}>
              <span className="num">
                {fmtDateShort(r.date)} <span className="faint">{weekdayZh(r.date)}</span>
              </span>
              <span className="mk-td-kind">
                <span className={cx('mk-swatch', `tone-${KIND_INFO[r.kind].tone}`)} />
                {KIND_INFO[r.kind].short}
              </span>
              <span>{sessionLabel(r.session)}</span>
              <span className="num">
                <b className="mk-td-score">{r.estimate}</b>
                <span className="faint"> / {target}</span>
                <span className={cx('mk-gap', gap >= 0 ? 'is-up' : 'is-down')}>{gap >= 0 ? `+${gap}` : gap}</span>
              </span>
              <span className="num">{pct(r.raw)}</span>
              <span className="num">{fmtClock(r.seconds)}</span>
              <Icon name="right" size={16} className="mk-tr-go" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
