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
import { Button, Callout, Empty, IconTile, Kbd, Meta, Progress, SubjectTag, toast } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import { RichText } from '../../components/RichText.tsx';
import {
  blockCount,
  blockIcon,
  blockReason,
  blockTone,
  blockView,
  countLabel,
  displayTitle,
  openSessionFor,
  runBlock,
  sessionAnswered,
  timedLimitSec,
  type BlockView,
} from '../today/blocks.ts';
import { restoreAll, timedText } from '../today/hero.tsx';
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
  const done = counted.filter((b) => views.get(b.id) === 'done').length;
  const next = ordered.find((b) => views.get(b.id) === 'active') ?? ordered.find((b) => views.get(b.id) === 'todo');
  const studied = Math.round((state.days[today]?.seconds ?? 0) / 60);
  const planned = counted.reduce((s, b) => s + b.minutes, 0);
  const warmup = !!memo && !memo.warmupDone && topics.length > 0;
  const stepNo = next ? counted.indexOf(next) + 1 : counted.length;
  const current = warmup ? null : (next?.id ?? null);

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
          {counted.length > 0 && (
            <span className="fl-top-count">
              完成 <b className="num">{done}</b>
              <span className="num">/{counted.length}</span> 项
            </span>
          )}
        </div>
        {counted.length > 0 && (
          <div className="fl-steps" aria-hidden>
            {counted.map((b) => {
              const v = views.get(b.id);
              return <span key={b.id} className={cx(v === 'done' && 'is-done', b.id === current && 'is-current')} />;
            })}
          </div>
        )}
        <div className="fl-top-right">
          <span className="fl-top-time">
            已学 <b>{fmtMinutes(studied)}</b>
            {planned > 0 && <span className="fl-top-plan"> / 计划 {fmtMinutes(planned)}</span>}
          </span>
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

function Warmup({ topics, index, today, blocks }: { topics: string[]; index: number; today: string; blocks: PlanBlock[] }) {
  const { bank } = useReady();
  const topic = topics[index];
  const note = bank.notesByTopic.get(topic);
  const info = bank.topics.get(topic);
  const since = useRef(Date.now());
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    since.current = Date.now();
    top.current?.scrollIntoView({ block: 'start' });
  }, [topic]);

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
    <section className="card card-hero fl-card" ref={top}>
      <div className="fl-eyebrow">
        <span>先复习今天要用的考点</span>
        <span className="fl-dots" aria-label={`第 ${index + 1} 个，共 ${topics.length} 个`}>
          {topics.map((t, i) => (
            <span key={t} className={cx(i < index && 'is-done', i === index && 'is-current')} />
          ))}
          <span className="fl-dots-num num">
            {index + 1}/{topics.length}
          </span>
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
      <p className="fl-lead">今天的练习会用到这个考点。花 1–2 分钟把公式和易错点过一遍，再开始做题。</p>
      <div className="fl-note">
        {note ? <RichText text={note.body} lang="zh" /> : <p className="fl-note-none">这个考点的笔记还没写好，直接开始练习也可以。</p>}
        {note?.terms && note.terms.length > 0 && (
          <div className="fl-terms">
            {note.terms.slice(0, 10).map((t) => (
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
  const meta: ReactNode[] = [<span key="t">{limit ? timedText(limit, block.minutes) : `约 ${fmtMinutes(block.minutes)}`}</span>];
  if (n !== null && n > 0) meta.push(<span key="n">{countLabel(block, n)}</span>);
  if (isMock) meta.push(<span key="m">整卷限时 · 交卷后估分</span>);
  else if (block.timed && !limit) meta.push(<span key="m">限时 · 做完统一看解析</span>);

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
          <h1 className="fl-title">{displayTitle(state, bank, block, today)}</h1>
          <p className="fl-lead">{blockReason(state, bank, block, today)}</p>
          {open && answered > 0 && (
            <div className="fl-progress">
              <Progress value={answered / Math.max(1, open.itemIds.length)} size="sm" />
              <span className="num">
                已做 {answered}/{open.itemIds.length}
              </span>
            </div>
          )}
          <Meta className="fl-meta">{meta}</Meta>
        </div>
      </div>
      {isMock && !resume && (
        <Callout icon="target" className="fl-callout">
          整卷模考：限时，中途不显示对错。找个安静的地方，准备好草稿纸再开始。
        </Callout>
      )}

      {resting && (
        <div className="fl-break" role="timer" aria-label={`休息还剩 ${fmtClock(restLeft)}`}>
          <IconTile icon="coffee" size="md" />
          <div className="fl-break-text">
            <span className="fl-break-title">休息一下</span>
            <span className="fl-break-sub">起来走走、喝口水、看看远处</span>
          </div>
          <span className="fl-break-clock num">{fmtClock(restLeft)}</span>
        </div>
      )}

      <Actions
        left={
          <>
            <Button variant="ghost" icon="skip" onClick={() => skipWithUndo(block.id)}>
              跳过这一项
            </Button>
            {!resting && lastDone && (
              <Button variant="ghost" icon="coffee" onClick={() => setBreakEnds(Date.now() + 5 * 60 * 1000)}>
                休息 5 分钟
              </Button>
            )}
          </>
        }
      >
        <EnterButton label={resume ? '继续这一项' : resting ? '提前结束休息' : isMock ? '开始模考计时' : '开始'} onClick={go} />
      </Actions>
    </section>
  );
}

// ───────────────────────── Done ─────────────────────────

function AllDone({ done, skipped, onExit }: { done: number; skipped: string[]; onExit: () => void }) {
  const { state, today } = useReady();
  const day = state.days[today];
  if (done === 0 && skipped.length > 0) {
    const studied = (day?.seconds ?? 0) / 60;
    return (
      <section className="card card-hero fl-card fl-finish">
        <IconTile icon="skip" tone="neutral" size="lg" className="fl-finish-icon" />
        <h1 className="fl-title">今天的任务都跳过了</h1>
        <p className="fl-finish-note">
          {studied >= 1 ? `今天学了 ${fmtMinutes(studied)}。` : ''}状态不好就早点休息；想学一点的话，恢复几项再开始。
        </p>
        <div className="fl-finish-actions">
          <Button variant="secondary" size="lg" onClick={onExit}>
            回到今日
          </Button>
          <Button variant="primary" size="lg" icon="undo" onClick={() => restoreAll(skipped)}>
            全部恢复
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
      <Meta className="fl-finish-stats">
        <span>完成 {done} 项</span>
        <span>{fmtMinutes((day?.seconds ?? 0) / 60)}</span>
        {answered > 0 && <span>{answered} 题</span>}
        {answered > 0 && <span>正确率 {pct((day?.correct ?? 0) / answered)}</span>}
      </Meta>
      <p className="fl-finish-note">睡前不用再刷新题，明天的计划会根据今天的表现自动调整。</p>
      <div className="fl-finish-actions">
        <Button variant="secondary" size="lg" icon="plus" onClick={add}>
          还有精力？加练一项
        </Button>
        <Button variant="primary" size="lg" iconRight="arrowRight" onClick={onExit}>
          回到今日
        </Button>
      </div>
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
  warmup,
  warmupCount,
  warmupActive,
}: {
  ordered: PlanBlock[];
  views: Map<string, BlockView>;
  current: string | null;
  done: number;
  total: number;
  warmup: boolean;
  warmupCount: number;
  warmupActive: boolean;
}) {
  const { state, bank, today } = useReady();
  return (
    <aside className="card fl-queue">
      <header className="fl-queue-head">
        <h2 className="fl-queue-title">今天的顺序</h2>
        <span className="fl-queue-count num">
          {done}/{total}
        </span>
      </header>
      <ol className="fl-q-list">
        {warmup && warmupCount > 0 && (
          <li className={cx('fl-q', warmupActive ? 'is-current' : 'is-done')}>
            <IconTile icon={warmupActive ? 'notebook' : 'check'} tone={warmupActive ? 'primary' : 'success'} />
            <span className="fl-q-text">复习考点</span>
            <span className="fl-q-min num">{warmupCount} 个</span>
          </li>
        )}
        {ordered.map((b) => {
          const v = views.get(b.id);
          const icon = v === 'done' ? 'check' : v === 'skipped' ? 'skip' : v === 'locked' ? 'lock' : blockIcon(b);
          const tone = v === 'done' ? 'success' : v === 'skipped' || v === 'locked' ? 'neutral' : blockTone(b);
          return (
            <li key={b.id} className={cx('fl-q', b.id === current && 'is-current', v && `is-${v}`)}>
              <IconTile icon={icon} tone={tone} />
              <span className="fl-q-text">{displayTitle(state, bank, b, today)}</span>
              <span className="fl-q-min num">{v === 'skipped' ? '已跳过' : fmtMinutes(b.minutes)}</span>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
