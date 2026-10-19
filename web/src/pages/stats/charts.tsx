// Hand-written inline SVG charts for the stats page. Colors come from CSS variables so
// every chart follows the light/dark theme. Each chart measures its container and draws
// in real pixels so text stays crisp; hover shows a small tooltip.
import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { cx } from '../../lib/format.ts';

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
  title: string;
}

export function StudyBars({ days, height = 210 }: { days: DayBar[]; height?: number }) {
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
  const bw = Math.max(6, Math.min(22, slot * 0.6));
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
            <div className="st-tip-title">{hd.title}</div>
            <TipRow color="var(--primary)" value={fmtHM(hd.minutes)} label="学习" />
            {hd.budget !== null && <TipRow color="var(--text-2)" value={fmtHM(hd.budget)} label="计划" />}
            {hd.answered > 0 && <TipRow value={`${hd.answered} 题`} label={`正确 ${Math.round((hd.correct / hd.answered) * 100)}%`} />}
          </>
        ),
      }
    : null;

  return (
    <div className="st-chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label="最近 14 天每天学习分钟数与计划时长">
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
              {d.budget !== null && d.budget > 0 && <line x1={cx0 - bw / 2 - 4} x2={cx0 + bw / 2 + 4} y1={y(d.budget)} y2={y(d.budget)} className="st-budget" />}
              {(i % every === 0 || d.isToday) && (
                <text x={cx0} y={height - 8} className={cx('st-axis', d.isToday && 'is-strong')} textAnchor="middle">
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

export function fmtHM(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} 分`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} 时 ${r} 分` : `${h} 小时`;
}

// ───────────────────────── Small line chart (accuracy) ─────────────────────────

export interface LinePoint {
  date: string;
  label: string;
  value: number | null;
  n: number;
}

export function MiniLine({ points, target, color, height = 128, name }: { points: LinePoint[]; target: number; color: string; height?: number; name: string }) {
  const [ref, width] = useWidth<HTMLDivElement>(220);
  const [hover, setHover] = useState<number | null>(null);
  const m = { l: 32, r: 8, t: 10, b: 20 };
  const iw = Math.max(10, width - m.l - m.r);
  const ih = height - m.t - m.b;
  const n = points.length;
  const x = (i: number) => m.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => m.t + ih - v * ih;
  const real = points.map((p, i) => ({ ...p, i })).filter((p): p is LinePoint & { i: number; value: number } => p.value !== null);
  const d = real.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const area = real.length > 1 ? `${d}L${x(real[real.length - 1].i).toFixed(1)},${y(0)}L${x(real[0].i).toFixed(1)},${y(0)}Z` : '';
  const hp = hover !== null ? points[hover] : null;
  const tip: TipState | null =
    hp && hover !== null
      ? {
          x: x(hover),
          y: hp.value !== null ? y(hp.value) - 8 : m.t + ih / 2,
          content: (
            <>
              <div className="st-tip-title">{hp.label}</div>
              {hp.value !== null ? (
                <TipRow color={color} value={`${Math.round(hp.value * 100)}%`} label={`${name} · ${hp.n} 题`} />
              ) : (
                <span className="st-tip-dim">这天没做{name}</span>
              )}
            </>
          ),
        }
      : null;
  return (
    <div className="st-chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={`${name}每日正确率`}>
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} className="st-grid" />
            <text x={m.l - 6} y={y(v)} className="st-axis" textAnchor="end" dominantBaseline="middle">
              {v * 100}%
            </text>
          </g>
        ))}
        <line x1={m.l} x2={width - m.r} y1={y(target)} y2={y(target)} className="st-target" />
        <text x={width - m.r} y={y(target) - 4} className="st-axis" textAnchor="end">
          目标 {Math.round(target * 100)}%
        </text>
        {area && <path d={area} style={{ fill: color }} opacity={0.1} />}
        {d && <path d={d} fill="none" style={{ stroke: color }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + ih} className="st-cross" />}
        {real.map((p) => (
          <circle key={p.date} cx={x(p.i)} cy={y(p.value)} r={hover === p.i ? 5 : 4} style={{ fill: color }} className="st-dot" />
        ))}
        {n > 0 && (
          <>
            <text x={x(0)} y={height - 5} className="st-axis" textAnchor={n > 1 ? 'start' : 'middle'}>
              {points[0].label}
            </text>
            {n > 1 && (
              <text x={x(n - 1)} y={height - 5} className="st-axis" textAnchor="end">
                {points[n - 1].label}
              </text>
            )}
          </>
        )}
        <rect
          x={m.l - 6}
          y={0}
          width={iw + 12}
          height={height}
          fill="transparent"
          onPointerMove={(e) => {
            const px = localX(e) - 6;
            setHover(n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round((px / iw) * (n - 1)))));
          }}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {real.length === 0 && <div className="st-chart-empty">还没有{name}作答</div>}
      <Tip tip={tip} width={width} />
    </div>
  );
}

// ───────────────────────── Sparkline with hover ─────────────────────────

export interface TrendPoint {
  label: string;
  value: number;
}

export function Spark({
  points,
  color = 'var(--primary)',
  height = 36,
  format = (v: number) => String(Math.round(v)),
  name,
  reference,
}: {
  points: TrendPoint[];
  color?: string;
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
  const area = n > 1 ? `${d}L${x(n - 1).toFixed(1)},${height}L${x(0).toFixed(1)},${height}Z` : '';
  const hp = hover !== null ? points[hover] : null;
  return (
    <div className="st-chart st-spark" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={`${name}趋势：${points.map((p) => `${p.label} ${format(p.value)}`).join('，')}`}>
        {reference !== undefined && <line x1={0} x2={width} y1={y(reference)} y2={y(reference)} className="st-grid" />}
        {area && <path d={area} style={{ fill: color }} opacity={0.1} />}
        {n > 1 && <path d={d} fill="none" style={{ stroke: color }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={height} className="st-cross" />}
        {n > 0 && <circle cx={x(hover ?? n - 1)} cy={y(points[hover ?? n - 1].value)} r={4} style={{ fill: color }} className="st-dot" />}
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
            content: <TipRow color={color} value={format(hp.value)} label={hp.label} />,
          }}
        />
      )}
    </div>
  );
}

// ───────────────────────── Score gauge / bullet ─────────────────────────

export function ScoreBar({
  estimate,
  low,
  high,
  baseline,
  target,
  max,
  color = 'var(--primary)',
  size = 'sm',
  name,
}: {
  estimate: number;
  low: number;
  high: number;
  baseline: number;
  target: number;
  max: number;
  color?: string;
  size?: 'sm' | 'lg';
  name: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(240);
  const big = size === 'lg';
  const span = Math.max(target, high, estimate) - Math.min(baseline, low, estimate);
  const pad = Math.max(span * 0.18, max * (big ? 0.012 : 0.04));
  const lo = Math.max(0, Math.floor((Math.min(baseline, low, estimate) - pad) / 5) * 5);
  const hi = Math.min(max, Math.ceil((Math.max(target, high, estimate) + pad) / 5) * 5);
  const ml = 6;
  const mr = 6;
  const iw = Math.max(10, width - ml - mr);
  const x = (v: number) => ml + ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo || 1)) * iw;
  const barY = big ? 26 : 8;
  const barH = big ? 14 : 8;
  const height = big ? 76 : 46;
  const labelY = barY + barH + (big ? 20 : 16);
  const reached = estimate >= target;
  // Keep the two tick labels apart when baseline and target sit close together.
  const xb = x(baseline);
  const xt = x(target);
  const close = Math.abs(xt - xb) < (big ? 84 : 70);
  const mid = (xb + xt) / 2;
  const baseLabel = close ? { x: mid - 4, anchor: 'end' as const } : { x: xb, anchor: anchorFor(xb, width) };
  const targetLabel = close ? { x: mid + 4, anchor: 'start' as const } : { x: xt, anchor: anchorFor(xt, width) };
  return (
    <div className="st-chart" ref={ref}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${name}预测 ${estimate}（约 ${low}–${high}），起点 ${baseline}，目标 ${target}`}
        className={cx('st-score', big && 'is-big')}
      >
        <rect x={ml} y={barY} width={iw} height={barH} rx={barH / 2} className="st-track" />
        <rect x={x(low)} y={barY} width={Math.max(2, x(high) - x(low))} height={barH} rx={barH / 2} style={{ fill: color }} opacity={0.18} />
        <rect x={ml} y={barY} width={Math.max(barH, x(estimate) - ml)} height={barH} rx={barH / 2} style={{ fill: color }} />
        <line x1={x(baseline)} x2={x(baseline)} y1={barY - 4} y2={barY + barH + 4} className="st-mark-base" />
        <line x1={x(target)} x2={x(target)} y1={barY - (big ? 8 : 4)} y2={barY + barH + 4} className={cx('st-mark-target', reached && 'is-reached')} />
        {big && <path d={flagPath(x(target), barY - 8)} className={cx('st-flag', reached && 'is-reached')} />}
        <circle cx={x(estimate)} cy={barY + barH / 2} r={big ? 8 : 5.5} style={{ fill: color }} className="st-dot" />
        {big && (
          <text x={x(estimate)} y={barY - 10} textAnchor={x(estimate) > width - 60 ? 'end' : 'middle'} className="st-val">
            预测 {estimate}
          </text>
        )}
        <text x={baseLabel.x} y={labelY} textAnchor={baseLabel.anchor} className="st-axis">
          起点 {baseline}
        </text>
        <text x={targetLabel.x} y={labelY} textAnchor={targetLabel.anchor} className="st-axis is-strong">
          目标 {target}
        </text>
        {big && (
          <>
            <text x={ml} y={labelY} className="st-axis is-faint" textAnchor="start">
              {x(baseline) - ml > 54 ? lo : ''}
            </text>
            <text x={width - mr} y={labelY} className="st-axis is-faint" textAnchor="end">
              {width - mr - x(target) > 54 ? hi : ''}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

function anchorFor(px: number, width: number): 'start' | 'middle' | 'end' {
  if (px < 30) return 'start';
  if (px > width - 30) return 'end';
  return 'middle';
}

function flagPath(x: number, top: number): string {
  return `M${x},${top}V${top - 12}L${x + 10},${top - 8}L${x},${top - 4}Z`;
}

// ───────────────────────── Pace dot plot ─────────────────────────

const PACE_LO = 0.5;
const PACE_HI = 2.5;

export function PaceDot({ ratio, color, name }: { ratio: number | null; color: string; name: string }) {
  const [ref, width] = useWidth<HTMLDivElement>(260);
  const h = 34;
  const ml = 8;
  const mr = 8;
  const iw = Math.max(10, width - ml - mr);
  const lx = (v: number) => ml + ((Math.log(Math.max(PACE_LO, Math.min(PACE_HI, v))) - Math.log(PACE_LO)) / (Math.log(PACE_HI) - Math.log(PACE_LO))) * iw;
  const cy = 20;
  return (
    <div className="st-chart" ref={ref}>
      <svg width={width} height={h} role="img" aria-label={ratio === null ? `${name}暂无用时数据` : `${name}用时是考场节奏的 ${ratio.toFixed(2)} 倍`}>
        <rect x={lx(0.85)} y={cy - 9} width={lx(1.15) - lx(0.85)} height={18} rx={4} className="st-band" />
        <line x1={ml} x2={width - mr} y1={cy} y2={cy} className="st-grid" />
        {[0.5, 1.5, 2].map((v) => (
          <line key={v} x1={lx(v)} x2={lx(v)} y1={cy - 3} y2={cy + 3} className="st-grid" />
        ))}
        <line x1={lx(1)} x2={lx(1)} y1={cy - 11} y2={cy + 11} className="st-mark-base" />
        {ratio !== null && (
          <>
            <line x1={lx(1)} x2={lx(ratio)} y1={cy} y2={cy} style={{ stroke: color }} strokeWidth={2} strokeLinecap="round" />
            <circle cx={lx(ratio)} cy={cy} r={6} style={{ fill: color }} className="st-dot" />
            <text x={lx(ratio)} y={cy - 11} textAnchor={lx(ratio) > width - 24 ? 'end' : 'middle'} className="st-val is-sm">
              {ratio >= PACE_HI ? `>${PACE_HI}` : ratio.toFixed(1)}×
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

export function PaceAxis() {
  const [ref, width] = useWidth<HTMLDivElement>(260);
  const ml = 8;
  const mr = 8;
  const iw = Math.max(10, width - ml - mr);
  const lx = (v: number) => ml + ((Math.log(v) - Math.log(PACE_LO)) / (Math.log(PACE_HI) - Math.log(PACE_LO))) * iw;
  return (
    <div className="st-chart" ref={ref}>
      <svg width={width} height={18} aria-hidden>
        {[0.5, 1, 1.5, 2].map((v) => (
          <text key={v} x={lx(v)} y={12} textAnchor={v === 0.5 ? 'start' : 'middle'} className={cx('st-axis', v === 1 && 'is-strong')}>
            {v === 1 ? '考场节奏' : `${v}×`}
          </text>
        ))}
      </svg>
    </div>
  );
}
