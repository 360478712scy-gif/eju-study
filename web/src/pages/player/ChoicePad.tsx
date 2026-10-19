// Big option buttons for choice items. Keys 1–9 are handled by the player.
import type { Item } from '@shared/types.ts';
import { RichText } from '../../components/RichText.tsx';
import { Icon } from '../../components/Icon.tsx';
import { optionBadge, optionIsBareLabel, optionLabel } from '../../components/question/OptionList.tsx';
import { cx } from '../../lib/format.ts';

type Layout = 'list' | 'grid' | 'labels';

function visibleLength(s: string): number {
  const tall = /\\(d?frac|sqrt|sum|int)/.test(s) ? 5 : 0;
  return (
    s
      .replace(/\\(mathrm|text|ce|quad|qquad|left|right)\b/g, '')
      .replace(/\\[a-zA-Z]+/g, 'x')
      .replace(/[$\s{}\\^_,]/g, '').length + tall
  );
}

function layoutFor(item: Item, hideText: boolean): Layout {
  const opts = item.options || [];
  if (hideText || opts.every((_, i) => optionIsBareLabel(item, i))) return 'labels';
  if (opts.every((o) => visibleLength(o) <= 9)) return 'grid';
  return 'list';
}

function columns(item: Item, layout: Layout): number {
  const n = item.options?.length ?? 4;
  if (layout === 'list') return 1;
  if (layout === 'labels') return n <= 4 ? n : 3;
  const tiny = (item.options || []).every((o) => visibleLength(o) <= 4);
  return tiny && n > 4 ? 3 : 2;
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
  const cols = columns(item, layout);
  return (
    <div className={cx('pl-opts', `pl-opts-${layout}`)} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} role="radiogroup" data-hotkeys>
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
