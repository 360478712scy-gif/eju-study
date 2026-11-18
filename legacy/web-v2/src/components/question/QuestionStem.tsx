// Stem + figures (+ optional Chinese gloss). Shared by the player and previews.
// With `marks`, EJU answer boxes (\bx{AB}) show the learner's typed mark-sheet values
// live — both the boxes KaTeX draws inside formulas and the ones in plain text.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { Item } from '@shared/types.ts';
import { normalizeMark } from '@shared/grading.ts';
import { RichText, type BoxRenderer } from '../RichText.tsx';
import { Figures } from './Figures.tsx';
import { Icon } from '../Icon.tsx';
import { cx } from '../../lib/format.ts';
import { markRangeRefs, markSlot, rangeRefLabel, SLOT_LABEL } from './boxRefs.ts';
import './question.css';

export interface StemMarks {
  /** Typed mark-sheet characters by letter ("A" → "4"). */
  values: Record<string, string>;
  /** Box group being filled right now (e.g. "CD"). */
  active?: string | null;
  /** After grading: correctness per box group. */
  results?: Record<string, boolean>;
  /** Re-test: box groups kept from the last (correct) attempt; shown filled and not clickable. */
  locked?: Record<string, boolean>;
  /** Clicking a box in the stem selects that group. */
  onBoxClick?: (group: string) => void;
}

const MarksContext = createContext<StemMarks | null>(null);

type BoxState = 'idle' | 'filled' | 'active' | 'right' | 'wrong' | 'locked';

function boxState(m: StemMarks, label: string): { state: BoxState; text: string | null } {
  const chars = [...label].map((l) => normalizeMark(m.values[l] || ''));
  const any = chars.some(Boolean);
  const text = any ? [...label].map((l, i) => (chars[i] === '-' ? '−' : chars[i] || l)).join('') : null;
  if (m.results && label in m.results) return { state: m.results[label] ? 'right' : 'wrong', text };
  if (m.locked?.[label]) return { state: 'locked', text };
  if (m.active === label) return { state: 'active', text };
  return { state: any ? 'filled' : 'idle', text };
}

/** "\bx{C} 〜 \bx{G}" in an instruction: a quiet label chip, never a box to fill or click. */
function RefChip({ label }: { label: string }) {
  return (
    <span className="rt-box q-ref-box" aria-label={`答案框 ${label}`}>
      {label}
    </span>
  );
}

/** The （　　） of a grammar item: an inline slot that previews the chosen option. */
export interface StemBlank {
  /** Option text to show in the slot (bank markup), or null for an empty slot. */
  text: string | null;
  tone?: 'preview' | 'right' | 'wrong';
}

function BlankSlot({ blank }: { blank: StemBlank }) {
  return (
    <span className={cx('q-slot', blank.text && `is-${blank.tone ?? 'preview'}`)} aria-label="空栏">
      {blank.text ? <RichText text={blank.text} lang="ja" inline /> : '\u3000'}
    </span>
  );
}

/** A plain-text answer box (outside formulas) that mirrors the mark sheet. */
function LiveBox({ label }: { label: string }) {
  const m = useContext(MarksContext);
  const ref = rangeRefLabel(label);
  if (ref) return <RefChip label={ref} />;
  if (!m) return <span className="rt-box">{label}</span>;
  const { state, text } = boxState(m, label);
  return (
    <span className={cx('rt-box q-live-box', `is-${state}`)} data-bx={label} title={state === 'locked' ? `答案框 ${label} · 上次已答对，已锁定` : `答案框 ${label}`}>
      {text ?? label}
    </span>
  );
}

/** Decorate the boxes KaTeX rendered (\bx inside $…$) with the same live state. */
function decorateKatexBoxes(root: HTMLElement, marks: StemMarks | undefined) {
  root.querySelectorAll<HTMLElement>('.katex .boxpad').forEach((pad) => {
    const label = pad.dataset.bx ?? (pad.textContent || '').trim();
    if (!/^[A-Z]+$/.test(label)) return;
    const frame = pad.closest<HTMLElement>('.vlist-t');
    pad.dataset.bx = label;
    if (frame) frame.dataset.bx = label;
    if (!marks) {
      delete pad.dataset.val;
      if (frame) delete frame.dataset.qbx;
      return;
    }
    const { state, text } = boxState(marks, label);
    if (text) pad.dataset.val = text;
    else delete pad.dataset.val;
    if (frame) frame.dataset.qbx = state;
  });
}

/**
 * Mark source citations and footnotes in Japanese passages so they can be styled quietly, and running
 * prose paragraphs so a passage can indent them like the printed paper (notices, lists and headings stay flush).
 */
function decoratePassage(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.q-stem-text > p').forEach((p) => {
    const t = (p.textContent || '').trim();
    const cite = /^（[\s\S]*[『「][\s\S]*）$/.test(t) && t.length < 160;
    const note = /^＊/.test(t);
    const heading = p.childNodes.length === 1 && p.firstElementChild?.tagName === 'STRONG';
    p.classList.toggle('q-cite', cite);
    p.classList.toggle('q-note', note);
    p.classList.toggle('q-prose', !cite && !note && !heading && t.length > 40 && !p.querySelector('br') && !/^[・\-*※●○◆■□（(【]/.test(t));
  });
}

/** Split a Japanese reading stem into passage and the final question sentence. */
export function splitReadingStem(item: Item): { passage: string; question: string } | null {
  if (item.subject !== 'japanese' || item.section !== 'reading') return null;
  const parts = item.stem.trim().split(/\n[ \t]*\n/);
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1].trim();
  if (last.length > 160 || !/(か[。？?]|問\s*[0-9０-９])/.test(last)) return null;
  return { passage: parts.slice(0, -1).join('\n\n'), question: last };
}

export function QuestionStem({
  item,
  showGloss,
  box,
  hideFigures,
  marks,
  text,
  prompt,
  gloss: glossProp,
  onGlossChange,
  blank,
}: {
  item: Item;
  showGloss?: boolean;
  box?: BoxRenderer;
  hideFigures?: boolean;
  /** Live mark-sheet values for "blanks" items. */
  marks?: StemMarks;
  /** Override the rendered stem (e.g. the passage only). */
  text?: string;
  /** The question sentence, shown as a quiet line under the text (short items whose stem was split). */
  prompt?: string;
  /** Controlled gloss visibility (falls back to internal state seeded by showGloss). */
  gloss?: boolean;
  onGlossChange?: (open: boolean) => void;
  /** Grammar items: draw the first （　　） as an inline slot showing this option. */
  blank?: StemBlank;
}) {
  const [glossState, setGlossState] = useState(!!showGloss);
  useEffect(() => setGlossState(!!showGloss), [showGloss]);
  const gloss = glossProp ?? glossState;
  const toggleGloss = () => {
    const next = !gloss;
    setGlossState(next);
    onGlossChange?.(next);
  };

  const blankText = blank?.text ?? null;
  const blankTone = blank?.tone;
  const hasBlank = !!blank;
  const live = useCallback<BoxRenderer>(
    (label) => (label === SLOT_LABEL ? <BlankSlot blank={{ text: blankText, tone: blankTone }} /> : <LiveBox label={label} />),
    [blankText, blankTone],
  );
  const boxRenderer = box ?? live;
  const source = text ?? item.stem;
  const shown = useMemo(() => {
    const t = markRangeRefs(source);
    return hasBlank ? markSlot(t) : t;
  }, [source, hasBlank]);
  const glossShown = useMemo(() => (item.stemZh ? markRangeRefs(item.stemZh) : ''), [item.stemZh]);

  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    decorateKatexBoxes(ref.current, marks);
    if (item.subject === 'japanese') decoratePassage(ref.current);
  });

  // Wide display formulas scroll sideways; fade the cut edge so the hidden part reads as "more".
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const check = () => {
      root.querySelectorAll<HTMLElement>('.katex-display').forEach((el) => {
        const over = el.scrollWidth > el.clientWidth + 1;
        el.classList.toggle('is-overflow', over);
        el.classList.toggle('is-end', over && el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
      });
    };
    check();
    const onScroll = (e: Event) => {
      const el = e.target as HTMLElement;
      if (el.classList?.contains('katex-display')) el.classList.toggle('is-end', el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
    };
    root.addEventListener('scroll', onScroll, true);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null;
    ro?.observe(root);
    return () => {
      root.removeEventListener('scroll', onScroll, true);
      ro?.disconnect();
    };
  }, [shown, gloss]);

  // Follow the box being filled when it changes (not on first render, so reading starts at the top).
  const active = marks?.active ?? null;
  const prevActive = useRef(active);
  useEffect(() => {
    if (active && prevActive.current !== null && active !== prevActive.current) {
      ref.current?.querySelector(`[data-bx="${active}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    prevActive.current = active;
  }, [active]);

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!marks?.onBoxClick) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-bx]');
    if (el?.dataset.bx && !marks.locked?.[el.dataset.bx]) marks.onBoxClick(el.dataset.bx);
  };

  return (
    <MarksContext.Provider value={marks ?? null}>
      <div className={cx('q-stem', marks && 'has-marks', marks?.onBoxClick && 'is-clickable')} ref={ref} onClick={onClick}>
        <RichText text={shown} lang="ja" box={boxRenderer} className="q-stem-text" />
        {prompt && (
          <div className="q-prompt">
            <Icon name="help" size={14} className="q-prompt-icon" />
            <RichText text={prompt} lang="ja" className="q-prompt-text" />
          </div>
        )}
        {!hideFigures && item.figures && item.figures.length > 0 && <Figures figures={item.figures} />}
        {item.stemZh && (
          <div className="q-gloss">
            <button type="button" className={cx('q-gloss-toggle', gloss && 'is-on')} onClick={toggleGloss} aria-pressed={gloss}>
              <Icon name="languages" size={14} />
              {gloss ? '收起中文对照' : '中文对照'}
            </button>
            {gloss && <RichText text={glossShown} lang="zh" box={boxRenderer} className="q-gloss-text" />}
          </div>
        )}
      </div>
    </MarksContext.Provider>
  );
}
