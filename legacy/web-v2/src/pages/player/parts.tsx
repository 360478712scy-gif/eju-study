// Smaller building blocks of the player screen.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { Confidence, Item, ItemProgress, SessionAnswer } from '@shared/types.ts';
import type { GradeResult } from '@shared/grading.ts';
import { toggleStar } from '@shared/actions.ts';
import { daysBetween } from '@shared/dates.ts';
import { MISTAKE_GRADUATE_BOX } from '@shared/srs.ts';
import { update, useApp } from '../../lib/store.ts';
import { Icon, type IconName } from '../../components/Icon.tsx';
import { Button, IconTile, Kbd, Modal, Tooltip } from '../../components/ui.tsx';
import { Explanation } from '../../components/question/Explanation.tsx';
import { Figures } from '../../components/question/Figures.tsx';
import { DifficultyMeter } from '../../components/question/DifficultyMeter.tsx';
import { RichText } from '../../components/RichText.tsx';
import { optionBadge, optionLabel } from '../../components/question/OptionList.tsx';
import { splitReadingStem } from '../../components/question/QuestionStem.tsx';
import { cx, fmtClock } from '../../lib/format.ts';
import { useClock, type StudyClock } from './clock.ts';
import { cellTitle, type StripCell } from './TopBar.tsx';

// ─── Stem layout ───

export const isRecall = (item: Item) => item.id.startsWith('recall-');
export const isGrammar = (item: Item) => item.subject === 'japanese' && item.topic.startsWith('ja.vocab');

/**
 * How to lay out the stem: reading passages split into 本文 + 设问 (the question goes to the side);
 * grammar items keep their one-line question under the sentence; short stems (recall checks,
 * grammar, one-liners) are answered in one centered column instead of a mostly empty split page.
 */
export function stemLayout(item: Item): { split: { passage: string; question: string } | null; inline: { passage: string; question: string } | null; short: boolean } {
  const parts = splitReadingStem(item);
  const grammar = isGrammar(item);
  const plain = item.stem.replace(/\\[a-zA-Z]+|[$_{}\\^]/g, '');
  const short =
    item.format === 'choice' &&
    !item.audio &&
    !item.figures?.length &&
    (isRecall(item) || grammar || (!parts && plain.length <= 110 && !/\n\s*\n[\s\S]*\n\s*\n/.test(item.stem)));
  if (grammar) return { split: null, inline: parts, short };
  return { split: parts, inline: null, short };
}

// ─── Action row of the single column ───

/**
 * 不会 / 提交 (or tools + 下一题) under a short item. On short windows it is sticky at the bottom while
 * its place is below the fold, with a soft fade over the content behind it once it is pinned.
 */
export function ActionRow({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = ref.current;
    const root = el?.closest('.pl-main');
    if (!el || !root || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([e]) => {
        const r = e.rootBounds;
        setStuck(e.intersectionRatio < 1 && !!r && e.boundingClientRect.bottom >= r.bottom - 1);
      },
      { root, threshold: [1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={cx('pl-single-row', stuck && 'is-stuck', className)}>
      {children}
    </div>
  );
}

// ─── Answer card: fade the cut edge while there is more to scroll ───

/**
 * Marks the scroller with `has-more` while content continues below its bottom edge, so a row cut by
 * the edge reads as "scroll for more" (a soft fade) instead of looking clipped.
 */
export function useScrollFade(ref: RefObject<HTMLElement | null>, key: unknown) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const check = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => el.classList.toggle('has-more', el.scrollTop + el.clientHeight < el.scrollHeight - 2));
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null;
    ro?.observe(el);
    const mo = new MutationObserver(check);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', check);
      ro?.disconnect();
      mo.disconnect();
    };
    // `key`: the scroller mounts again when the layout switches (single column ↔ two panes).
  }, [ref, key]);
}

// ─── Item header (source · topic · difficulty · target) ───

export function ItemHeader({ item, groupPos }: { item: Item; groupPos?: { n: number; of: number } }) {
  const topic = useApp((s) => s.bank?.topics.get(item.topic));
  const starred = useApp((s) => !!s.state?.progress[item.id]?.starred);
  return (
    <div className="pl-ihead">
      <div className="pl-ihead-main">
        <div className="pl-source">{item.source.label}</div>
        <div className="pl-ihead-meta">
          {topic && <span className="pl-meta">{topic.name}</span>}
          <span className="pl-meta">
            <DifficultyMeter value={item.difficulty} />
          </span>
          <span className="pl-meta">
            目标 <span className="num">{fmtClock(item.targetSec)}</span>
          </span>
          {groupPos && groupPos.of > 1 && (
            <span className="pl-meta">
              同一篇 · 第 {groupPos.n} / {groupPos.of} 问
            </span>
          )}
        </div>
      </div>
      <Tooltip label={starred ? '取消收藏' : '收藏这题'} side="bottom">
        <button type="button" className={cx('pl-star', starred && 'is-on')} onClick={() => update((d) => toggleStar(d, item.id))} aria-label={starred ? '取消收藏' : '收藏这题'} aria-pressed={starred}>
          <Icon name="star" size={17} />
        </button>
      </Tooltip>
    </div>
  );
}

// ─── Listening hero texts ───

export function ListeningTitle({ item }: { item: Item }) {
  const m = item.source.label.match(/(\d+)番/);
  return (
    <>
      <Icon name="headphones" size={14} />
      聴解{m ? ` · ${m[1]}番` : ''}
    </>
  );
}

export function ListeningCaption({ item, revealed }: { item: Item; revealed: boolean }) {
  return (
    <>
      <RichText text={item.stem} lang="ja" className="pl-audio-stem" />
      {!revealed && <p className="pl-audio-tip">选项只在录音里读出。边听边记关键词，听完选 1–{item.options?.length ?? 4}。</p>}
    </>
  );
}

// ─── Confidence (practice) / flag (exam) ───

const CONF: { value: Confidence; label: string; icon: IconName }[] = [
  { value: 'sure', label: '确定', icon: 'checkCircle' },
  { value: 'unsure', label: '没把握', icon: 'help' },
  { value: 'guess', label: '猜的', icon: 'flag' },
];

export function ConfidencePicker({ value, onChange, exam, compact }: { value: Confidence; onChange: (c: Confidence) => void; exam: boolean; compact?: boolean }) {
  const noFocus = (e: { preventDefault: () => void }) => e.preventDefault();
  if (exam) {
    // In an exam this is a bookmark for a second look, not a confidence level.
    const on = value !== 'sure';
    return (
      <div className="pl-conf" data-hotkeys>
        <button
          type="button"
          className={cx('pl-flag', on && 'is-on')}
          aria-pressed={on}
          onClick={() => onChange(on ? 'sure' : 'unsure')}
          onMouseDown={noFocus}
        >
          <Icon name="flag" size={14} />
          {on ? '已标记 · 交卷前回看' : '标记此题'}
          <Kbd>F</Kbd>
        </button>
      </div>
    );
  }
  return (
    <div className={cx('pl-conf', compact && 'is-compact')} data-hotkeys>
      <span className="pl-conf-label">
        把握
        <Kbd>F</Kbd>
      </span>
      <div className="pl-conf-seg" role="radiogroup" aria-label="把握">
        {CONF.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={value === c.value}
            className={cx('pl-conf-btn', `is-${c.value}`, value === c.value && 'is-on')}
            onClick={() => onChange(c.value)}
            onMouseDown={noFocus}
          >
            <Icon name={c.icon} size={13} />
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function nextConfidence(c: Confidence): Confidence {
  return c === 'sure' ? 'unsure' : c === 'unsure' ? 'guess' : 'sure';
}

// ─── Result card ───

function relDay(today: string, due: string): string {
  const n = daysBetween(today, due);
  if (n <= 0) return '今天';
  if (n === 1) return '明天';
  return `${n} 天后`;
}

interface Review {
  text: string;
  good?: boolean;
  /** Short form for a wrong answer, whose title already says it was recorded ("2 天后再练"). */
  short?: string;
  graduated?: boolean;
}

/** When (and why) this item comes back, from the progress right after the answer. */
function reviewNote(correct: boolean, answer: SessionAnswer, today: string, p: ItemProgress | undefined, before: ItemProgress | null | undefined): Review | null {
  if (!p) return null;
  const conf = answer.confidence;
  if (p.inMistakes && p.due) {
    const when = `${relDay(today, p.due)}再练`;
    if (!correct || answer.gaveUp) return { text: `已记入错题本 · ${when}`, short: when };
    if (conf === 'guess') return { text: `猜对的也记入错题本 · ${when}` };
    if (conf === 'unsure') return { text: `没把握的题会再出现 · ${when}` };
    if (p.box >= MISTAKE_GRADUATE_BOX - 1) return { text: `再答对 1 次就移出错题本 · ${when}`, good: true };
    return { text: `错题本复习中 · ${when}` };
  }
  if (correct && before?.inMistakes) return { text: '已移出错题本，这题拿下了', good: true, graduated: true };
  if (correct && p.slow) return { text: '答对了但用时偏长 · 过几天会再练一次提速' };
  return null;
}

/** Count of answers in a row that were right, ending at this one (practice sessions). */
export function correctStreak(order: string[], answers: Record<string, SessionAnswer>, upto: string): number {
  const end = order.indexOf(upto);
  let n = 0;
  for (let i = end; i >= 0; i--) {
    const a = answers[order[i]];
    if (!a?.submitted || !a.correct || a.gaveUp) break;
    n++;
  }
  return n;
}

// ─── Exam: gentle nudge on a question that is eating the clock ───

export function SlowNudge({ clock, saved, target, onSkip }: { clock: StudyClock; saved: number; target: number; onSkip: () => void }) {
  useClock(clock);
  const t = saved + clock.pendingItem();
  if (t <= 2 * target) return null;
  return (
    <div className="pl-nudge" role="status">
      <Icon name="timer" size={14} className="pl-nudge-icon" />
      <span className="pl-nudge-text">这题用时已超 2 倍，先跳过，最后再回来</span>
      <Button size="sm" variant="secondary" iconRight="skip" onClick={onSkip} onMouseDown={(e) => e.preventDefault()}>
        跳过
      </Button>
    </div>
  );
}

export function ResultBanner({
  item,
  answer,
  grade,
  today,
  progress,
  before,
  exam,
  streak = 0,
  review: reviewSession,
}: {
  item: Item;
  answer: SessionAnswer;
  grade: GradeResult;
  today: string;
  progress?: ItemProgress;
  /** Progress just before this answer (undefined when unknown, null when the item was new). */
  before?: ItemProgress | null;
  /** Exam review: an empty answer means time ran out / skipped, not "gave up". */
  exam?: boolean;
  /** Right answers in a row ending here (practice). */
  streak?: number;
  /** A redo of known items (mistake book, mock correction): a quick answer is expected, not a misread. */
  review?: boolean;
}) {
  const gaveUp = !!answer.gaveUp;
  const blank = !!exam && (answer.response === null || answer.response === undefined);
  const correct = !gaveUp && grade.correct;
  const groups = grade.groups || [];
  const partial = !correct && !gaveUp && item.format === 'blanks' && groups.some((g) => g.correct);
  const review = reviewNote(correct, answer, today, progress, before);
  const tone = correct ? 'success' : blank ? 'neutral' : gaveUp || partial ? 'warning' : 'danger';
  const icon: IconName = correct ? 'checkCircle' : blank ? 'minus' : gaveUp ? 'bulb' : partial ? 'alert' : 'xCircle';

  const secs = answer.seconds;
  const diff = secs - item.targetSec;
  const timeText = (
    <>
      用时 <span className="num">{fmtClock(secs)}</span>（目标 <span className="num">{fmtClock(item.targetSec)}</span>）
    </>
  );

  let title: string;
  let line: ReactNode = null;
  if (item.format === 'choice') {
    title = correct ? '回答正确' : blank ? '未作答' : gaveUp ? '看懂解析就是收获' : progress?.inMistakes ? '这题记下了' : '答错了';
    if (!correct) {
      const right = item.answer !== undefined ? optionBadge(optionLabel(item, item.answer)) : '?';
      const mine = typeof answer.response === 'number' ? optionBadge(optionLabel(item, answer.response)) : null;
      line = (
        <span className="pl-res-keys">
          正确答案 <b className="pl-res-key is-right num">{right}</b>
          {mine && !gaveUp && (
            <>
              <span className="pl-res-sep" />
              你选了{' '}
              <b className="pl-res-key is-mine num" aria-label={`你选了 ${mine}（错）`}>
                {mine}
                <Icon name="x" size={11} className="pl-res-key-x" />
              </b>
            </>
          )}
        </span>
      );
    }
  } else {
    const ok = groups.filter((g) => g.correct).length;
    title = correct ? '全部正确' : blank ? '未作答' : gaveUp ? '看懂解析就是收获' : `对了 ${ok} / ${groups.length} 组`;
    if (!correct && !blank) line = <span className="pl-res-plain">格子里已换成正确答案，你填的在右上角</span>;
  }

  // A right answer gets one encouraging fact (leaving the mistake book wins: it replaces the review line);
  // a wrong one just the facts (a very fast one hints at a misread).
  let fact: string | null = null;
  if (correct) {
    if (review?.graduated) fact = progress && progress.correct >= 2 ? `这题第 ${progress.correct} 次答对 · 移出错题本` : '答对了 · 移出错题本';
    else if (streak >= 3) fact = `连对 ${streak} 题`;
    else if (diff <= -10) fact = `比目标快 ${fmtClock(-diff)}`;
  }
  const showReview = review && !(fact && review.graduated) && !(review.short && !correct && !gaveUp);
  let timeNote: { text: string; warn?: boolean } | null = null;
  if (correct && diff > 15) timeNote = { text: `超出目标 ${fmtClock(diff)}`, warn: true };
  else if (!correct && !gaveUp && !blank && !reviewSession && secs >= 1 && secs < Math.min(20, item.targetSec * 0.2)) timeNote = { text: '答得很快，题目读完了吗？', warn: true };
  const conf = answer.confidence && answer.confidence !== 'sure' ? (answer.confidence === 'guess' ? '猜的' : '没把握') : null;

  return (
    <div className={cx('pl-res', `tone-${tone}`, correct && 'is-correct')} role="status">
      <div className="pl-res-head">
        <Icon name={icon} size={18} className="pl-res-icon" />
        <span className="pl-res-title">{title}</span>
        {conf && <span className="pl-res-conf">{conf}</span>}
      </div>
      {fact && <div className="pl-res-fact">{fact}</div>}
      {line && <div className="pl-res-line">{line}</div>}
      <div className="pl-res-meta">
        {review?.short && !correct && !gaveUp ? <span>{review.short}</span> : null}
        <span>{timeText}</span>
      </div>
      {showReview && <div className={cx('pl-res-review', review.good && 'is-good')}>{review.text}</div>}
      {timeNote && <div className={cx('pl-res-review pl-res-note', timeNote.warn && 'is-warn')}>{timeNote.text}</div>}
    </div>
  );
}

/**
 * After grading, scroll the answer card (only it) so the right option / the mark sheet is visible,
 * and the verdict and its tools under it as far as the room allows (small windows leave little).
 */
export function revealAnswer(box: HTMLElement | null) {
  const el = box?.querySelector('.pl-opt.is-right, .pl-sheet-groups');
  if (!box || !el) return;
  const b = box.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const below = box.querySelector('.pl-tools') ?? box.querySelector('.pl-res');
  const want = Math.max(r.bottom, below?.getBoundingClientRect().bottom ?? 0);
  if (want > b.bottom - 6) box.scrollTop += Math.max(0, Math.min(want - b.bottom + 14, r.top - b.top - 8));
  else if (r.top < b.top) box.scrollTop -= b.top - r.top + 8;
}

/**
 * Single column after grading: the action row carries the verdict and 下一题. Bring it fully into view
 * (in flow), or keep the answers clear of it while it is pinned to the bottom of a short window.
 */
export function revealResult(main: HTMLElement | null) {
  const row = main?.querySelector<HTMLElement>('.pl-single-row');
  if (!main || !row) return;
  const m = main.getBoundingClientRect();
  const answers = main.querySelector('.pl-paper-answer, .pl-audio-answer')?.getBoundingClientRect();
  const rowBox = row.getBoundingClientRect();
  const pinned = getComputedStyle(row).position === 'sticky' && rowBox.bottom >= m.bottom - 2;
  const bottom = pinned ? (answers?.bottom ?? 0) + rowBox.height + 8 : rowBox.bottom + 16;
  const over = bottom - m.bottom;
  const keepTop = (answers?.top ?? rowBox.top) - m.top - 12;
  if (over > 0) main.scrollTop += Math.max(0, Math.min(over, keepTop));
}

// ─── Explanation card ───

export function ExplanationCard({ item, open, onToggle }: { item: Item; open: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const toggle = () => {
    onToggle();
    if (!open) setTimeout(() => ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 40);
  };
  const ex = item.explanation;
  const hint = [ex.keyPoints?.length ? '考点' : '', ex.traps?.length ? '易错' : '', ex.shortcut ? '考场速解' : '', item.transcript ? '听力原文' : ''].filter(Boolean).join(' · ');
  return (
    <section className={cx('pl-card pl-excard', open && 'is-open')} ref={ref} data-explanation>
      <button type="button" className="pl-excard-head" onClick={toggle} aria-expanded={open}>
        <IconTile icon="bulb" tone="warning" />
        <span className="pl-card-title">解析</span>
        {!open && <span className="pl-excard-hint">思路{hint && ` · ${hint}`}</span>}
        <span className="pl-excard-right">
          <Kbd>E</Kbd>
          <Icon name="down" size={16} className="pl-excard-chev" />
        </span>
      </button>
      {open && (
        <div className="pl-excard-body">
          <Explanation item={item} />
        </div>
      )}
    </section>
  );
}

// ─── Exam answer sheet (grid navigator) ───

export function ExamSheet({
  open,
  onClose,
  cells,
  current,
  onJump,
  onSubmit,
  ready,
}: {
  open: boolean;
  onClose: () => void;
  cells: StripCell[];
  current: number;
  onJump: (i: number) => void;
  onSubmit: () => void;
  /** Every question answered: 交卷 is the obvious next step. */
  ready: boolean;
}) {
  const answered = cells.filter((c) => c.state === 'answered').length;
  const flagged = cells.filter((c) => c.flag).length;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="答题卡"
      width={560}
      footer={
        <>
          <Button variant={ready ? 'ghost' : 'primary'} onClick={onClose} autoFocus={!ready}>
            继续作答
          </Button>
          <Button variant={ready ? 'primary' : 'secondary'} icon="check" onClick={onSubmit}>
            交卷
          </Button>
        </>
      }
    >
      <div className="pl-xs-legend">
        <span>
          <i className="pl-xs-swatch is-answered" /> 已作答 <b className="num">{answered}</b>
        </span>
        <span>
          <i className="pl-xs-swatch is-todo" /> 未作答 <b className="num">{cells.length - answered}</b>
        </span>
        <span className={cx(!flagged && 'is-zero')}>
          <i className="pl-xs-swatch is-flag">
            <Icon name="flag" size={9} />
          </i>{' '}
          已标记 <b className="num">{flagged}</b>
        </span>
      </div>
      <div className="pl-xs-grid">
        {cells.map((c, i) => (
          <button
            key={i}
            type="button"
            className={cx('pl-xs-cell', `is-${c.state}`, c.flag && 'has-flag', i === current && 'is-current')}
            aria-label={`第 ${i + 1} 题 · ${cellTitle(c)}`}
            onClick={() => {
              onJump(i);
              onClose();
            }}
          >
            <span className="num">{i + 1}</span>
            {c.flag && (
              <span className="pl-xs-flag" aria-hidden>
                <Icon name="flag" size={9} />
              </span>
            )}
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ─── Two-pane review: what the explanation talks about stays beside it ───

/** The sentence(s) of a passage that hold its underlined part (__…__), or null. */
export function underlinedSentences(passage: string): string | null {
  const paras = passage.split(/\n[ \t]*\n/);
  const out: string[] = [];
  for (const p of paras) {
    if (!p.includes('__')) continue;
    const sentences = p.replace(/\n/g, '').match(/[^。！？]*(?:[。！？]+[」』）]*|$)/g)?.filter((x) => x.trim()) ?? [];
    let open = false;
    let cur = '';
    for (const sen of sentences) {
      const marks = (sen.match(/__/g) || []).length;
      if (open || marks) cur += sen;
      if (marks % 2 === 1) open = !open;
      if (!open && cur) {
        out.push(cur.trim());
        cur = '';
      }
    }
    if (out.length >= 2) break;
  }
  return out.length ? out.slice(0, 2).join('\n\n') : null;
}

/** What the reference peek mirrors in the paper: the figures, or the underlined part of a passage. */
export function referenceSelector(item: Item): string | null {
  if (item.figures?.length) return '.pl-paper .q-figures';
  return splitReadingStem(item) ? '.pl-paper .rt-u' : null;
}

/**
 * True while the element `selector` (inside the scroller) is (mostly) scrolled out of view. The answer
 * card shows the reference peek only then, so the figure is never on screen twice.
 */
export function useScrolledAway(rootRef: RefObject<HTMLElement | null>, selector: string | null, active: boolean, key: string): boolean {
  const [away, setAway] = useState(false);
  useEffect(() => {
    const root = rootRef.current;
    const el = active && selector ? root?.querySelector(selector) : null;
    if (!root || !el || typeof IntersectionObserver === 'undefined') {
      setAway(false);
      return;
    }
    const io = new IntersectionObserver(([e]) => setAway(e.intersectionRatio < 0.35), { root, threshold: [0, 0.35, 0.7] });
    io.observe(el);
    return () => io.disconnect();
  }, [rootRef, selector, active, key]);
  return away;
}

/**
 * After grading in the two-pane layout the explanation pushes the question out of view; the answer
 * card then keeps the figure (or the underlined sentence of a passage) next to it.
 */
export function ReferencePeek({ item, passage }: { item: Item; passage?: string }) {
  const quote = passage ? underlinedSentences(passage) : null;
  const ref = useRef<HTMLElement>(null);
  // Arriving below the fold of the card: scroll it up into view, but never past the answers.
  useEffect(() => {
    const el = ref.current;
    const box = el?.closest<HTMLElement>('.pl-side-scroll');
    if (!el || !box) return;
    const t = setTimeout(() => {
      const b = box.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      // The topmost of the right answer and the learner's pick stays in view.
      const anchor = box.querySelector('.pl-opt.is-right, .pl-opt.is-wrong, .pl-sheet-groups')?.getBoundingClientRect();
      const want = r.bottom - b.bottom + 14;
      const limit = anchor ? anchor.top - b.top - 8 : want;
      if (want > 0) box.scrollBy({ top: Math.max(0, Math.min(want, limit)), behavior: 'smooth' });
    }, 60);
    return () => clearTimeout(t);
  }, []);
  if (item.figures?.length) {
    return (
      <section className="pl-ref" ref={ref}>
        <div className="pl-ref-label">
          <Icon name="image" size={13} />
          题图
        </div>
        <Figures figures={item.figures} />
      </section>
    );
  }
  if (!quote) return null;
  return (
    <section className="pl-ref" ref={ref}>
      <div className="pl-ref-label">
        <Icon name="file" size={13} />
        原文 · 下线部
      </div>
      <RichText text={quote} lang="ja" className="pl-ref-quote" />
    </section>
  );
}
