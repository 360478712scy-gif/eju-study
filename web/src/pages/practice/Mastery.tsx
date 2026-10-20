// Mastery bar + legend: the one mastery scale (薄弱 < 50% · 接近目标 · 达标 ≥ target) used by the
// practice topic table and the mock result's topic list. Untried topics get a quiet dashed track.
import { cx, pct } from '../../lib/format.ts';
import { Legend } from '../../components/ui.tsx';
import { masteryTone } from './practiceData.ts';
import './mastery.css';

export function MasteryBar({ value, target, showValue = true, className }: { value: number | null; target: number; showValue?: boolean; className?: string }) {
  const tone = value === null ? 'neutral' : masteryTone(value, target);
  return (
    <span className={cx('mstry', `tone-${tone}`, value === null && 'is-untried', className)}>
      <span className="mstry-track" role={value === null ? undefined : 'progressbar'} aria-valuenow={value === null ? undefined : Math.round(value * 100)} aria-label={value === null ? '还没练过' : undefined}>
        {value !== null && <i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />}
      </span>
      {showValue && <span className="mstry-val num">{value === null ? '' : pct(value)}</span>}
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
