// One difficulty display for every page: three bars plus a word. Dots are reserved for 考频.
import { cx } from '../../lib/format.ts';
import './question.css';

export const DIFFICULTY = ['基础', '标准', '较难'] as const;

export function difficultyWord(d: number): string {
  return DIFFICULTY[Math.max(1, Math.min(3, Math.round(d))) - 1];
}

export function DifficultyMeter({ value, label = true, className }: { value: number; label?: boolean; className?: string }) {
  const v = Math.max(1, Math.min(3, Math.round(value)));
  return (
    <span className={cx('q-diff', className)} aria-label={`难度：${difficultyWord(v)}`}>
      <span className="q-diff-bars" aria-hidden>
        {[1, 2, 3].map((d) => (
          <i key={d} className={cx(d <= v && 'is-on')} />
        ))}
      </span>
      {label && difficultyWord(v)}
    </span>
  );
}
