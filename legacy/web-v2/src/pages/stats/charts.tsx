// Hand-written inline SVG charts for the stats page. Colors come from CSS variables so
// every chart follows the light/dark theme. Each chart measures its container and draws
// in real pixels so text stays crisp; hover shows a small tooltip.
import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { cx, fmtMinutes } from '../../lib/format.ts';

export function useWidth<T extends HTMLElement>(fallback = 320) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth || fallback);
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, width] as const;
}

export interface TipState {
  x: number;
  y: number;
  content: ReactNode;
}

export function Tip({ tip, width }: { tip: TipState | null; width: number }) {
  if (!tip) return null;
  const edge = tip.x < width * 0.22 ? 'is-left' : tip.x > width * 0.78 ? 'is-right' : '';
  return (
    <div className={cx('st-tip', edge)} style={{ left: tip.x, top: tip.y }} role="status">
      {tip.content}
    </div>
  );
}

export function TipRow({ color, value, label }: { color?: string; value: ReactNode; label: ReactNode }) {
  return (
    <div className="st-tip-row">
      {color && <i className="st-tip-key" style={{ background: color }} />}
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function localX(e: ReactPointerEvent<Element>): number {
  const r = (e.currentTarget as Element).getBoundingClientRect();
  return e.clientX - r.left;
}

const niceStep = (span: number, count: number, unit: number) => unit * Math.max(1, Math.ceil(span / unit / count));

// ───────────────────────── Study-time columns ─────────────────────────

export interface DayBar {
  date: string;
  label: string;
  minutes: number;
  /** Planned minutes (null before the sprint started). */
  budget: number | null;
  answered: number;
  correct: number;
  isToday: boolean;
  /** A planned day still ahead: only its budget tick is drawn. */
  isFuture?: boolean;
  title: string;
}

export function StudyBars({ days, height = 184 }: { days: DayBar[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>(480);
  const [hover, setHover] = useState<number | null>(null);
  const m = { l: 34, r: 6, t: 22, b: 26 };
  const iw = Math.max(10, width - m.l - m.r);
  const ih = height - m.t - m.b;
  const peak = Math.max(60, ...days.map((d) => Math.max(d.minutes, d.budget ?? 0)));
  const step = niceStep(peak, 4, 60);
  const yMax = Math.ceil((peak * 1.05) / step) * step;
  const y = (v: number) => m.t + ih - (v / yMax) * ih;
  const slot = iw / days.length;
  const bw = Math.max(6, Math.min(days.length <= 7 ? 28 : 22, slot * 0.5));
  const ticks: number[] = [];
  for (let v = 0; v <= yMax; v += step) ticks.push(v);
  const every = slot < 24 ? 2 : 1;
  const hd = hover !== null ? days[hover] : null;
  const tip: TipState | null = hd
    ? {
        x: m.l + slot * (hover! + 0.5),
        y: Math.min(y(Math.max(hd.minutes, hd.budget ?? 0)), m.t + ih - 10) - 4,
        content: (
          <>
            <div className="st-tip-title">
              {hd.title}
              {hd.isFuture ? ' · 还没到' : ''}
            </div>
            {!hd.isFuture && <TipRow color="var(--mixed)" value={fmtHM(hd.minutes)} label="学习" />}
            {hd.budget !== null && <TipRow color="var(--text-2)" value={fmtHM(hd.budget)} label="计划" />}
            {hd.answered > 0 && <TipRow value={`${hd.answered} 题`} label={`正确 ${Math.round((hd.correct / hd.answered) * 100)}%`} />}
          </>
        ),
      }
    : null;

  return (
    <div className="st-chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label="每天学习时长与计划时长">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} className="st-grid" />
            <text x={m.l - 8} y={y(v)} className="st-axis" textAnchor="end" dominantBaseline="middle">
              {v === 0 ? '0' : `${v / 60}h`}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const cx0 = m.l + slot * (i + 0.5);
          const h = Math.max(0, y(0) - y(d.minutes));
          return (
            <g key={d.date} className={cx('st-bar-g', hover === i && 'is-hover', hover !== null && hover !== i && 'is-dim')}>
              {h > 0.5 && <path d={roundTop(cx0 - bw / 2, y(d.minutes), bw, h, 4)} className={cx('st-bar', d.isToday && 'is-today')} />}
              {d.budget !== null && d.budget > 0 && (
                <line x1={cx0 - bw / 2 - 4} x2={cx0 + bw / 2 + 4} y1={y(d.budget)} y2={y(d.budget)} className={cx('st-budget', d.isFuture && 'is-future')} />
              )}
              {(i % every === 0 || d.isToday) && (
                <text x={cx0} y={height - 8} className={cx('st-axis', d.isToday && 'is-strong', d.isFuture && 'is-future')} textAnchor="middle">
                  {d.label}
                </text>
              )}
              {d.isToday && d.minutes > 0 && (
                <text x={cx0} y={y(d.minutes) - 7} className="st-val" textAnchor="middle">
                  {Math.round(d.minutes)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={m.l} x2={width - m.r} y1={y(0)} y2={y(0)} className="st-baseline" />
        <rect
          x={m.l}
          y={m.t}
          width={iw}
          height={ih + m.b}
          fill="transparent"
          onPointerMove={(e) => setHover(Math.max(0, Math.min(days.length - 1, Math.floor(localX(e) / slot))))}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      <Tip tip={tip} width={width} />
    </div>
  );
}

function roundTop(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** Durations in the app's one format: "45 分钟" / "1 小时 8 分". */
export const fmtHM = fmtMinutes;

// ───────────────────────── Sparkline with hover ─────────────────────────

export interface TrendPoint {
  label: string;
  value: number;
}

export function Spark({
  points,
  color = 'var(--mixed)',
  dot,
  height = 36,
  format = (v: number) => String(Math.round(v)),
  name,
  reference,
}: {
  points: TrendPoint[];
  color?: string;
  /** Colour of the end / hover dot (defaults to the line colour). */
  dot?: string;
  height?: number;
  format?: (v: number) => string;
  name: string;
  /** Optional horizontal reference value (e.g. the starting score). */
  reference?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(120);
  const [hover, setHover] = useState<number | null>(null);
  const pad = 5;
  const vals = points.map((p) => p.value).concat(reference !== undefined ? [reference] : []);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const n = points.length;
  const x = (i: number) => pad + (n <= 1 ? (width - 2 * pad) / 2 : (i / (n - 1)) * (width - 2 * pad));
  const y = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (height - 2 * pad);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const hp = hover !== null ? points[hover] : null;
  return (
    <div className="st-chart st-spark" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={`${name}趋势：${points.map((p) => `${p.label} ${format(p.value)}`).join('，')}`}>
        {reference !== undefined && <line x1={0} x2={width} y1={y(reference)} y2={y(reference)} className="st-ref" />}
        {n > 1 && <path d={d} fill="none" style={{ stroke: color }} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={height} className="st-cross" />}
        {n > 0 && <circle cx={x(hover ?? n - 1)} cy={y(points[hover ?? n - 1].value)} r={3} style={{ fill: dot || color }} className="st-point" />}
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="transparent"
          onPointerMove={(e) => setHover(n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((localX(e) - pad) / (width - 2 * pad)) * (n - 1)))))}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hp && hover !== null && (
        <Tip
          width={width}
          tip={{
            x: x(hover),
            y: y(hp.value) - 6,
            content: <TipRow color={dot || color} value={format(hp.value)} label={hp.label} />,
          }}
        />
      )}
    </div>
  );
}

// ───────────────────────── Score bar ─────────────────────────
// The same pattern as the mock pages: a track 0…max with the predicted score as a fill and the
// target as a 2×14 tick labelled under it. The denominator of a score is always the maximum; the
// target is never a denominator. An optional start tick is drawn faint and unlabelled.

export function ScoreBar({
  value,
  max,
  target,
  start,
  tone = 'mixed',
  size = 'md',
  label,
}: {
  value: number;
  max: number;
  target: number;
  start?: number;
  /** A subject, or 'mixed' for totals. */
  tone?: string;
  size?: 'md' | 'lg';
  label: string;
}) {
  const frac = (v: number) => Math.max(0, Math.min(1, v / max));
  const tp = frac(target);
  return (
    <div
      className={cx('st-sbar', `tone-${tone}`, size === 'lg' && 'is-lg')}
      role="img"
      aria-label={`${label}预测 ${value} / ${max}，目标 ${target}${start !== undefined ? `，起点 ${start}` : ''}`}
    >
      <div className="st-sbar-track">
        <i className="st-sbar-fill" style={{ width: `${frac(value) * 100}%` }} />
      </div>
      {start !== undefined && <span className="st-sbar-start" style={{ left: `${frac(start) * 100}%` }} />}
      <span className={cx('st-sbar-target', tp > 0.84 && 'is-end', tp < 0.16 && 'is-start')} style={{ left: `${tp * 100}%` }}>
        <span>
          目标 <span className="num">{target}</span>
        </span>
      </span>
    </div>
  );
}
