// Today's lead card: the next step (or the session left mid-way), the day-done card, and the
// quieter cards for a skipped day, a rest day and a locked mock correction.
import { useMemo, useState, type ReactNode } from 'react';
import { navigate } from '../../lib/router.ts';
import { update } from '../../lib/store.ts';
import { Button, IconTile, Meta, Progress, StatTile, toast } from '../../components/ui.tsx';
import { Icon, SUBJECT_ICON, type IconName } from '../../components/Icon.tsx';
import type { AppState, PlanBlock, PracticeSession, Subject } from '@shared/types.ts';
import { markBlock } from '@shared/actions.ts';
import type { BankIndex } from '@shared/bank.ts';
import { POOLS, buildDayPlan, daysLeftOn, extraBlock, type Pool } from '@shared/planner.ts';
import { streak } from '@shared/stats.ts';
import { addDays } from '@shared/dates.ts';
import { cx, fmtMinutes, pct } from '../../lib/format.ts';
import {
  blockCount,
  blockIcon,
  blockReason,
  blockTone,
  blockView,
  countLabel,
  displayTitle,
  finishBlockManually,
  fmtLimit,
  openSessionFor,
  restoreBlock,
  sessionAnswered,
  timedLimitSec,
} from './blocks.ts';

interface Ctx {
  state: AppState;
  bank: BankIndex;
  today: string;
}

/** "限时 11 分钟 · 含订正约 14 分钟": the clock of a timed set vs. the time the block takes with its correction. */
export function timedText(limit: number, minutes: number): string {
  const clock = fmtLimit(limit);
  const total = fmtMinutes(minutes);
  if (minutes - limit / 60 >= 1) return `限时 ${clock} · 含订正约 ${total}`;
  return clock !== total ? `限时 ${clock} · 约 ${total}` : `限时 ${clock}`;
}

/** 跟学模式 launcher shown in the hero: one button walks through the rest of the day in order. */
export interface FlowLaunch {
  label: string;
  desc: string;
  remaining: number;
  onStart: () => void;
}

/** Tonight's finishing time, shown in the hero's top line within 90 minutes of it (from D-10). */
export interface BedLine {
  clock: string;
  /** Minutes left; ≤ 0 once it has passed. */
  toGo: number;
}

function BedNote({ bed }: { bed: BedLine }) {
  return (
    <span className={cx('td-hero-bed', bed.toGo <= 0 && 'is-late')}>
      <Icon name="moon" size={14} />
      {bed.toGo > 0 ? (
        <span>
          <b className="num">{bed.clock}</b> 收工 · 还有 <b className="num">{bed.toGo}</b> 分钟
        </span>
      ) : (
        <span>
          已过 <b className="num">{bed.clock}</b> 收工时间
        </span>
      )}
    </span>
  );
}

export function NextHero({
  state,
  bank,
  today,
  session,
  block,
  index,
  total,
  flow,
  bed,
  onStart,
}: Ctx & { session?: PracticeSession; block?: PlanBlock; index: number; total: number; flow?: FlowLaunch; bed?: BedLine; onStart: (b: PlanBlock) => void }) {
  const tone = block ? blockTone(block) : session?.kind === 'mock' ? 'primary' : (session?.subject ?? 'mixed');
  const icon: IconName = block ? blockIcon(block) : session?.kind === 'mock' ? 'target' : session?.kind === 'review' ? 'refresh' : SUBJECT_ICON[session?.subject ?? 'mixed'];
  const view = block ? blockView(state, block) : 'active';
  const open = session ?? (block && view === 'active' ? openSessionFor(state, block.id) : undefined);
  const isMock = block?.kind === 'mock' || session?.kind === 'mock';
  const manual = block && view === 'active' && !open && (block.kind === 'vocab' || block.kind === 'notes' || block.kind === 'traps');
  const count = block ? blockCount(state, bank, block, today) : null;
  const limit = block ? timedLimitSec(bank, block) : null;

  const title = block ? displayTitle(state, bank, block, today) : (session?.title ?? '');
  let eyebrow = '下一步';
  let reason: ReactNode = block ? blockReason(state, bank, block, today) : undefined;
  let primary = isMock ? '开始模考' : '开始';
  let answered = 0;
  let remainMin: number | null = null;

  if (open) {
    answered = sessionAnswered(open);
    eyebrow = '继续上次';
    primary = '继续';
    remainMin = open.timeLimitSec ? Math.ceil(Math.max(0, open.timeLimitSec - open.elapsedSec) / 60) : null;
    if (!block) reason = '上次停在这里，接着做完就好。';
  } else if (manual) {
    eyebrow = '进行中';
    primary = block.kind === 'vocab' ? '继续背词' : block.kind === 'traps' ? '继续看' : '继续看笔记';
    reason =
      block.kind === 'vocab'
        ? '这一轮做完会自动打勾；想先停在这里，点「已完成」进入下一项。'
        : block.kind === 'traps'
          ? '把这一页易错点过一遍，看完点「已完成」。'
          : '看完公式和易错点后，回来点「已完成」进入下一项。';
  }

  // Meta: time and size only (the kind is already the title or the icon). A session under way shows
  // its progress instead; the time studied today is the progress card's line, not repeated here.
  const meta: ReactNode[] = [];
  if (open) {
    if (remainMin !== null) meta.push(<span key="t">计时还剩 {remainMin} 分钟</span>);
  } else if (block) meta.push(<span key="t">{limit ? timedText(limit, block.minutes) : `约 ${fmtMinutes(block.minutes)}`}</span>);
  if (!open && block && count !== null) meta.push(<span key="n">{countLabel(block, count)}</span>);
  if (isMock) meta.push(<span key="m">整卷限时 · 交卷后估分</span>);
  else if (block?.timed && !limit && !open) meta.push(<span key="m">限时 · 做完统一看解析</span>);

  const go = () => {
    if (open && !block) return navigate('/session/' + open.id);
    if (block) onStart(block);
  };
  // With nothing under way, the hero's main button starts 跟学 and this task can still be done alone.
  const launch = !open && !manual && flow ? flow : undefined;
  const metaNode = meta.length > 0 ? <Meta className="td-hero-meta">{meta}</Meta> : null;

  const progress =
    open && answered > 0 ? (
      <div className="td-hero-progress">
        <Progress value={answered / Math.max(1, open.itemIds.length)} size="sm" />
        <span className="num">
          已做 {answered}/{open.itemIds.length}
        </span>
        {metaNode}
      </div>
    ) : null;

  return (
    <section className="card card-hero td-hero">
      <div className="td-hero-top">
        <span className="td-hero-eyebrow">
          <span className="td-hero-dot" />
          {eyebrow}
        </span>
        {bed ? (
          <BedNote bed={bed} />
        ) : (
          block &&
          index >= 0 && (
            <span className="td-hero-step">
              第 {index + 1} 项 · 共 {total} 项
            </span>
          )
        )}
      </div>
      <div className="td-hero-main">
        <IconTile icon={icon} tone={tone} size="lg" />
        <div className="td-hero-text">
          <h2 className="td-hero-title">{title}</h2>
          {reason && <p className="td-hero-reason">{reason}</p>}
          {launch && metaNode}
        </div>
      </div>
      <div className={cx('td-hero-foot', launch && 'has-flow')}>
        {launch ? (
          <div className="td-hero-flow">
            <span className="td-hero-flow-title">跟学模式</span>
            <span className="td-hero-flow-desc">{launch.desc}</span>
          </div>
        ) : (
          (progress ?? metaNode)
        )}
        <div className="td-hero-actions">
          {launch ? (
            <>
              <Button variant="ghost" className="td-hero-solo" onClick={go}>
                {isMock ? '只做这场模考' : '只做这一项'}
              </Button>
              <Button variant="primary" size="lg" iconRight="arrowRight" onClick={launch.onStart} autoFocus>
                {launch.label}
              </Button>
            </>
          ) : (
            <>
              {manual && (
                <Button variant="secondary" size="lg" icon="check" onClick={() => finishBlockManually(block.id)}>
                  已完成
                </Button>
              )}
              {open && flow && flow.remaining > 1 && (
                <Button variant="ghost" size="lg" icon="play" onClick={flow.onStart}>
                  跟学剩下的
                </Button>
              )}
              <Button variant="primary" size="lg" iconRight="arrowRight" onClick={go} autoFocus>
                {primary}
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Extra practice ───

const POOL_ICON: Record<Pool, IconName> = { math: 'sigma', physics: 'atom', chemistry: 'flask', 'ja-reading': 'book', 'ja-listening': 'headphones', 'ja-grammar': 'book', recall: 'zap' };
const POOL_TONE: Record<Pool, Subject | 'mixed'> = { math: 'math', physics: 'physics', chemistry: 'chemistry', 'ja-reading': 'japanese', 'ja-listening': 'japanese', 'ja-grammar': 'japanese', recall: 'mixed' };

export function addExtra(pool: Pool) {
  const b = update((d, bk, t) => {
    const x = extraBlock(d, bk, t, pool);
    if (x && d.plans[t]) d.plans[t].blocks.push(x);
    return x;
  });
  if (b) toast(`已加入：${b.title}`, 'success');
  else toast('这个方向暂时没有新题了，换一个试试', 'warning');
}

/** The 加练 pools as a 3×2 grid. Each shows what it would add; pools without fresh items are disabled. */
function ExtraGrid({ state, bank, today }: Ctx) {
  // extraBlock is pure (it only reads the state), so it doubles as a preview.
  const options = useMemo(() => POOLS.map((p) => ({ ...p, preview: extraBlock(state, bank, today, p.id) })), [state, bank, today]);
  const any = options.some((o) => o.preview);
  return any ? (
    <div className="td-extra-grid">
      {options.map((o) => (
        <button key={o.id} type="button" className="td-extra-btn" onClick={() => addExtra(o.id)} disabled={!o.preview}>
          <IconTile icon={POOL_ICON[o.id]} tone={o.preview ? POOL_TONE[o.id] : 'neutral'} size="md" />
          <span className="td-extra-text">
            <span className="td-extra-name">{o.name}</span>
            <span className="td-extra-sub">{o.preview ? `${o.preview.itemIds.length} 题 · ${fmtMinutes(o.preview.minutes)}` : '暂无新题'}</span>
          </span>
          {o.preview && <Icon name="plus" size={15} className="td-extra-plus" />}
        </button>
      ))}
    </div>
  ) : (
    <div className="td-extra-none">
      <span>题库里能加练的新题这几天都做过了。</span>
      <Button variant="ghost" size="sm" icon="alert" onClick={() => navigate('/mistakes')}>
        去错题本
      </Button>
      <Button variant="ghost" size="sm" icon="book" onClick={() => navigate('/practice')}>
        题库自由练习
      </Button>
    </div>
  );
}

/** "加练" picker behind a quiet toggle. */
function ExtraChooser({ state, bank, today, label, defaultOpen = false }: Ctx & { label: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cx('td-extra', open && 'is-open')}>
      <button type="button" className="td-extra-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="plus" size={15} />
        {label}
        <Icon name={open ? 'up' : 'down'} size={14} className="td-extra-chev" />
      </button>
      {open && <ExtraGrid state={state} bank={bank} today={today} />}
    </div>
  );
}

export function restoreAll(ids: string[]) {
  update((d) => ids.forEach((id) => markBlock(d, id, 'todo')));
  toast(ids.length > 1 ? `已恢复 ${ids.length} 项` : '已恢复', 'success');
}

/** A one-line preview of tomorrow's plan ("明天：数学 · 数列 + 日语听解"). */
function useTomorrow(state: AppState, bank: BankIndex, today: string): string | null {
  return useMemo(() => {
    const date = addDays(today, 1);
    const left = daysLeftOn(state, date);
    if (left <= 0) return null;
    if (left === 1) return '明天是考前最后一天，量会减下来';
    try {
      const plan = state.plans[date] ?? buildDayPlan(state, bank, date);
      if (!plan.blocks.length) return '明天是休息日';
      const main = plan.blocks.filter((b) => b.kind !== 'review' && b.kind !== 'vocab').slice(0, 2);
      if (!main.length) return null;
      return `明天：${main.map((b) => displayTitle(state, bank, b, date)).join(' + ')}`;
    } catch {
      return null;
    }
  }, [state, bank, today]);
}

/** A duration as a stat value: "45 分钟", "4 小时 1 分" (numerals large, units small). */
function Duration({ minutes }: { minutes: number }) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return <>{r}<span className="stat-tile-unit">分钟</span></>;
  return (
    <>
      {h}
      <span className="stat-tile-unit">小时</span>
      {r > 0 && (
        <>
          {r}
          <span className="stat-tile-unit">分</span>
        </>
      )}
    </>
  );
}

/** The finished day: the H1 already says so; the card shows the result and what comes tomorrow. */
export function DoneHero({ state, bank, today, skipped, done, night }: Ctx & { skipped: string[]; done: number; night: boolean }) {
  const day = state.days[today];
  const answered = day?.answered ?? 0;
  const studied = (day?.seconds ?? 0) / 60;
  const st = streak(state, today);
  const tomorrow = useTomorrow(state, bank, today);
  return (
    <section className="card card-hero td-hero td-done">
      <div className="td-hero-top">
        <span className="td-hero-eyebrow">
          <Icon name="checkCircle" size={15} className="td-done-mark" />
          {night ? '今日小结 · 早点睡' : '今日小结'}
        </span>
        {skipped.length > 0 && (
          <Button variant="ghost" size="sm" icon="undo" onClick={() => restoreAll(skipped)}>
            恢复跳过的 {skipped.length} 项
          </Button>
        )}
      </div>
      <div className="td-done-stats">
        <StatTile boxed label="完成" value={done} unit="项" sub={skipped.length > 0 ? `跳过 ${skipped.length} 项` : undefined} />
        {studied >= 1 && <StatTile boxed label="学习" value={<Duration minutes={studied} />} />}
        {answered > 0 && <StatTile boxed label="做题" value={answered} unit="题" sub={`正确率 ${pct((day?.correct ?? 0) / answered)}`} />}
        {st > 0 && <StatTile boxed label="连续学习" value={st} unit="天" />}
      </div>
      {tomorrow && (
        <p className="td-done-next">
          <Icon name="calendar" size={14} />
          {tomorrow}
        </p>
      )}
      {!night && <ExtraChooser state={state} bank={bank} today={today} label="还有精力？加练一项" />}
    </section>
  );
}

/** Every block skipped and none done: say so plainly, and offer the way back (or one extra task). */
export function SkippedHero({ state, bank, today, skipped, night }: Ctx & { skipped: string[]; night: boolean }) {
  const studied = (state.days[today]?.seconds ?? 0) / 60;
  const [extra, setExtra] = useState(false);
  return (
    <section className="card card-hero td-hero td-skipped">
      <div className="td-hero-main">
        <IconTile icon="skip" tone="neutral" size="lg" />
        <div className="td-hero-text">
          <h2 className="td-hero-title">今天的任务都跳过了</h2>
          <p className="td-hero-reason">
            {studied >= 1 ? `今天学了 ${fmtMinutes(studied)}。` : ''}
            {night ? '睡个好觉，明天的计划会重新排好。' : '休息也是计划的一部分。想学一点的话，随时可以恢复。'}
          </p>
        </div>
      </div>
      <div className="td-hero-foot">
        <div className="td-hero-actions">
          {!night && (
            <Button variant="secondary" size="lg" icon="plus" aria-expanded={extra} onClick={() => setExtra((o) => !o)}>
              只加练一项
            </Button>
          )}
          <Button variant={night ? 'secondary' : 'primary'} size="lg" icon="undo" onClick={() => restoreAll(skipped)}>
            全部恢复
          </Button>
        </div>
      </div>
      {extra && !night && (
        <div className="td-extra is-open">
          <ExtraGrid state={state} bank={bank} today={today} />
        </div>
      )}
    </section>
  );
}

export function RestHero({ state, bank, today, onAdjust, night }: Ctx & { onAdjust: () => void; night: boolean }) {
  return (
    <section className="card card-hero td-hero">
      <div className="td-hero-main">
        <IconTile icon="coffee" tone="neutral" size="lg" />
        <div className="td-hero-text">
          <h2 className="td-hero-title">好好休息，状态比时长更重要</h2>
          <p className="td-hero-reason">今天没有安排任务。想学一点的话，可以加练一项。</p>
        </div>
        <Button variant="secondary" icon="clock" onClick={onAdjust} className="td-hero-side">
          改成学习日
        </Button>
      </div>
      {!night && <ExtraChooser state={state} bank={bank} today={today} label="加练一项" />}
    </section>
  );
}

export function WaitingHero({ skippedMock }: { skippedMock?: PlanBlock }) {
  return (
    <section className="card card-hero td-hero">
      <div className="td-hero-main">
        <IconTile icon="target" tone="primary" size="lg" />
        <div className="td-hero-text">
          <h2 className="td-hero-title">{skippedMock ? '模考跳过了，订正暂时锁定' : '先完成今天的模考'}</h2>
          <p className="td-hero-reason">剩下的订正会在模考交卷后解锁。</p>
        </div>
        {skippedMock && (
          <Button variant="secondary" icon="undo" onClick={() => restoreBlock(skippedMock.id)} className="td-hero-side">
            恢复模考
          </Button>
        )}
      </div>
    </section>
  );
}

export function StaleNotice({ session }: { session: PracticeSession }) {
  const answered = sessionAnswered(session);
  return (
    <div className="td-stale">
      <Icon name="clock" size={16} />
      <span className="td-stale-text">
        上次的「{session.title}」还没做完
        <span className="td-stale-meta num">
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
