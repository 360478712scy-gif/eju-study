// Small presentational pieces shared by the mistake book and notes pages.
import { MISTAKE_GRADUATE_BOX } from '@shared/srs.ts';
import { Icon } from '../../components/Icon.tsx';
import { cx } from '../../lib/format.ts';
import { RESULT_TEXT, type ResultKind } from './helpers.ts';
import './bits.css';

/** Leitner progress of a mistake: filled dots = spaced confident correct re-tests (2 clears it). */
export function BoxDots({ box }: { box: number }) {
  const n = Math.max(0, Math.min(MISTAKE_GRADUATE_BOX, box));
  return (
    <span className="mb-dots" title={`间隔答对 ${n}/${MISTAKE_GRADUATE_BOX} 次`} aria-label={`间隔答对 ${n}/${MISTAKE_GRADUATE_BOX} 次`}>
      {Array.from({ length: MISTAKE_GRADUATE_BOX }, (_, i) => (
        <i key={i} className={cx(i < n && 'on')} />
      ))}
    </span>
  );
}

const RESULT_ICON: Record<ResultKind, 'check' | 'x' | 'help' | 'minus'> = {
  right: 'check',
  wrong: 'x',
  guess: 'help',
  gaveup: 'minus',
  partial: 'minus',
  none: 'minus',
};

export function ResultMark({ kind, size = 'md' }: { kind: ResultKind; size?: 'xs' | 'md' }) {
  return (
    <span className={cx('mb-res', `is-${kind}`, size === 'xs' && 'mb-res-xs')} title={`上次${RESULT_TEXT[kind]}`}>
      <Icon name={RESULT_ICON[kind]} size={size === 'xs' ? 11 : 14} />
    </span>
  );
}
