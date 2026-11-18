// Small presentational pieces shared by the mistake book, notes and previews.
import type { ItemProgress } from '@shared/types.ts';
import { MISTAKE_GRADUATE_BOX } from '@shared/srs.ts';
import { Icon } from '../../components/Icon.tsx';
import { Tooltip } from '../../components/ui.tsx';
import { cx } from '../../lib/format.ts';
import { RESULT_TEXT, type ResultKind } from './helpers.ts';
import './bits.css';

/**
 * Where an item stands, as one 14px mark used in every item list:
 * new mistake = hollow ring · correct once = half ring · cleared = filled check · not done = small dot.
 */
export type MarkState = 'new' | 'once' | 'cleared' | 'missed' | 'todo';

export function markOf(p: ItemProgress | undefined): MarkState {
  if (!p || p.attempts === 0) return 'todo';
  if (p.inMistakes) return p.box >= 1 ? 'once' : 'new';
  return p.lastCorrect ? 'cleared' : 'missed';
}

export function markText(p: ItemProgress | undefined): string {
  const s = markOf(p);
  if (s === 'todo') return '还没做过';
  if (s === 'new' || s === 'once') {
    const left = Math.max(1, MISTAKE_GRADUATE_BOX - Math.max(0, p!.box));
    return `在错题本 · 还需间隔答对 ${left} 次`;
  }
  if (s === 'cleared') return p!.box >= MISTAKE_GRADUATE_BOX ? '已移出错题本' : '上次答对';
  return '上次没答对';
}

export function ItemMark({ p, tooltip = true }: { p: ItemProgress | undefined; tooltip?: boolean }) {
  const s = markOf(p);
  const label = markText(p);
  const mark = (
    <span className={cx('ib-mark', `is-${s}`)} role="img" aria-label={label}>
      {s === 'cleared' && <Icon name="check" size={10} style={{ strokeWidth: 3.2 }} />}
    </span>
  );
  return tooltip ? (
    <Tooltip label={label} side="right">
      {mark}
    </Tooltip>
  ) : (
    mark
  );
}

const RESULT_ICON: Record<ResultKind, 'check' | 'x' | 'help' | 'minus' | 'skip' | null> = {
  right: 'check',
  wrong: 'x',
  guess: 'help',
  gaveup: 'skip',
  partial: 'minus',
  none: null,
};

/** Result of one specific attempt (answer block, history chips): right ✓ · wrong ✗ · guess ? · partial –. */
export function ResultMark({ kind, size = 'md' }: { kind: ResultKind; size?: 'xs' | 'md' }) {
  const icon = RESULT_ICON[kind];
  return (
    <span className={cx('mb-res', `is-${kind}`, size === 'xs' && 'mb-res-xs')} role="img" aria-label={`上次${RESULT_TEXT[kind]}`}>
      {icon && <Icon name={icon} size={size === 'xs' ? 11 : 13} style={{ strokeWidth: 2.6 }} />}
    </span>
  );
}
