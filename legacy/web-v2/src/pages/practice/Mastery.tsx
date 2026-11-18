// Mastery bar + legend: the one mastery scale (薄弱 < 50% · 接近目标 · 达标 ≥ target) used by the
// practice topic table. Untried topics say "未练" (like "—" in the 错题 column) instead of an empty bar.
import { cx, pct } from '../../lib/format.ts';
import { Legend } from '../../components/ui.tsx';
import { masteryTone } from './practiceData.ts';
import './mastery.css';

export function MasteryBar({ value, target, showValue = true, className }: { value: number | null; target: number; showValue?: boolean; className?: string }) {
  if (value === null) {
    return (
      <span className={cx('mstry', 'is-untried', className)}>
        <span className="mstry-none">未练</span>
      </span>
    );
  }
  const tone = masteryTone(value, target);
  return (
    <span className={cx('mstry', `tone-${tone}`, className)}>
      <span className="mstry-track" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
      </span>
      {showValue && <span className="mstry-val num">{pct(value)}</span>}
    </span>
  );
}

/** Shown once per page that draws mastery bars. */
export function MasteryLegend({ target, className }: { target: number | null; className?: string }) {
  return (
    <Legend
      className={cx('mstry-legend', className)}
      items={[
        { label: '薄弱 <50%', tone: 'danger', shape: 'bar' },
        { label: '接近目标', tone: 'neutral', shape: 'bar' },
        { label: target === null ? '达标' : `达标 ≥${Math.round(target * 100)}%`, tone: 'success', shape: 'bar' },
      ]}
    />
  );
}
