// Read-only option list with the correct answer (and an optional chosen answer) highlighted.
import type { Item } from '@shared/types.ts';
import { RichText } from '../RichText.tsx';
import { Icon } from '../Icon.tsx';
import { cx } from '../../lib/format.ts';

export function optionLabel(item: Item, i: number): string {
  return item.optionLabels?.[i] ?? String(i + 1);
}

/** Text to put inside a round label badge: circled digits (⓪, ①…⑳) become plain digits. */
export function optionBadge(label: string): string {
  const c = label.codePointAt(0) ?? 0;
  if (label.length === 1 && c >= 0x2460 && c <= 0x2473) return String(c - 0x2460 + 1);
  if (label === '\u24ea') return '0';
  return label;
}

/** True when an option's text is just its own label (the real choices are in a table in the stem). */
export function optionIsBareLabel(item: Item, i: number): boolean {
  const t = (item.options?.[i] ?? '').trim();
  return t === optionLabel(item, i) || t === optionBadge(optionLabel(item, i));
}

export function OptionList({ item, chosen, reveal = true }: { item: Item; chosen?: number | null; reveal?: boolean }) {
  if (item.format !== 'choice' || !item.options) return null;
  return (
    <ol className="q-options-ro">
      {item.options.map((o, i) => {
        const right = reveal && i === item.answer;
        const wrong = reveal && chosen === i && i !== item.answer;
        const mine = chosen === i;
        return (
          <li key={i} className={cx('q-opt-ro', right && 'is-right', wrong && 'is-wrong', mine && 'is-mine')}>
            <span className="q-opt-label">{optionBadge(optionLabel(item, i))}</span>
            <span className="q-opt-text">{optionIsBareLabel(item, i) ? <span className="faint">见题中表格</span> : <RichText text={o} lang="ja" inline />}</span>
            {right && <Icon name="check" size={16} className="q-opt-mark" />}
            {wrong && <Icon name="x" size={16} className="q-opt-mark" />}
          </li>
        );
      })}
    </ol>
  );
}

export function BlanksAnswer({ item, given }: { item: Item; given?: Record<string, string> | null }) {
  if (item.format !== 'blanks' || !item.blanks) return null;
  return (
    <div className="q-blanks-ro">
      {Object.entries(item.blanks).map(([k, v]) => {
        const wrong = !!given && given[k] !== undefined && given[k] !== v;
        return (
          <span key={k} className={cx('q-blank-ro', wrong && 'is-wrong')}>
            <b>{k}</b>
            {v}
            {wrong && <s>{given?.[k] || '·'}</s>}
          </span>
        );
      })}
    </div>
  );
}
