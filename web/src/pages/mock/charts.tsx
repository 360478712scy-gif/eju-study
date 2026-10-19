// Small inline-SVG charts for the mock pages (sized to their container, themed by tokens).
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cx, fmtClock } from '../../lib/format.ts';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.max(70, Math.min(width - 70, x));
  return (
    <div className="mk-tip" style={{ left, top: y }}>
      {children}
    </div>
  );
}

// ───────────────────────── Score trend ─────────────────────────

export interface TrendPoint {
  id: string;
  label: string;
  sub: string;
  value: number;
}

export function TrendChart({ points, target, max, height = 150, onSelect }: { points: TrendPoint[]; target: number; max: number; height?: number; onSelect?: (id: string) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 34;
  const padR = 62;
  const padT = 16;
  const padB = 26;
  const values = points.map((p) => p.value);
  const lo = Math.max(0, Math.floor((Math.min(target, ...values) - 20) / 20) * 20);
  const hi = Math.min(max, Math.ceil((Math.max(target, ...values) + 20) / 20) * 20);
  const innerW = Math.max(10, width - padL - padR);
  const innerH = height - padT - padB;
  const y = (v: number) => padT + innerH * (1 - (v - lo) / Math.max(1, hi - lo));
  const x = (i: number) => (points.length === 1 ? padL + innerW / 2 : padL + (innerW * i) / (points.length - 1));
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = points.length > 1 ? `${line} L${x(points.length - 1).toFixed(1)},${padT + innerH} L${x(0).toFixed(1)},${padT + innerH} Z` : '';
  const last = points.length - 1;
  const slot = points.length > 1 ? innerW / (points.length - 1) : innerW;
  const showX = (i: number) => points.length <= 7 || i === 0 || i === last;

  return (
    <div className="mk-chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="估分趋势">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width - padR + 8} y1={y(t)} y2={y(t)} className="mk-grid" />
              <text x={padL - 8} y={y(t) + 4} className="mk-axis" textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          <line x1={padL} x2={width - padR + 8} y1={y(target)} y2={y(target)} className="mk-target" />
          <text x={width - padR + 12} y={y(target) + 4} className="mk-target-label">
            目标 {target}
          </text>
          {area && <path d={area} className="mk-area" />}
          {points.length > 1 && <path d={line} className="mk-line" />}
          {points.map((p, i) => (
            <circle key={p.id} cx={x(i)} cy={y(p.value)} r={hover === i ? 6 : 4.5} className="mk-dot" />
          ))}
          {last >= 0 && (
            <text x={x(last)} y={y(points[last].value) - 11} className="mk-value" textAnchor="middle">
              {points[last].value}
            </text>
          )}
          {points.map(
            (p, i) =>
              showX(i) && (
                <text key={p.id} x={x(i)} y={height - 6} className="mk-axis" textAnchor="middle">
                  {p.label}
                </text>
              ),
          )}
          {points.map((p, i) => (
            <rect
              key={p.id}
              x={x(i) - slot / 2}
              y={padT - 8}
              width={slot}
              height={innerH + 16}
              fill="transparent"
              style={{ cursor: onSelect ? 'pointer' : undefined }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect?.(p.id)}
            />
          ))}
        </svg>
      )}
      {hover !== null && points[hover] && (
        <Tooltip x={x(hover)} y={y(points[hover].value) - 14} width={width}>
          <b className="num">{points[hover].value}</b>
          <span>{points[hover].sub}</span>
        </Tooltip>
      )}
    </div>
  );
}

// ───────────────────────── Time per item ─────────────────────────

export interface TimeBar {
  id: string;
  label: string;
  group: string;
  seconds: number;
  target: number;
  result: string;
}

export const isSlow = (b: { seconds: number; target: number }) => b.seconds > b.target * 1.5 && b.seconds - b.target >= 30;

export function TimeBars({ bars, height = 170, onSelect }: { bars: TimeBar[]; height?: number; onSelect?: (id: string) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 38;
  const padR = 8;
  const padT = 22;
  const padB = 8;
  const innerW = Math.max(10, width - padL - padR);
  const innerH = height - padT - padB;
  const peak = Math.max(30, ...bars.map((b) => Math.max(b.seconds, b.target)));
  // Nice tops whose middle tick is a whole minute (or 30 s for the 1-minute top).
  const top = [60, 120, 240, 360, 480, 600, 720, 960, 1200, 1800, 2400, 3600].find((t) => t >= peak * 1.05) ?? Math.ceil(peak / 600) * 600;
  const y = (s: number) => padT + innerH * (1 - Math.min(s, top) / top);
  const slot = innerW / Math.max(1, bars.length);
  const bw = Math.max(3, Math.min(18, slot - 2));
  const midX = (i: number) => padL + slot * i + slot / 2;
  const ticks = [0, top / 2, top];
  const groups: { name: string; from: number }[] = [];
  bars.forEach((b, i) => {
    if (!groups.length || groups[groups.length - 1].name !== b.group) groups.push({ name: b.group, from: i });
  });

  return (
    <div className="mk-chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="每题用时">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} className="mk-grid" />
              <text x={padL - 8} y={y(t) + 4} className="mk-axis" textAnchor="end">
                {t === 0 ? '0' : t < 60 ? `${t}秒` : `${Math.round(t / 60)}分`}
              </text>
            </g>
          ))}
          {groups.length > 1 &&
            groups.map((g, gi) => (
              <g key={g.name}>
                {gi > 0 && <line x1={padL + slot * g.from} x2={padL + slot * g.from} y1={padT - 16} y2={padT + innerH} className="mk-sep" />}
                <text x={padL + slot * g.from + 4} y={padT - 8} className="mk-axis">
                  {g.name}
                </text>
              </g>
            ))}
          {bars.map((b, i) => {
            const h = Math.max(b.seconds > 0 ? 2 : 0, padT + innerH - y(b.seconds));
            const x0 = midX(i) - bw / 2;
            const y0 = padT + innerH - h;
            const r = Math.min(3, bw / 2, h);
            const d = h > 0 ? `M${x0},${y0 + h} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + bw - r} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r} V${y0 + h} Z` : '';
            return (
              <g key={b.id} className={cx(isSlow(b) ? 'is-slow' : undefined, hover === i ? 'is-hover' : undefined)}>
                {d && <path d={d} className="mk-bar" />}
                <line x1={midX(i) - bw / 2 - 1} x2={midX(i) + bw / 2 + 1} y1={y(b.target)} y2={y(b.target)} className="mk-tick" />
              </g>
            );
          })}
          {bars.map((b, i) => (
            <rect
              key={b.id}
              x={padL + slot * i}
              y={padT}
              width={slot}
              height={innerH}
              fill="transparent"
              style={{ cursor: onSelect ? 'pointer' : undefined }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect?.(b.id)}
            />
          ))}
        </svg>
      )}
      {hover !== null && bars[hover] && (
        <Tooltip x={midX(hover)} y={y(Math.max(bars[hover].seconds, bars[hover].target)) - 10} width={width}>
          <b>{bars[hover].label}</b>
          <span className="num">
            用时 {fmtClock(bars[hover].seconds)} · 目标 {fmtClock(bars[hover].target)}
          </span>
          <span>{bars[hover].result}</span>
        </Tooltip>
      )}
    </div>
  );
}
