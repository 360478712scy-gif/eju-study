// 跟学模式: walk through all of today's work in a learning-science order with one button.
// 1) review the key notes for today's topics, 2) retrieval warm-up (recall checks, due mistakes),
// 3) mocks / interleaved subject blocks, 4) grammar, trap sheet, vocabulary last.
// Finishing any block returns to "/", which renders this page while flow mode is on.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { PlanBlock } from '@shared/types.ts';
import { addStudyTime, markBlock } from '@shared/actions.ts';
import { extraBlock, POOLS, shortTopic } from '@shared/planner.ts';
import { useReady, update } from '../../lib/store.ts';
import { navigate } from '../../lib/router.ts';
import { cx, fmtClock, fmtMinutes, pct } from '../../lib/format.ts';
import { Button, Callout, Empty, IconTile, Kbd, Progress, Ring, StatTile, SubjectTag, toast, type Tone } from '../../components/ui.tsx';
import { Icon, type IconName } from '../../components/Icon.tsx';
import { RichText } from '../../components/RichText.tsx';
import { slashFractions } from '../notes/fractions.ts';
import {
  blockCount,
  blockIcon,
  blockReason,
  blockTone,
  blockView,
  displayTitle,
  fmtLimit,
  openSessionFor,
  runBlock,
  sessionAnswered,
  timedLimitSec,
  type BlockView,
} from '../today/blocks.ts';
import { restoreAll } from '../today/hero.tsx';
import { skipWithUndo } from '../today/PlanList.tsx';
import { flowMemo, flowOrder, onFlowChange, setWarmup, stopFlow, warmupTopics } from './flowState.ts';
import './flow.css';

function useFlowMemo(today: string) {
  return useSyncExternalStore(onFlowChange, () => JSON.stringify(flowMemo(today)));
}

export function FlowPage() {
  const { state, bank, today } = useReady();
  const memoRaw = useFlowMemo(today);
  const memo = memoRaw === 'null' ? null : (JSON.parse(memoRaw) as { warmupDone: boolean; warmupIndex: number });
  const plan = state.plans[today];
  const blocks = plan?.blocks ?? [];
  const ordered = useMemo(() => flowOrder(blocks), [blocks]);
  const views = useMemo(() => new Map(ordered.map((b) => [b.id, blockView(state, b)])), [ordered, state]);
  const topics = useMemo(() => warmupTopics(state, bank, blocks), [state, bank, blocks]);

  const counted = ordered.filter((b) => views.get(b.id) !== 'skipped');
  const skippedN = ordered.length - counted.length;
  const done = counted.filter((b) => views.get(b.id) === 'done').length;
  const next = ordered.find((b) => views.get(b.id) === 'active') ?? ordered.find((b) => views.get(b.id) === 'todo');
  const studied = Math.round((state.days[today]?.seconds ?? 0) / 60);
  // The minutes of the tasks still counted, as Today's list and progress card say it.
  const planned = counted.reduce((s, b) => s + b.minutes, 0);
  const warmup = !!memo && !memo.warmupDone && topics.length > 0;
  const stepNo = next ? counted.indexOf(next) + 1 : counted.length;
  const current = warmup ? null : (next?.id ?? null);
  // Everything skipped: the bar still shows the day (all segments muted) instead of going blank.
  const segments = counted.length ? counted : ordered;

  const exit = () => {
    stopFlow();
    navigate('/', { force: true });
  };

  return (
    <div className="fl">
      <header className="fl-top">
        <div className="fl-top-left">
          <span className="fl-mode">
            <Icon name="play" size={15} />
            跟学模式
          </span>
          {counted.length > 0 ? (
            <span className="fl-top-count">
              完成 <b className="num">{done}</b>
              <span className="num">/{counted.length}</span> 项
            </span>
          ) : (
            skippedN > 0 && (
              <span className="fl-top-count">
                已跳过 <b className="num">{skippedN}</b> 项
              </span>
            )
          )}
        </div>
        {segments.length > 0 && (
          <div className="fl-steps" aria-hidden>
            {segments.map((b) => {
              const v = views.get(b.id);
              return <span key={b.id} className={cx(v === 'done' && 'is-done', v === 'skipped' && 'is-skipped', b.id === current && 'is-current')} />;
            })}
          </div>
        )}
        <div className="fl-top-right">
          {(studied >= 1 || planned > 0) && (
            <span className="fl-top-time">
              {studied >= 1 && (
                <>
                  已学 <b>{fmtMinutes(studied)}</b>
                </>
              )}
              {planned > 0 && (
                <span className="fl-top-plan">
                  {studied >= 1 ? ' / ' : ''}计划 {fmtMinutes(planned)}
                </span>
              )}
            </span>
          )}
          <Button variant="ghost" size="sm" icon="x" onClick={exit}>
            退出跟学
          </Button>
        </div>
      </header>

      <main className={cx('fl-main', !blocks.length && 'is-solo')}>
        <div className="fl-stage">
          {!plan || !blocks.length ? (
            <EmptyDay onExit={exit} />
          ) : warmup ? (
            <Warmup topics={topics} index={Math.min(memo!.warmupIndex, topics.length - 1)} today={today} blocks={blocks} />
          ) : next ? (
            <NextCard block={next} stepNo={stepNo} total={counted.length} lastDone={lastFinished(ordered, views)} />
          ) : (
            <AllDone done={done} skipped={ordered.filter((b) => views.get(b.id) === 'skipped').map((b) => b.id)} onExit={exit} />
          )}
        </div>

        {blocks.length > 0 && (
          <Queue
            ordered={ordered}
            views={views}
            current={current}
            done={done}
            total={counted.length}
            skipped={skippedN}
            warmup={warmup || !!memo?.warmupDone}
            warmupCount={topics.length}
            warmupActive={warmup}
          />
        )}
      </main>
    </div>
  );
}

function lastFinished(ordered: PlanBlock[], views: Map<string, BlockView>): PlanBlock | null {
  const doneBlocks = ordered.filter((b) => views.get(b.id) === 'done' && b.doneAt);
  if (!doneBlocks.length) return null;
  const last = doneBlocks.reduce((a, b) => ((a.doneAt || '') > (b.doneAt || '') ? a : b));
  return Date.now() - new Date(last.doneAt!).getTime() < 10 * 60 * 1000 ? last : null;
}

/** Primary action on Enter (outside inputs, not while composing Japanese). */
function useEnter(fn: () => void, enabled = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.isComposing || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest('input, textarea, select, [contenteditable="true"]') || t.closest('.modal'))) return;
      e.preventDefault();
      ref.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

/** The card's sticky footer: quiet actions on the left, the one Enter action on the right. */
function Actions({ left, children }: { left?: ReactNode; children: ReactNode }) {
  return (
    <footer className="fl-actions">
      <div className="fl-actions-left">{left}</div>
      {children}
    </footer>
  );
}

function EnterButton({ label, onClick }: { label: ReactNode; onClick: () => void }) {
  return (
    <Button variant="primary" size="lg" className="fl-go" onClick={onClick}>
      {label}
      <Kbd>Enter</Kbd>
    </Button>
  );
}

// ───────────────────────── Step 1: review notes ─────────────────────────

interface NoteSection {
  title: string;
  body: string;
}

/** The note's "**标题**" sections (as the 考点笔记 page splits them), with inline fractions as a/b. */
function noteSections(body: string): NoteSection[] {
  const chunks = slashFractions(body).replace(/\r\n?/g, '\n').trim().split(/\n[ \t]*\n/);
  const out: NoteSection[] = [];
  for (const chunk of chunks) {
    const head = /^\*\*([^*\n]+)\*\*$/.exec(chunk.trim());
    if (head) out.push({ title: head[1].trim(), body: '' });
    else if (out.length) out[out.length - 1].body += (out[out.length - 1].body ? '\n\n' : '') + chunk;
    else out.push({ title: '', body: chunk });
  }
  return out.filter((x) => x.title || x.body.trim());
}

const CORE_SECTION = /核心|公式|要点|结论/;
const TRAP_SECTION = /易错|陷阱|注意/;

function sectionLook(title: string, tone: Tone): { icon: IconName; tone: Tone } {
  if (TRAP_SECTION.test(title)) return { icon: 'alert', tone: 'warning' };
  if (/怎么考|考法|题型|出题/.test(title)) return { icon: 'target', tone };
  if (/自检|自测/.test(title)) return { icon: 'checkCircle', tone: 'success' };
  return { icon: 'bulb', tone };
}

function Warmup({ topics, index, today, blocks }: { topics: string[]; index: number; today: string; blocks: PlanBlock[] }) {
  const { bank } = useReady();
  const topic = topics[index];
  const note = bank.notesByTopic.get(topic);
  const info = bank.topics.get(topic);
  const since = useRef(Date.now());
  const top = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    since.current = Date.now();
    setFull(false);
    top.current?.scrollIntoView({ block: 'start' });
  }, [topic]);

  // A 1–2 minute review: the formulas and the traps; the rest of the note one click away.
  const sections = useMemo(() => (note ? noteSections(note.body) : []), [note]);
  const key = sections.filter((x) => CORE_SECTION.test(x.title) || TRAP_SECTION.test(x.title));
  const brief = key.length ? key : sections.slice(0, 1);
  const shown = full ? sections : brief;
  const more = sections.length - brief.length + (note?.terms?.length ? 1 : 0);

  const credit = () => {
    const sec = Math.min(600, Math.round((Date.now() - since.current) / 1000));
    if (sec > 3) update((d) => addStudyTime(d, null, sec, today));
  };
  const finish = () => {
    credit();
    // The final-phase notes block is exactly this review: mark it done.
    const notesBlock = blocks.find((b) => b.kind === 'notes' && b.status !== 'done' && b.status !== 'skipped');
    if (notesBlock) update((d) => markBlock(d, notesBlock.id, 'done'));
    setWarmup(today, topics.length, true);
  };
  // Skipping the review only ends the warm-up; the 考点速记 task (if any) stays to do.
  const skip = () => {
    credit();
    setWarmup(today, topics.length, true);
  };
  const go = (i: number) => {
    credit();
    if (i >= topics.length) finish();
    else setWarmup(today, Math.max(0, i), false);
  };
  useEnter(() => go(index + 1));

  return (
    <section className="card card-hero fl-card fl-reader" ref={top}>
      <div className="fl-eyebrow">
        <span>先花 1–2 分钟，复习今天要用的考点</span>
        <span className="fl-dots-num num" aria-label={`第 ${index + 1} 个，共 ${topics.length} 个`}>
          {index + 1}/{topics.length}
        </span>
      </div>
      <div className="fl-title-row">
        {info && <SubjectTag subject={info.subject} />}
        <h1 className="fl-title">{shortTopic(bank, topic)}</h1>
        {info?.ja && (
          <span className="fl-ja" lang="ja">
            {info.ja}
          </span>
        )}
      </div>
      <div className="fl-note">
        {note ? (
          shown.map((x, i) => {
            const look = sectionLook(x.title, info?.subject ?? 'neutral');
            return (
              <section key={i} className="fl-sec">
                {x.title && (
                  <h3 className="fl-sec-title">
                    <Icon name={look.icon} size={16} className={`fl-sec-icon tone-${look.tone}`} />
                    {x.title}
                  </h3>
                )}
                <RichText text={x.body} lang="zh" className="fl-prose" />
              </section>
            );
          })
        ) : (
          <p className="fl-note-none">这个考点的笔记还没写好，直接开始练习也可以。</p>
        )}
        {full && note?.terms && note.terms.length > 0 && (
          <div className="fl-terms">
            {note.terms.slice(0, 12).map((t) => (
              <span key={t.ja} className="fl-term">
                <b lang="ja">{t.ja}</b>
                {t.kana && (
                  <span className="fl-term-kana" lang="ja">
                    {t.kana}
                  </span>
                )}
                <span className="fl-term-zh">{t.zh}</span>
              </span>
            ))}
          </div>
        )}
        {more > 0 && (
          <button type="button" className="fl-more" aria-expanded={full} onClick={() => setFull((f) => !f)}>
            {full ? '只看公式和易错点' : '看完整笔记'}
            {!full && <span className="fl-more-count">还有 {more} 节</span>}
            <Icon name={full ? 'up' : 'down'} size={14} />
          </button>
        )}
      </div>
      <Actions
        left={
          <>
            {index > 0 && (
              <Button variant="ghost" icon="arrowLeft" onClick={() => go(index - 1)}>
                上一个
              </Button>
            )}
            <Button variant="ghost" onClick={skip}>
              跳过复习
            </Button>
          </>
        }
      >
        <EnterButton label={index + 1 < topics.length ? '下一个考点' : '复习完了，开始做题'} onClick={() => go(index + 1)} />
      </Actions>
    </section>
  );
}

// ───────────────────────── Step 2+: the next block ─────────────────────────

/** A duration as a stat value: "45 分钟", "1 小时 8 分" (numerals large, units small). */
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

const BREAK_SEC = 5 * 60;

function NextCard({ block, stepNo, total, lastDone }: { block: PlanBlock; stepNo: number; total: number; lastDone: PlanBlock | null }) {
  const { state, bank, today } = useReady();
  const [breakEnds, setBreakEnds] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!breakEnds) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [breakEnds]);
  const resting = breakEnds !== null && now < breakEnds;
  const restLeft = breakEnds ? Math.max(0, Math.round((breakEnds - now) / 1000)) : 0;

  const open = openSessionFor(state, block.id);
  const resume = !!open || block.status === 'active';
  const n = blockCount(state, bank, block, today);
  const limit = timedLimitSec(bank, block);
  const answered = open ? sessionAnswered(open) : 0;
  const go = () => {
    setBreakEnds(null);
    runBlock(state, bank, block);
  };
  useEnter(go);

  const isMock = block.kind === 'mock';
  const title = displayTitle(state, bank, block, today);

  // The break owns the stage: a clock, one line, and the way out.
  if (resting) {
    return (
      <section className="card card-hero fl-card fl-break" role="timer" aria-label={`休息还剩 ${fmtClock(restLeft)}`}>
        <Ring value={restLeft / BREAK_SEC} size={176} stroke={6} tone="primary">
          <span className="fl-break-clock num">{fmtClock(restLeft)}</span>
          <span className="fl-break-of">共 5 分钟</span>
        </Ring>
        <h1 className="fl-title">休息一下</h1>
        <p className="fl-lead">起来走走、喝口水、看看远处。接下来是「{title}」。</p>
        <div className="fl-break-actions">
          <EnterButton label="提前结束休息" onClick={go} />
        </div>
      </section>
    );
  }

  const unit = block.kind === 'vocab' ? '张卡' : block.kind === 'notes' ? '个考点' : '题';
  const r = lastDone?.result;
  return (
    <section className="card card-hero fl-card">
      {lastDone && (
        <div className="fl-done-line">
          <Icon name="checkCircle" size={16} />
          <span className="fl-done-text">
            完成了「{displayTitle(state, bank, lastDone, today)}」
            {r && r.answered > 0 && (
              <span className="num">
                {' '}
                · 对 {r.correct}/{r.answered}
              </span>
            )}
          </span>
        </div>
      )}
      <div className="fl-eyebrow">
        <span>{resume ? '继续' : '下一步'}</span>
        <span className="num">
          第 {stepNo} 项 · 共 {total} 项
        </span>
      </div>
      <div className="fl-head">
        <IconTile icon={blockIcon(block)} tone={blockTone(block)} size="lg" />
        <div className="fl-head-text">
          <h1 className="fl-title">{title}</h1>
          <p className="fl-lead">{blockReason(state, bank, block, today)}</p>
        </div>
      </div>
      <div className="fl-facts">
        {limit ? (
          <StatTile
            boxed
            label="限时"
            value={fmtLimit(limit).replace(/\s*分钟$/, '')}
            unit={/分钟$/.test(fmtLimit(limit)) ? '分钟' : undefined}
            sub={block.minutes - limit / 60 >= 1 ? `含订正约 ${fmtMinutes(block.minutes)}` : undefined}
          />
        ) : (
          <StatTile boxed label={isMock ? '整卷限时' : '预计用时'} value={<Duration minutes={block.minutes} />} />
        )}
        {n !== null && n > 0 && <StatTile boxed label="数量" value={n} unit={unit} />}
        {open && answered > 0 ? (
          <div className="stat-tile is-boxed fl-fact-progress">
            <div className="stat-tile-label">已做</div>
            <div className="stat-tile-value">
              <span className="num">{answered}</span>
              <span className="stat-tile-unit">/ {open.itemIds.length}</span>
            </div>
            <Progress value={answered / Math.max(1, open.itemIds.length)} size="sm" />
          </div>
        ) : (
          <StatTile
            boxed
            label="方式"
            value={<span className="fl-fact-text">{isMock ? '交卷后估分' : block.timed ? '做完看解析' : block.kind === 'vocab' ? '先读音后意思' : block.kind === 'notes' || block.kind === 'traps' ? '看完点完成' : '每题即时判分'}</span>}
          />
        )}
      </div>
      {isMock && !resume && (
        <Callout icon="target" className="fl-callout">
          整卷模考：限时，中途不显示对错。找个安静的地方，准备好草稿纸再开始。
        </Callout>
      )}

      <Actions
        left={
          <>
            <Button variant="ghost" icon="skip" onClick={() => skipWithUndo(block.id)}>
              跳过这一项
            </Button>
            {lastDone && (
              <Button variant="ghost" icon="coffee" onClick={() => setBreakEnds(Date.now() + BREAK_SEC * 1000)}>
                休息 5 分钟
              </Button>
            )}
          </>
        }
      >
        <EnterButton label={resume ? '继续这一项' : isMock ? '开始模考计时' : '开始'} onClick={go} />
      </Actions>
    </section>
  );
}

// ───────────────────────── Done ─────────────────────────

function AllDone({ done, skipped, onExit }: { done: number; skipped: string[]; onExit: () => void }) {
  const { state, today } = useReady();
  const day = state.days[today];
  const studied = (day?.seconds ?? 0) / 60;
  if (done === 0 && skipped.length > 0) {
    return (
      <section className="card card-hero fl-card fl-finish">
        <IconTile icon="skip" tone="neutral" size="lg" className="fl-finish-icon" />
        <h1 className="fl-title">今天的任务都跳过了</h1>
        <p className="fl-finish-note">
          {studied >= 1 ? `今天学了 ${fmtMinutes(studied)}。` : ''}状态不好就早点休息；想学一点的话，恢复几项再开始。
        </p>
        <div className="fl-finish-actions">
          <Button variant="secondary" icon="undo" onClick={() => restoreAll(skipped)}>
            全部恢复
          </Button>
          <Button variant="primary" iconRight="arrowRight" onClick={onExit}>
            回到今日
          </Button>
        </div>
      </section>
    );
  }
  const answered = day?.answered ?? 0;
  const add = () => {
    for (const p of POOLS) {
      const b = update((d, bk, t) => {
        const x = extraBlock(d, bk, t, p.id);
        if (x && d.plans[t]) d.plans[t].blocks.push(x);
        return x;
      });
      if (b) {
        toast(`已加入：${b.title}`, 'success');
        return;
      }
    }
    toast('题库里能加练的题这几天都做过了，去错题本看看吧', 'warning');
  };
  return (
    <section className="card card-hero fl-card fl-finish">
      <IconTile icon="check" tone="success" size="lg" className="fl-finish-icon" />
      <h1 className="fl-title">今天收工了</h1>
      <p className="fl-finish-note">睡前不用再刷新题，明天的计划会根据今天的表现自动调整。</p>
      <div className="fl-finish-stats">
        <StatTile boxed label="完成" value={done} unit="项" />
        {studied >= 1 && <StatTile boxed label="学习" value={<Duration minutes={studied} />} />}
        {answered > 0 && <StatTile boxed label="做题" value={answered} unit="题" />}
        {answered > 0 && <StatTile boxed label="正确率" value={pct((day?.correct ?? 0) / answered)} />}
      </div>
      <div className="fl-finish-actions">
        <Button variant="primary" iconRight="arrowRight" onClick={onExit}>
          回到今日
        </Button>
      </div>
      <button type="button" className="fl-extra" onClick={add}>
        <Icon name="plus" size={14} />
        还有精力？加练一项
      </button>
    </section>
  );
}

function EmptyDay({ onExit }: { onExit: () => void }) {
  return (
    <section className="card card-hero fl-card">
      <Empty
        icon="coffee"
        title="今天没有安排任务"
        desc="今天是休息日，或者计划还没生成。回到今日页可以调整学习时长。"
        action={
          <Button variant="primary" onClick={onExit}>
            回到今日
          </Button>
        }
      />
    </section>
  );
}

// ───────────────────────── The path for today ─────────────────────────

function Queue({
  ordered,
  views,
  current,
  done,
  total,
  skipped,
  warmup,
  warmupCount,
  warmupActive,
}: {
  ordered: PlanBlock[];
  views: Map<string, BlockView>;
  current: string | null;
  done: number;
  total: number;
  skipped: number;
  warmup: boolean;
  warmupCount: number;
  warmupActive: boolean;
}) {
  const { state, bank, today } = useReady();
  return (
    <aside className="card fl-queue">
      <header className="fl-queue-head">
        <h2 className="fl-queue-title">今天的顺序</h2>
        <span className="fl-queue-count num">{total > 0 ? `${done}/${total}` : skipped > 0 ? `已跳过 ${skipped}` : ''}</span>
      </header>
      {/* Only the current row carries its colour; the rest stay neutral so it reads first. */}
      <ol className="fl-q-list">
        {warmup && warmupCount > 0 && (
          <li className={cx('fl-q', warmupActive ? 'is-current' : 'is-done')}>
            <IconTile icon={warmupActive ? 'notebook' : 'check'} tone={warmupActive ? 'primary' : 'neutral'} />
            <span className="fl-q-body">
              <span className="fl-q-text">复习考点</span>
              <span className="fl-q-min num">{warmupCount} 个</span>
            </span>
          </li>
        )}
        {ordered.map((b) => {
          const v = views.get(b.id);
          const isCurrent = b.id === current;
          const icon = v === 'done' ? 'check' : v === 'skipped' ? 'skip' : v === 'locked' ? 'lock' : blockIcon(b);
          return (
            <li key={b.id} className={cx('fl-q', isCurrent && 'is-current', v && `is-${v}`)}>
              <IconTile icon={icon} tone={isCurrent ? blockTone(b) : 'neutral'} />
              <span className="fl-q-body">
                <span className="fl-q-text">{displayTitle(state, bank, b, today)}</span>
                <span className="fl-q-min num">{v === 'skipped' ? '已跳过' : fmtMinutes(b.minutes)}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
