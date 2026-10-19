// Big option buttons for choice items. Keys 1–9 are handled by the player.
import { useLayoutEffect, useRef, useState } from 'react';
import type { Item } from '@shared/types.ts';
import { RichText } from '../../components/RichText.tsx';
import { Icon } from '../../components/Icon.tsx';
import { optionBadge, optionIsBareLabel, optionLabel } from '../../components/question/OptionList.tsx';
import { cx } from '../../lib/format.ts';

type Layout = 'list' | 'grid' | 'labels';

/** Rough rendered width in "narrow characters": CJK / full-width characters count double. */
function visibleLength(s: string): number {
  const tall = /\\(d?frac|sqrt|sum|int)/.test(s) ? 5 : 0;
  const t = s
    .replace(/\\(mathrm|text|ce|quad|qquad|left|right)\b/g, '')
    .replace(/\\[a-zA-Z]+/g, 'x')
    .replace(/[$\s{}\\^_,]/g, '');
  const wide = (t.match(/[\u3000-\u9fff\uf900-\ufaff\uff01-\uff60]/g) || []).length;
  return t.length + wide + tall;
}

function layoutFor(item: Item, hideText: boolean): Layout {
  const opts = item.options || [];
  if (hideText || opts.every((_, i) => optionIsBareLabel(item, i))) return 'labels';
  if (opts.every((o) => visibleLength(o) <= 9)) return 'grid';
  return 'list';
}

/** Preferred column count before looking at the space actually available. */
function preferredColumns(item: Item, layout: Layout): number {
  const n = item.options?.length ?? 4;
  if (layout === 'list') return 1;
  if (layout === 'labels') return n <= 4 ? n : 3;
  const tiny = (item.options || []).every((o) => visibleLength(o) <= 4);
  return tiny && n > 4 ? 3 : 2;
}

const GAP = 8;
/** A text cell narrower than this looks squeezed, however short its text. */
const MIN_CELL = { grid: [0, 0, 112, 130], labels: [0, 0, 56, 56] } as const;

/**
 * Columns that fit the width the pad really has (the side panel shrinks on small windows):
 * every cell must hold its badge plus the longest option on one line.
 */
function fitColumns(item: Item, layout: Layout, width: number | null, scale: number): number {
  const want = preferredColumns(item, layout);
  if (layout === 'list' || !width) return want;
  const longest = Math.max(0, ...(item.options || []).map(visibleLength));
  // badge 30 + gap 10 + side padding 2×11 + ~0.55em per narrow character, plus a little air.
  const need = layout === 'labels' ? 56 : 66 + longest * 8.6 * scale;
  let cols = want;
  while (cols > 1) {
    const cell = (width - GAP * (cols - 1)) / cols;
    if (cell >= Math.max(MIN_CELL[layout][Math.min(cols, 3)], need)) break;
    cols--;
  }
  return cols;
}

function readingScale(): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--reading-scale'));
  return Number.isFinite(v) && v > 0 ? v : 1;
}

/** Width of an element, kept up to date (null before the first layout). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function ChoicePad({
  item,
  value,
  onSelect,
  onCommit,
  reveal,
  hideText,
}: {
  item: Item;
  value: number | null;
  /** Undefined → read-only. */
  onSelect?: (i: number) => void;
  /** Double-click: select and submit at once. */
  onCommit?: (i: number) => void;
  /** Show right / wrong after grading. */
  reveal?: boolean;
  /** Listening: only labels until the answer is in. */
  hideText?: boolean;
}) {
  const opts = item.options || [];
  const layout = layoutFor(item, !!hideText && !reveal);
  const [ref, width] = useWidth<HTMLDivElement>();
  const cols = fitColumns(item, layout, width, width ? readingScale() : 1);
  return (
    <div
      ref={ref}
      className={cx('pl-opts', `pl-opts-${layout}`, `is-cols-${cols}`)}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      role="radiogroup"
      data-hotkeys
    >
      {opts.map((o, i) => {
        const chosen = value === i;
        const right = reveal && i === item.answer;
        const wrong = reveal && chosen && i !== item.answer;
        const dim = reveal && !right && !wrong;
        const label = optionLabel(item, i);
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={chosen}
            className={cx('pl-opt', chosen && 'is-chosen', right && 'is-right', wrong && 'is-wrong', dim && 'is-dim', !onSelect && 'is-static')}
            onClick={() => onSelect?.(i)}
            onDoubleClick={() => onCommit?.(i)}
            onMouseDown={(e) => e.preventDefault()}
            disabled={!onSelect && !reveal}
            tabIndex={onSelect ? 0 : -1}
          >
            <span className="pl-opt-badge num">{optionBadge(label)}</span>
            {layout !== 'labels' && (
              <span className="pl-opt-text">
                <RichText text={o} lang="ja" inline />
              </span>
            )}
            {right && <Icon name="check" size={18} className="pl-opt-mark" />}
            {wrong && <Icon name="x" size={18} className="pl-opt-mark" />}
            {onSelect && i < 9 && !reveal && <span className="pl-opt-key">{i + 1}</span>}
          </button>
        );
      })}
    </div>
  );
}
