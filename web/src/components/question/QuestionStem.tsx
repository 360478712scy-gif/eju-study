// Stem + figures (+ optional Chinese gloss). Shared by the player and previews.
// With `marks`, EJU answer boxes (\bx{AB}) show the learner's typed mark-sheet values
// live — both the boxes KaTeX draws inside formulas and the ones in plain text.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import type { Item } from '@shared/types.ts';
import { normalizeMark } from '@shared/grading.ts';
import { RichText, type BoxRenderer } from '../RichText.tsx';
import { Figures } from './Figures.tsx';
import { Icon } from '../Icon.tsx';
import { cx } from '../../lib/format.ts';
import './question.css';

export interface StemMarks {
  /** Typed mark-sheet characters by letter ("A" → "4"). */
  values: Record<string, string>;
  /** Box group being filled right now (e.g. "CD"). */
  active?: string | null;
  /** After grading: correctness per box group. */
  results?: Record<string, boolean>;
  /** Clicking a box in the stem selects that group. */
  onBoxClick?: (group: string) => void;
}

const MarksContext = createContext<StemMarks | null>(null);

type BoxState = 'idle' | 'filled' | 'active' | 'right' | 'wrong';

function boxState(m: StemMarks, label: string): { state: BoxState; text: string | null } {
  const chars = [...label].map((l) => normalizeMark(m.values[l] || ''));
  const any = chars.some(Boolean);
  const text = any ? [...label].map((l, i) => (chars[i] === '-' ? '−' : chars[i] || l)).join('') : null;
  if (m.results && label in m.results) return { state: m.results[label] ? 'right' : 'wrong', text };
  if (m.active === label) return { state: 'active', text };
  return { state: any ? 'filled' : 'idle', text };
}

/** A plain-text answer box (outside formulas) that mirrors the mark sheet. */
function LiveBox({ label }: { label: string }) {
  const m = useContext(MarksContext);
  if (!m) return <span className="rt-box">{label}</span>;
  const { state, text } = boxState(m, label);
  return (
    <span className={cx('rt-box q-live-box', `is-${state}`)} data-bx={label} title={`答案框 ${label}`}>
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

/** Mark source citations and footnotes in Japanese passages so they can be styled quietly. */
function decoratePassage(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.q-stem-text > p').forEach((p) => {
    const t = (p.textContent || '').trim();
    p.classList.toggle('q-cite', /^（[\s\S]*[『「][\s\S]*）$/.test(t) && t.length < 160);
    p.classList.toggle('q-note', /^＊/.test(t));
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
  gloss: glossProp,
  onGlossChange,
}: {
  item: Item;
  showGloss?: boolean;
  box?: BoxRenderer;
  hideFigures?: boolean;
  /** Live mark-sheet values for "blanks" items. */
  marks?: StemMarks;
  /** Override the rendered stem (e.g. the passage only). */
  text?: string;
  /** Controlled gloss visibility (falls back to internal state seeded by showGloss). */
  gloss?: boolean;
  onGlossChange?: (open: boolean) => void;
}) {
  const [glossState, setGlossState] = useState(!!showGloss);
  useEffect(() => setGlossState(!!showGloss), [showGloss]);
  const gloss = glossProp ?? glossState;
  const toggleGloss = () => {
    const next = !gloss;
    setGlossState(next);
    onGlossChange?.(next);
  };

  const live = useCallback<BoxRenderer>((label) => <LiveBox label={label} />, []);
  const boxRenderer = box ?? (marks ? live : undefined);

  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    decorateKatexBoxes(ref.current, marks);
    if (item.subject === 'japanese') decoratePassage(ref.current);
  });

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
    if (el?.dataset.bx) marks.onBoxClick(el.dataset.bx);
  };

  return (
    <MarksContext.Provider value={marks ?? null}>
      <div className={cx('q-stem', marks && 'has-marks', marks?.onBoxClick && 'is-clickable')} ref={ref} onClick={onClick}>
        <RichText text={text ?? item.stem} lang="ja" box={boxRenderer} className="q-stem-text" />
        {!hideFigures && item.figures && item.figures.length > 0 && <Figures figures={item.figures} />}
        {item.stemZh && (
          <div className="q-gloss">
            <button type="button" className={cx('q-gloss-toggle', gloss && 'is-on')} onClick={toggleGloss} aria-pressed={gloss}>
              <Icon name="languages" size={14} />
              {gloss ? '收起中文对照' : '中文对照'}
            </button>
            {gloss && <RichText text={item.stemZh} lang="zh" box={boxRenderer} className="q-gloss-text" />}
          </div>
        )}
      </div>
    </MarksContext.Provider>
  );
}
