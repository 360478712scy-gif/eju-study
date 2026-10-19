// 今日 — the home screen. Answers "what do I do now?" at a glance:
// a hero card with the next step, today's progress, the plan, and a side panel
// with the predicted score, due reviews and the next mock.
import { useMemo, useState, type ReactNode } from 'react';
import { useApp, useReady, update } from '../../lib/store.ts';
import { href, navigate } from '../../lib/router.ts';
import { Badge, Button, IconButton, Progress, Ring, SubjectDot, toast, useConfirm } from '../../components/ui.tsx';
import { Icon, SUBJECT_ICON, type IconName } from '../../components/Icon.tsx';
import type { AppState, DayPlan, PlanBlock, PracticeSession, Subject } from '@shared/types.ts';
import { MOCK_LABEL, sessionLabel, type BankIndex } from '@shared/bank.ts';
import { PHASE_INFO, POOLS, calendar, daysLeftOn, extraBlock, freshRemaining, mockSchedule, phaseFor, type Pool, vocabDueCount } from '@shared/planner.ts';
import { estimateAll, streak, totalEstimate, SCALE_MAX } from '@shared/stats.ts';
import { isDue } from '@shared/srs.ts';
import { addDays, daysBetween, studyDate, weekdayZh } from '@shared/dates.ts';
import { SUBJECT_NAME, cx, fmtDateShort, fmtMinutes, pct } from '../../lib/format.ts';
import { DurationDialog } from './DurationDialog.tsx';
import { AfterExam, ExamDay } from './ExamDay.tsx';
import {
  PHASE_TONE,
  blockCount,
  blockIcon,
  blockKindLabel,
  blockTone,
  blockView,
  countLabel,
  finishBlockManually,
  openSessionFor,
  redoBlock,
  regenerateDay,
  restoreBlock,
  resumableSession,
  runBlock,
  sessionAnswered,
  skipBlock,
  type BlockView,
} from './blocks.ts';
import './today.css';

const NO_BLOCKS: PlanBlock[] = [];
const SCORE_ORDER: Subject[] = ['japanese', 'math', 'physics', 'chemistry'];

export function TodayPage() {
  const { state, bank, today } = useReady();
  const left = daysLeftOn(state, today);
  if (left === 0) return <ExamDay />;
  if (left < 0) return <AfterExam />;
  return <TodayMain state={state} bank={bank} today={today} left={left} />;
}

function greeting(hour: number): string {
  if (hour < 4) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 13) return '中午好';
  if (hour < 18) return '下午好';
  if (hour < 23) return '晚上好';
  return '夜深了';
}

/** "1 小时 25 分" with big numerals. */
function HM({ minutes }: { minutes: number }) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return (
    <span className="td-hm">
      {h > 0 && (
        <>
          <span className="num">{h}</span>
          <small>小时</small>
        </>
      )}
      {(r > 0 || h === 0) && (
        <>
          <span className="num">{r}</span>
          <small>分</small>
        </>
      )}
    </span>
  );
}

interface Ctx {
  state: AppState;
  bank: BankIndex;
  today: string;
}

function TodayMain({ state, bank, today, left }: Ctx & { left: number }) {
  const plan: DayPlan | undefined = state.plans[today];
  const blocks = plan?.blocks ?? NO_BLOCKS;
  const [durationOpen, setDurationOpen] = useState(false);
  const confirm = useConfirm();

  const views = useMemo(() => blocks.map((b) => blockView(state, b)), [blocks, state]);
  // The session left mid-way leads the page when it belongs to today's plan or was started today;
  // an older one is offered in a slim notice instead of hiding today's plan.
  const open = resumableSession(state);
  const openBlockIdx = open?.blockId ? blocks.findIndex((b) => b.id === open.blockId) : -1;
  const fresh = !!open && (openBlockIdx >= 0 || studyDate(new Date(open.startedAt)) === today);
  const resume = fresh ? open : undefined;
  const stale = fresh ? undefined : open;
  const activeIdx = views.indexOf('active');
  const nextIdx = openBlockIdx >= 0 && fresh ? openBlockIdx : activeIdx >= 0 ? activeIdx : views.indexOf('todo');
  const doneCount = views.filter((v) => v === 'done').length;
  const countable = views.filter((v) => v !== 'skipped').length;
  const allResolved = blocks.length > 0 && nextIdx < 0 && !resume && !views.includes('locked');
  const skippedMock = blocks.find((b, i) => b.kind === 'mock' && views[i] === 'skipped');

  const hour = new Date().getHours();
  const phase = phaseFor(left);
  const cal = useMemo(() => calendar(state, bank, state.profile.startDate <= today ? state.profile.startDate : today), [state, bank, today]);
  const phaseDays = cal.filter((d) => d.phase === phase);
  const phaseIdx = phaseDays.findIndex((d) => d.date === today);

  let headline: string;
  if (!blocks.length) headline = '今天是休息日';
  else if (hour < 4) headline = allResolved ? '今天的计划完成了，去睡吧' : '做完这一块就休息吧';
  else if (allResolved) headline = '今天的计划完成了';
  else if (doneCount === 0) headline = '从第一块开始吧';
  else headline = `已完成 ${doneCount} / ${countable} 块，继续保持`;

  const startMock = async (b: PlanBlock) => {
    const ok = await confirm.ask(`开始${b.mock ? MOCK_LABEL[b.mock.kind] : ''}模考？`, {
      body: (
        <>
          限时 {b.minutes} 分钟，中途不显示对错，交卷后统一判分、估分。
          <br />
          找个安静的地方，准备好草稿纸再开始。
        </>
      ),
      ok: '开始计时',
    });
    if (ok) runBlock(state, bank, b);
  };
  const start = (b: PlanBlock) => {
    if (b.kind === 'mock' && !openSessionFor(state, b.id)) void startMock(b);
    else runBlock(state, bank, b);
  };

  const regen = async () => {
    const ok = await confirm.ask('重新生成今天的计划？', {
      body: '已完成和进行中的块会保留，其余按你最新的正确率和薄弱点重新安排。',
      ok: '重新生成',
    });
    if (!ok) return;
    update((d, b, t) => regenerateDay(d, b, t));
    toast('计划已更新', 'success');
  };

  const addExtra = (pool: Pool) => {
    const b = update((d, bk, t) => {
      const x = extraBlock(d, bk, t, pool);
      if (x && d.plans[t]) d.plans[t].blocks.push(x);
      return x;
    });
    if (b) toast(`已加入：${b.title}`, 'success');
    else toast('这个方向暂时没有新题了，换一个试试', 'warning');
  };

  const plannedMinutes = blocks.filter((_, i) => views[i] !== 'skipped').reduce((s, b) => s + b.minutes, 0);
  const supply = useMemo(() => supplyNote(freshRemaining(state, bank)), [state, bank]);

  return (
    <div className="page td">
      <header className="td-head">
        <div className="td-head-main">
          <div className="td-date">
            <Icon name="calendar" size={14} />
            {fmtDateShort(today)} {weekdayZh(today)}
            {hour < 4 && <span className="td-late">凌晨 4 点前仍算作今天</span>}
          </div>
          <h1 className="td-title">
            {greeting(hour)}，{headline}
          </h1>
          <div className="td-phase">
            <span className={cx('td-phase-pill', `tone-${PHASE_TONE[phase]}`)}>
              {PHASE_INFO[phase].name}
              {phaseIdx >= 0 && (
                <span className="td-phase-day">
                  第 {phaseIdx + 1} / {phaseDays.length} 天
                </span>
              )}
            </span>
            <span className="td-phase-desc">{PHASE_INFO[phase].desc}</span>
          </div>
        </div>
        <a className="td-count" href={href('/plan')} title="查看冲刺计划">
          <span className="td-count-label">距考试</span>
          <span className="td-count-row">
            <span className="td-count-num num">{left}</span>
            <span className="td-count-unit">天</span>
          </span>
          <span className="td-count-date">{fmtDateShort(state.profile.examDate)} EJU</span>
        </a>
      </header>

      <div className="td-layout">
        <div className="td-main">
          {resume || nextIdx >= 0 ? (
            <NextHero
              state={state}
              bank={bank}
              today={today}
              session={resume}
              block={resume && openBlockIdx < 0 ? undefined : nextIdx >= 0 ? blocks[nextIdx] : undefined}
              index={resume && openBlockIdx < 0 ? -1 : nextIdx}
              total={blocks.length}
              onStart={start}
            />
          ) : allResolved ? (
            <DoneHero state={state} bank={bank} today={today} onExtra={addExtra} />
          ) : !blocks.length ? (
            <RestHero state={state} bank={bank} today={today} onExtra={addExtra} onAdjust={() => setDurationOpen(true)} />
          ) : (
            <WaitingHero skippedMock={skippedMock} />
          )}

          {stale && <StaleNotice session={stale} />}

          {blocks.length > 0 && (
            <section className="card card-flush td-plan">
              <header className="td-plan-head">
                <div>
                  <h2 className="td-h2">今日计划</h2>
                  <p className="td-plan-sub">
                    {countable} 块 · 约 {fmtMinutes(plannedMinutes)} · 已完成 {doneCount}
                  </p>
                </div>
                <div className="td-plan-actions">
                  <Button size="sm" variant="ghost" icon="clock" onClick={() => setDurationOpen(true)}>
                    调整时长
                  </Button>
                  <Button size="sm" variant="ghost" icon="refresh" onClick={() => void regen()}>
                    重新生成
                  </Button>
                </div>
              </header>
              <ol className="td-rows">
                {blocks.map((b, i) => (
                  <BlockRow key={b.id} state={state} bank={bank} block={b} view={views[i]} isNext={i === nextIdx} onStart={start} />
                ))}
              </ol>
              {supply && (
                <p className="td-supply">
                  <Icon name="info" size={14} />
                  <span>{supply}</span>
                </p>
              )}
            </section>
          )}
        </div>

        <aside className="td-aside">
          <ProgressCard state={state} today={today} plan={plan} done={doneCount} total={countable} onAdjust={() => setDurationOpen(true)} />
          <div className={cx('td-aside-rest', bedtimeFor(left) !== null && 'has-sleep')}>
            <SleepCard state={state} bank={bank} today={today} left={left} />
            <ScoreCard state={state} />
            <DueCard state={state} today={today} bank={bank} />
            <MockCard state={state} bank={bank} today={today} />
          </div>
        </aside>
      </div>

      <DurationDialog open={durationOpen} date={today} onClose={() => setDurationOpen(false)} />
      {confirm.node}
    </div>
  );
}

// ─────────────────────────── Hero ───────────────────────────

function NextHero({
  state,
  bank,
  session,
  block,
  index,
  total,
  onStart,
}: Ctx & { session?: PracticeSession; block?: PlanBlock; index: number; total: number; onStart: (b: PlanBlock) => void }) {
  const tone = block ? blockTone(block) : session && session.subject !== 'mixed' ? session.subject : 'primary';
  const icon: IconName = block ? blockIcon(block) : session?.kind === 'mock' ? 'target' : SUBJECT_ICON[session?.subject ?? 'mixed'];
  const view = block ? blockView(state, block) : 'active';
  const open = session ?? (block && view === 'active' ? openSessionFor(state, block.id) : undefined);
  const isMock = block?.kind === 'mock' || session?.kind === 'mock';
  const manual = block && view === 'active' && !open && (block.kind === 'vocab' || block.kind === 'notes' || block.kind === 'traps');
  const count = block ? blockCount(state, bank, block) : null;

  const title = block?.title ?? session?.title ?? '';
  let eyebrow = '下一步';
  let reason: ReactNode = block?.reason;
  let primary = isMock ? '开始模考' : '开始';
  let progress: number | null = null;

  if (open) {
    const answered = sessionAnswered(open);
    eyebrow = '继续上次';
    primary = '继续';
    progress = open.itemIds.length ? answered / open.itemIds.length : 0;
    const remain = open.timeLimitSec ? Math.max(0, open.timeLimitSec - open.elapsedSec) : null;
    reason = (
      <>
        {answered > 0 ? (
          <>
            已做 <b className="num">{answered}</b> / {open.itemIds.length} 题
          </>
        ) : (
          <>共 {open.itemIds.length} 题，还没开始作答</>
        )}
        {remain !== null ? (
          <>
            ，计时还剩 <b className="num">{Math.ceil(remain / 60)}</b> 分钟
          </>
        ) : (
          open.elapsedSec >= 60 && <>，已用 {fmtMinutes(open.elapsedSec / 60)}</>
        )}
        {block?.reason && <span className="td-hero-reason-tail">{block.reason}</span>}
      </>
    );
  } else if (manual) {
    eyebrow = '进行中';
    primary = block.kind === 'vocab' ? '继续背词' : block.kind === 'traps' ? '继续看' : '继续看笔记';
    reason =
      block.kind === 'vocab'
        ? '背完今天的复习和新词后，回来点「已完成」进入下一块。'
        : block.kind === 'traps'
          ? '把这一页易错点过一遍，看完点「已完成」。'
          : '看完公式和易错点后，回来点「已完成」进入下一块。';
  }

  const go = () => {
    if (open && !block) return navigate('/session/' + open.id);
    if (block) onStart(block);
  };

  return (
    <section className={cx('td-hero', `tone-${tone}`, isMock && 'is-mock')}>
      <div className="td-hero-art" aria-hidden>
        <Icon name={icon} size={210} />
      </div>
      <div className="td-hero-top">
        <span className="td-hero-eyebrow">
          <span className="td-pulse" />
          {eyebrow}
        </span>
        {block && index >= 0 && (
          <span className="td-hero-step">
            第 {index + 1} 块 · 共 {total} 块
          </span>
        )}
      </div>
      <div className="td-hero-main">
        <div className="td-hero-icon">
          <Icon name={icon} size={26} />
        </div>
        <div className="td-hero-text">
          <h2 className="td-hero-title">{title}</h2>
          {reason && <p className="td-hero-reason">{reason}</p>}
        </div>
      </div>
      {progress !== null && <Progress value={progress} tone={tone} className="td-hero-progress" />}
      <div className="td-hero-foot">
        <div className="td-hero-meta">
          {block && (
            <span>
              <Icon name={blockIcon(block)} size={15} />
              {blockKindLabel(block)}
            </span>
          )}
          {block && (
            <span>
              <Icon name="clock" size={15} />约 {fmtMinutes(block.minutes)}
            </span>
          )}
          {block && count !== null && (
            <span>
              <Icon name="list" size={15} />
              {countLabel(block, count)}
            </span>
          )}
          {(block?.timed || isMock) && (
            <span>
              <Icon name="flag" size={15} />
              {isMock ? '整卷限时 · 交卷后估分' : '限时 · 做完统一看解析'}
            </span>
          )}
        </div>
        <div className="td-hero-actions">
          {manual && (
            <Button variant="secondary" size="lg" icon="check" onClick={() => finishBlockManually(block.id)}>
              已完成
            </Button>
          )}
          <Button variant="primary" size="lg" iconRight="arrowRight" onClick={go} autoFocus>
            {primary}
          </Button>
        </div>
      </div>
    </section>
  );
}

const POOL_ICON: Record<Pool, IconName> = { math: 'sigma', physics: 'atom', chemistry: 'flask', 'ja-reading': 'book', 'ja-listening': 'headphones', 'ja-grammar': 'book', recall: 'zap' };
const POOL_TONE: Record<Pool, Subject | 'mixed'> = { math: 'math', physics: 'physics', chemistry: 'chemistry', 'ja-reading': 'japanese', 'ja-listening': 'japanese', 'ja-grammar': 'japanese', recall: 'mixed' };

const MAIN_POOLS: Pool[] = ['math', 'physics', 'chemistry', 'ja-reading', 'ja-listening'];
const LOW_SUPPLY = 10;

/** "物理新题还剩 6 道，之后以错题和限时回炉为主" when a main pool is nearly out of never-seen items. */
function supplyNote(fresh: Record<string, number>): string | null {
  const parts = MAIN_POOLS.filter((p) => (fresh[p] ?? 0) < LOW_SUPPLY).map((p) => {
    const name = POOLS.find((x) => x.id === p)?.name ?? p;
    const n = fresh[p] ?? 0;
    return n > 0 ? `${name}新题还剩 ${n} 道` : `${name}新题已经做完`;
  });
  return parts.length ? `${parts.join('，')}，之后以错题和限时回炉为主` : null;
}

/** "加练" picker. Each pool shows what it would add; pools without fresh items are disabled. */
function ExtraChooser({ state, bank, today, onExtra, label }: Ctx & { onExtra: (p: Pool) => void; label: string }) {
  // extraBlock is pure (it only reads the state), so it doubles as a preview.
  const options = useMemo(() => POOLS.map((p) => ({ ...p, preview: extraBlock(state, bank, today, p.id) })), [state, bank, today]);
  const any = options.some((o) => o.preview);
  return (
    <div className="td-extra">
      <div className="td-extra-label">{any ? label : '题库里能加练的新题这几天都做过了，可以去错题本或题库自由练习'}</div>
      {any ? (
        <div className="td-extra-grid">
          {options.map((o) => (
            <button key={o.id} type="button" className={cx('td-extra-btn', `tone-${POOL_TONE[o.id]}`)} onClick={() => onExtra(o.id)} disabled={!o.preview}>
              <span className="td-extra-icon">
                <Icon name={POOL_ICON[o.id]} size={18} />
              </span>
              <span className="td-extra-name">{o.name}</span>
              <span className="td-extra-sub">{o.preview ? `${o.preview.itemIds.length} 题 · ${o.preview.minutes} 分钟` : '暂无新题'}</span>
              {o.preview && <Icon name="plus" size={15} className="td-extra-plus" />}
            </button>
          ))}
        </div>
      ) : (
        <div className="td-extra-none">
          <Button variant="secondary" icon="alert" onClick={() => navigate('/mistakes')}>
            去错题本
          </Button>
          <Button variant="ghost" icon="book" onClick={() => navigate('/practice')}>
            题库自由练习
          </Button>
        </div>
      )}
    </div>
  );
}

function DoneHero({ state, bank, today, onExtra }: Ctx & { onExtra: (p: Pool) => void }) {
  const day = state.days[today];
  const answered = day?.answered ?? 0;
  return (
    <section className="td-hero td-hero-done tone-success">
      <div className="td-done-top">
        <div className="td-done-badge">
          <Icon name="award" size={26} />
        </div>
        <div>
          <h2 className="td-hero-title">今天的计划全部完成</h2>
          <p className="td-hero-reason">
            学习 {fmtMinutes((day?.seconds ?? 0) / 60)}
            {answered > 0 && (
              <>
                {' '}
                · 做题 {answered} · 正确率 {pct((day?.correct ?? 0) / answered)}
              </>
            )}
            。明天的计划会根据今天的表现自动调整。
          </p>
        </div>
      </div>
      <ExtraChooser state={state} bank={bank} today={today} onExtra={onExtra} label="还有精力？选一个方向加练一块" />
    </section>
  );
}

function RestHero({ state, bank, today, onExtra, onAdjust }: Ctx & { onExtra: (p: Pool) => void; onAdjust: () => void }) {
  return (
    <section className="td-hero td-hero-done tone-primary">
      <div className="td-done-top">
        <div className="td-done-badge">
          <Icon name="coffee" size={24} />
        </div>
        <div>
          <h2 className="td-hero-title">今天是休息日</h2>
          <p className="td-hero-reason">好好休息，状态比时长更重要。</p>
        </div>
        <Button variant="secondary" icon="clock" onClick={onAdjust} className="td-rest-btn">
          改成学习日
        </Button>
      </div>
      <ExtraChooser state={state} bank={bank} today={today} onExtra={onExtra} label="想学一点的话，选一个方向加练一块" />
    </section>
  );
}

function WaitingHero({ skippedMock }: { skippedMock?: PlanBlock }) {
  return (
    <section className="td-hero td-hero-done tone-warning">
      <div className="td-done-top">
        <div className="td-done-badge">
          <Icon name="target" size={24} />
        </div>
        <div>
          <h2 className="td-hero-title">{skippedMock ? '模考跳过了，订正暂时锁定' : '先完成今天的模考'}</h2>
          <p className="td-hero-reason">剩下的订正块会在模考交卷后解锁。</p>
        </div>
        {skippedMock && (
          <Button variant="secondary" icon="undo" onClick={() => restoreBlock(skippedMock.id)} className="td-rest-btn">
            恢复模考
          </Button>
        )}
      </div>
    </section>
  );
}

function StaleNotice({ session }: { session: PracticeSession }) {
  const answered = sessionAnswered(session);
  return (
    <div className="td-stale">
      <Icon name="clock" size={16} />
      <span className="td-stale-text">
        上次的「{session.title}」还没做完
        <span className="faint">
          {' '}
          · 已做 {answered}/{session.itemIds.length}
        </span>
      </span>
      <Button size="sm" variant="ghost" iconRight="right" onClick={() => navigate('/session/' + session.id)}>
        继续
      </Button>
    </div>
  );
}

// ─────────────────────────── Block list ───────────────────────────

function BlockRow({ state, bank, block, view, isNext, onStart }: { state: AppState; bank: BankIndex; block: PlanBlock; view: BlockView; isNext: boolean; onStart: (b: PlanBlock) => void }) {
  const tone = blockTone(block);
  const n = blockCount(state, bank, block);
  const open = view === 'active' ? openSessionFor(state, block.id) : undefined;
  const isMock = block.kind === 'mock';
  const mockResult = isMock && block.mock ? [...state.mocks].reverse().find((m) => m.kind === block.mock?.kind && m.session === block.mock?.session) : undefined;

  let side: ReactNode;
  switch (view) {
    case 'todo':
      side = (
        <>
          <IconButton icon="skip" label="跳过这一块" size="sm" className="td-row-skip" onClick={() => skipBlock(block.id)} />
          <Button size="sm" variant={isNext ? 'primary' : 'secondary'} onClick={() => onStart(block)}>
            {isMock ? '开始模考' : '开始'}
          </Button>
        </>
      );
      break;
    case 'active':
      side = (
        <>
          {open ? (
            <span className="td-row-state">
              已做 <b className="num">{sessionAnswered(open)}</b>/{open.itemIds.length}
            </span>
          ) : (
            <Button size="sm" variant="ghost" icon="check" onClick={() => finishBlockManually(block.id)}>
              完成
            </Button>
          )}
          <Button size="sm" variant={isNext ? 'primary' : 'secondary'} onClick={() => onStart(block)}>
            继续
          </Button>
        </>
      );
      break;
    case 'done': {
      const r = block.result;
      side = (
        <>
          <span className="td-row-result">
            <Icon name="checkCircle" size={15} />
            {mockResult ? (
              <>
                估分 <b className="num">{mockResult.estimate}</b>
              </>
            ) : r && r.answered > 0 ? (
              <>
                <b className="num">
                  {r.correct}/{r.answered}
                </b>
                <span className="td-row-dot">·</span>
                {Math.max(1, Math.round(r.seconds / 60))} 分钟
              </>
            ) : (
              '已完成'
            )}
          </span>
          {mockResult ? (
            <Button size="sm" variant="ghost" onClick={() => navigate('/mock/' + mockResult.id)}>
              报告
            </Button>
          ) : (
            block.kind !== 'mock' && (
              <Button size="sm" variant="ghost" onClick={() => redoBlock(state, block)}>
                {block.kind === 'vocab' ? '再背' : block.kind === 'notes' || block.kind === 'traps' ? '再看' : '再练'}
              </Button>
            )
          )}
        </>
      );
      break;
    }
    case 'skipped':
      side = (
        <>
          <span className="td-row-state">已跳过</span>
          <Button size="sm" variant="ghost" icon="undo" onClick={() => restoreBlock(block.id)}>
            恢复
          </Button>
        </>
      );
      break;
    case 'locked':
      side = (
        <span className="td-row-locked">
          <Icon name="clock" size={14} />
          模考交卷后解锁
        </span>
      );
      break;
  }

  return (
    <li className={cx('td-row', `tone-${tone}`, `is-${view}`, isNext && 'is-next', isMock && 'is-mock')}>
      <div className="td-row-icon">{view === 'done' ? <Icon name="check" size={18} /> : <Icon name={blockIcon(block)} size={18} />}</div>
      <div className="td-row-body">
        <div className="td-row-meta">
          <span className="td-row-kind">{blockKindLabel(block)}</span>
          <span>{fmtMinutes(block.minutes)}</span>
          {n !== null && <span>{countLabel(block, n)}</span>}
          {isMock && <Badge tone="primary">真题整卷</Badge>}
          {block.extra && <Badge tone="success">加练</Badge>}
        </div>
        <div className="td-row-title">{block.title}</div>
        <div className="td-row-reason" title={block.reason}>
          {block.reason}
        </div>
      </div>
      <div className="td-row-side">{side}</div>
    </li>
  );
}

// ─────────────────────────── Side panel ───────────────────────────

function ProgressCard({ state, today, plan, done, total, onAdjust }: { state: AppState; today: string; plan?: DayPlan; done: number; total: number; onAdjust: () => void }) {
  const day = state.days[today];
  const studied = (day?.seconds ?? 0) / 60;
  const budget = plan?.budgetMinutes ?? 0;
  const answered = day?.answered ?? 0;
  const st = streak(state, today);
  const ratio = budget ? studied / budget : 0;
  return (
    <section className="card td-progress">
      <div className="td-pg-top">
        <Ring value={ratio} size={92} stroke={9} tone={ratio >= 1 ? 'success' : 'primary'}>
          <span className="td-pg-pct num">{budget ? Math.min(999, Math.round(ratio * 100)) : 0}%</span>
        </Ring>
        <div className="td-pg-time">
          <div className="td-label">今日已学</div>
          <HM minutes={studied} />
          <div className="td-pg-budget">
            计划 {budget ? fmtMinutes(budget) : '休息'}
            <button type="button" className="td-link" onClick={onAdjust}>
              调整
            </button>
          </div>
        </div>
      </div>
      <div className="td-pg-stats">
        <MiniStat icon="checkCircle" value={`${done}/${total}`} label="完成块" />
        <MiniStat icon="pen" value={answered} label={answered ? `正确率 ${pct((day?.correct ?? 0) / answered)}` : '今日做题'} />
        <MiniStat icon="flame" value={st} label="连续天数" hot={st >= 3} />
      </div>
    </section>
  );
}

// From D-10 the target finishing time moves 20 minutes earlier each night, 01:30 → 23:00 (D-3),
// so the body clock is awake for 日本語 at 9:30 on exam day. Times are minutes from midnight
// (negative = the evening before midnight).
const SHIFT_FROM = 10;
const SHIFT_START = 90;
const SHIFT_STEP = 20;
const SHIFT_END = -60;

function bedtimeFor(left: number): number | null {
  if (left > SHIFT_FROM || left < 1) return null;
  if (left <= 3) return SHIFT_END;
  return Math.max(SHIFT_END, SHIFT_START - SHIFT_STEP * (SHIFT_FROM - left));
}

function clockText(m: number): string {
  const t = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** Minutes since the study day began (04:00), so 01:30 counts as later than 23:00. */
function dayMinute(m: number): number {
  return (((m - 240) % 1440) + 1440) % 1440;
}

/** "2026-11-04" → "11/4". */
function md(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}`;
}

function SleepCard({ state, bank, left }: Ctx & { left: number }) {
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
  const now = new Date();
  const toGo = dayMinute(target) - dayMinute(now.getHours() * 60 + now.getMinutes());
  return (
    <section className="card td-sleep">
      <div className="td-sleep-top">
        <span className="td-sleep-icon">
          <Icon name="moon" size={17} />
        </span>
        <div className="td-sleep-main">
          <div className="td-sleep-label">
            <span className="td-label">作息 · 今晚收工</span>
            {toGo <= 0 ? <span className="td-sleep-chip is-late">已到点</span> : toGo <= 60 && <span className="td-sleep-chip">还有 {toGo} 分钟</span>}
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
        <p className="td-sleep-alert">
          <Icon name="sun" size={15} />
          {md(sim.date)} 全真模拟请早上 9:30 开始
        </p>
      )}
    </section>
  );
}

function MiniStat({ icon, value, label, hot }: { icon: IconName; value: ReactNode; label: string; hot?: boolean }) {
  return (
    <div className={cx('td-mini', hot && 'is-hot')}>
      <Icon name={icon} size={15} />
      <span className="td-mini-val num">{value}</span>
      <span className="td-mini-label">{label}</span>
    </div>
  );
}

function ScoreCard({ state }: { state: AppState }) {
  const bank = useApp((s) => s.bank)!;
  const est = useMemo(() => estimateAll(state, bank), [state, bank]);
  const total = totalEstimate(est);
  const target = state.profile.targetTotal;
  const base = SCORE_ORDER.reduce((s, k) => s + state.profile.baseline[k], 0);
  const delta = total - base;
  const gap = target - total;
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
        <span className="td-score-of num">/ {target}</span>
        {delta !== 0 && (
          <Badge tone={delta > 0 ? 'success' : 'danger'} icon={delta > 0 ? 'trending' : undefined}>
            {delta > 0 ? '+' : ''}
            {delta} 较起点
          </Badge>
        )}
      </div>
      <div className="td-score-gap">{gap > 0 ? `离目标还差 ${gap} 分` : '已达到目标线，保持住'}</div>
      <ul className="td-subj">
        {SCORE_ORDER.map((s) => {
          const e = est[s];
          const max = SCALE_MAX[s];
          return (
            <li key={s} className={cx('td-subj-row', `tone-${s}`)}>
              <span className="td-subj-name">
                <SubjectDot subject={s} />
                {SUBJECT_NAME[s]}
              </span>
              <span className="td-subj-bar" title={`估计 ${e.estimate}（${e.low}–${e.high}），目标 ${e.target}`}>
                <span className="td-subj-fill" style={{ width: `${Math.min(100, (e.estimate / max) * 100)}%` }} />
                <span className="td-subj-target" style={{ left: `${Math.min(100, (e.target / max) * 100)}%` }} />
              </span>
              <span className="td-subj-val num">
                {e.estimate}
                <span>/{e.target}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DueCard({ state, bank, today }: Ctx) {
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
    <a className={cx('td-due-row', `tone-${tone}`, !value && 'is-empty')} href={href(to)}>
      <span className="td-due-icon">
        <Icon name={value ? icon : 'check'} size={17} />
      </span>
      <span className="td-due-text">
        <span className="td-label">{label}</span>
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

function MockCard({ state, bank, today }: Ctx) {
  const schedule = useMemo(() => mockSchedule(state, bank), [state, bank]);
  // Same rule as the planner: a mock missed yesterday moves to today.
  const next = schedule.find((m) => m.date >= addDays(today, -1) && m.parts.some((p) => !p.done));
  const done = state.mocks.length;
  if (!next) {
    const missed = schedule.some((m) => m.parts.some((p) => !p.done));
    const doneText = done ? `已完成 ${done} 次模考` : '';
    let text: string;
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
  const n = daysBetween(today, next.date);
  return (
    <a className="card td-mock" href={href('/mock')}>
      <div className="td-card-head">
        <h3 className="td-h3">下次模考</h3>
        <span className={cx('td-mock-when', n <= 1 && 'is-soon')}>{n < 0 ? '今天补做' : n === 0 ? '今天' : n === 1 ? '明天' : `${n} 天后`}</span>
      </div>
      <div className="td-mock-title">{next.title}</div>
      <div className="td-mock-date">
        <Icon name="calendar" size={14} />
        {fmtDateShort(next.date)} {weekdayZh(next.date)}
      </div>
      <ul className="td-mock-parts">
        {next.parts.map((p) => (
          <li key={p.kind + p.session} className={cx(p.done && 'is-done')}>
            <Icon name={p.done ? 'checkCircle' : 'file'} size={14} />
            <span>{MOCK_LABEL[p.kind]}</span>
            <span className="faint">{sessionLabel(p.session)}</span>
          </li>
        ))}
      </ul>
    </a>
  );
}
