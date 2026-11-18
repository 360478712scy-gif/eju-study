// Renders a coach reply (shared/coach-ui.ts) as glass cards — the app's take on GPT's inline "intelligent UI".
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { CoachBlock } from '@shared/coach-ui.ts';
import { RichText } from './RichText.tsx';
import { Button, Chip, Field, Icon, Slider, cx, type IconName } from './ui.tsx';
import './coach-blocks.css';

export interface CoachBlockLabels {
  moreHint: string;
  hintsDone: string;
  reply: string;
  replyPlaceholder: string;
  stepsShowAll: string;
  correct: string;
  tryAgain: string;
  key: string;
  trap: string;
  tip: string;
}

export interface CoachBlockActions {
  ask: (text: string) => void;
  reveal: () => void;
  practice?: (topic?: string) => void;
  note?: (topic?: string) => void;
  variant?: () => void;
}

const md = (text: string) => <RichText text={text} lang="zh" />;

export function CoachBlocks({ blocks, labels, on }: { blocks: CoachBlock[]; labels: CoachBlockLabels; on: CoachBlockActions }) {
  return (
    <div className="cb">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} labels={labels} on={on} />
      ))}
    </div>
  );
}

function BlockView({ block, labels, on }: { block: CoachBlock; labels: CoachBlockLabels; on: CoachBlockActions }) {
  switch (block.type) {
    case 'text':
      return <div className="cb-text">{md(block.md)}</div>;
    case 'hints':
      return <Hints block={block} labels={labels} />;
    case 'question':
      return <Question block={block} labels={labels} onReply={on.ask} />;
    case 'choice':
      return <Choice block={block} labels={labels} />;
    case 'steps':
      return <Steps block={block} labels={labels} />;
    case 'formula':
      return (
        <div className="cb-formula">
          <RichText text={`$$${block.tex}$$`} lang="zh" />
          {block.note && <div className="cb-formula-note">{md(block.note)}</div>}
        </div>
      );
    case 'callout': {
      const icon: IconName = block.tone === 'trap' ? 'alert' : block.tone === 'tip' ? 'bulb' : 'target';
      const tone = block.tone === 'trap' ? 'warn' : block.tone === 'tip' ? 'ok' : 'primary';
      return (
        <div className="cb-callout" data-tone={tone}>
          <span className="cb-callout-head">
            <Icon name={icon} size={14} />
            {labels[block.tone]}
          </span>
          {md(block.md)}
        </div>
      );
    }
    case 'table':
      return (
        <div className="cb-table-wrap">
          <table className="cb-table">
            <thead>
              <tr>{block.head.map((h, i) => <th key={i}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j}><RichText text={c} lang="zh" inline /></td>)}</tr>
              ))}
            </tbody>
          </table>
          {block.caption && <div className="cb-caption">{block.caption}</div>}
        </div>
      );
    case 'plot':
      return <Plot block={block} />;
    case 'widget':
      return <Widget block={block} />;
    case 'actions':
      return (
        <div className="cb-actions">
          {block.items.map((a, i) => (
            <Chip
              key={i}
              icon={a.do === 'reveal' ? 'eye' : a.do === 'practice' ? 'practice' : a.do === 'note' ? 'notes' : a.do === 'variant' ? 'refresh' : 'coach'}
              onClick={() => {
                if (a.do === 'reveal') on.reveal();
                else if (a.do === 'practice') on.practice?.(a.topic);
                else if (a.do === 'note') on.note?.(a.topic);
                else if (a.do === 'variant') on.variant?.();
                else on.ask(a.prompt || a.label);
              }}
            >
              {a.label}
            </Chip>
          ))}
        </div>
      );
    default:
      return null;
  }
}

/* ───────── progressive hints ───────── */

function Hints({ block, labels }: { block: Extract<CoachBlock, { type: 'hints' }>; labels: CoachBlockLabels }) {
  const [shown, setShown] = useState(1);
  const all = block.hints.length;
  return (
    <div className="cb-hints">
      {block.intro && <div className="cb-hints-intro">{md(block.intro)}</div>}
      <ol className="cb-hint-list">
        {block.hints.slice(0, shown).map((h, i) => (
          <li key={i} className="cb-hint">
            <span className="cb-hint-no num">{i + 1}</span>
            <div>
              <div className="cb-hint-label">{h.label}</div>
              {md(h.md)}
            </div>
          </li>
        ))}
      </ol>
      <div className="cb-hints-foot">
        <span className="cb-hint-dots" aria-hidden>
          {block.hints.map((_, i) => <span key={i} className={i < shown ? 'is-on' : undefined} />)}
        </span>
        {shown < all ? (
          <Button size="sm" variant="ghost" icon="bulb" onClick={() => setShown((n) => Math.min(all, n + 1))}>
            {labels.moreHint}
          </Button>
        ) : (
          <span className="t-3 cb-hints-done">{labels.hintsDone}</span>
        )}
      </div>
    </div>
  );
}

/* ───────── guiding question with a reply box ───────── */

function Question({ block, labels, onReply }: { block: Extract<CoachBlock, { type: 'question' }>; labels: CoachBlockLabels; onReply: (text: string) => void }) {
  const [value, setValue] = useState('');
  const [sent, setSent] = useState(false);
  const send = () => {
    const v = value.trim();
    if (!v) return;
    setSent(true);
    onReply(v);
  };
  return (
    <div className="cb-question">
      <div className="cb-question-text">
        <Icon name="help" size={16} />
        {md(block.md)}
      </div>
      {!sent && (
        <div className="cb-question-reply">
          <Field value={value} onChange={setValue} placeholder={labels.replyPlaceholder} pill onEnter={send} />
          <Button size="sm" variant="glass" onClick={send} disabled={!value.trim()}>
            {labels.reply}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ───────── self-check ───────── */

function Choice({ block, labels }: { block: Extract<CoachBlock, { type: 'choice' }>; labels: CoachBlockLabels }) {
  const [pick, setPick] = useState<number | null>(null);
  const right = pick === block.answer;
  return (
    <div className="cb-choice">
      <div className="cb-choice-q">{md(block.md)}</div>
      <div className="cb-choice-opts">
        {block.options.map((o, i) => (
          <button
            key={i}
            type="button"
            className={cx('cb-opt', pick === i && (right ? 'is-right' : 'is-wrong'), pick != null && !right && i === pick && 'is-wrong')}
            onClick={() => setPick(i)}
          >
            <span className="cb-opt-key num">{i + 1}</span>
            <span className="cb-opt-text"><RichText text={o} lang="zh" inline /></span>
          </button>
        ))}
      </div>
      {pick != null && (
        <div className={cx('cb-choice-fb', right ? 'is-right' : 'is-wrong')}>
          <b>{right ? labels.correct : labels.tryAgain}</b>
          {block.feedback[pick] && md(block.feedback[pick])}
        </div>
      )}
    </div>
  );
}

/* ───────── worked steps (only when the answer was asked for) ───────── */

function Steps({ block, labels }: { block: Extract<CoachBlock, { type: 'steps' }>; labels: CoachBlockLabels }) {
  const [open, setOpen] = useState<number[]>([0]);
  const all = open.length === block.steps.length;
  return (
    <div className="cb-steps">
      <div className="cb-steps-head">
        {block.title && <b>{block.title}</b>}
        {!all && block.steps.length > 1 && (
          <Button size="sm" variant="ghost" onClick={() => setOpen(block.steps.map((_, i) => i))}>{labels.stepsShowAll}</Button>
        )}
      </div>
      {block.steps.map((s, i) => {
        const isOpen = open.includes(i);
        return (
          <div key={i} className={cx('cb-step', isOpen && 'is-open')}>
            <button type="button" className="cb-step-head" onClick={() => setOpen(isOpen ? open.filter((x) => x !== i) : [...open, i])}>
              <span className="cb-step-no num">{i + 1}</span>
              <span className="cb-step-title">{s.title}</span>
              <Icon name={isOpen ? 'chev-up' : 'chev-down'} size={14} />
            </button>
            {isOpen && <div className="cb-step-body">{md(s.md)}</div>}
          </div>
        );
      })}
    </div>
  );
}

/* ───────── function plot with sliders ───────── */

type Fn = (vars: Record<string, number>) => number;

/** Tiny safe expression compiler: numbers, x and declared params, + - * / ^, parentheses, whitelisted functions. */
export function compileExpr(src: string, names: string[]): Fn | null {
  const FN: Record<string, (v: number) => number> = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
    exp: Math.exp, ln: Math.log, log: Math.log10, sqrt: Math.sqrt, abs: Math.abs,
  };
  const CONST: Record<string, number> = { pi: Math.PI, e: Math.E };
  const tokens = src.replace(/\s+/g, '').match(/\d+\.?\d*(?:e[+-]?\d+)?|[a-zA-Z_]\w*|[-+*/^()]/g);
  if (!tokens || tokens.join('') !== src.replace(/\s+/g, '')) return null;
  let i = 0;
  type Node = (v: Record<string, number>) => number;
  const peek = () => tokens[i];
  const take = () => tokens[i++];
  function primary(): Node {
    const t = take();
    if (t === undefined) throw new Error('end');
    if (t === '(') {
      const n = sum();
      if (take() !== ')') throw new Error(')');
      return n;
    }
    if (t === '-') {
      const n = power();
      return (v) => -n(v);
    }
    if (/^\d/.test(t)) {
      const k = Number(t);
      return () => k;
    }
    if (FN[t]) {
      if (take() !== '(') throw new Error('(');
      const a = sum();
      if (take() !== ')') throw new Error(')');
      const f = FN[t];
      return (v) => f(a(v));
    }
    if (t in CONST) {
      const k = CONST[t];
      return () => k;
    }
    if (t === 'x' || names.includes(t)) return (v) => v[t] ?? NaN;
    throw new Error('name ' + t);
  }
  function power(): Node {
    const base = primary();
    if (peek() === '^') {
      take();
      const ex = power();
      return (v) => Math.pow(base(v), ex(v));
    }
    return base;
  }
  function product(): Node {
    let n = power();
    while (peek() === '*' || peek() === '/' || (peek() && /^[\da-zA-Z(]/.test(peek()!))) {
      const op = peek() === '*' || peek() === '/' ? take() : '*';
      const r = power();
      const l = n;
      n = op === '*' ? (v) => l(v) * r(v) : (v) => l(v) / r(v);
    }
    return n;
  }
  function sum(): Node {
    let n = product();
    while (peek() === '+' || peek() === '-') {
      const op = take();
      const r = product();
      const l = n;
      n = op === '+' ? (v) => l(v) + r(v) : (v) => l(v) - r(v);
    }
    return n;
  }
  try {
    const root = sum();
    if (i !== tokens.length) return null;
    return root;
  } catch {
    return null;
  }
}

const SERIES = ['var(--c-math)', 'var(--c-chemistry)', 'var(--c-physics)', 'var(--warn)', 'var(--bad)'];

function Plot({ block }: { block: Extract<CoachBlock, { type: 'plot' }> }) {
  const names = (block.params ?? []).map((p) => p.name);
  const [vals, setVals] = useState<Record<string, number>>(() => Object.fromEntries((block.params ?? []).map((p) => [p.name, p.value])));
  const fns = useMemo(() => block.fns.map((f) => ({ ...f, fn: compileExpr(f.expr, names) })), [block.fns, names.join()]);
  const W = 320, H = 190, P = { l: 30, r: 10, t: 10, b: 22 };
  const [x0, x1] = block.x;
  const samples = useMemo(() => fns.map((f) => {
    const pts: [number, number][] = [];
    if (!f.fn) return pts;
    for (let k = 0; k <= 240; k++) {
      const x = x0 + ((x1 - x0) * k) / 240;
      const y = f.fn({ ...vals, x });
      pts.push([x, Number.isFinite(y) ? y : NaN]);
    }
    return pts;
  }), [fns, vals, x0, x1]);
  const ys = samples.flat().map((p) => p[1]).filter(Number.isFinite);
  let [y0, y1] = block.y ?? [Math.min(0, ...ys), Math.max(0, ...ys)];
  if (!(y1 > y0)) [y0, y1] = [y0 - 1, y0 + 1];
  const sx = (x: number) => P.l + ((x - x0) / (x1 - x0)) * (W - P.l - P.r);
  const sy = (y: number) => H - P.b - ((y - y0) / (y1 - y0)) * (H - P.t - P.b);
  const path = (pts: [number, number][]) => {
    let d = '';
    let pen = false;
    for (const [x, y] of pts) {
      if (!Number.isFinite(y) || y < y0 - (y1 - y0) * 2 || y > y1 + (y1 - y0) * 2) {
        pen = false;
        continue;
      }
      d += `${pen ? 'L' : 'M'}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const fmt = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : Number(n.toFixed(2)).toString());
  return (
    <div className="cb-plot">
      {block.title && <div className="cb-plot-title">{block.title}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} className="cb-plot-svg" role="img" aria-label={block.title ?? block.fns.map((f) => f.label).join(', ')}>
        {[0, 0.25, 0.5, 0.75, 1].map((r) => (
          <line key={'g' + r} className="cb-grid" x1={P.l} x2={W - P.r} y1={P.t + r * (H - P.t - P.b)} y2={P.t + r * (H - P.t - P.b)} />
        ))}
        {y0 < 0 && y1 > 0 && <line className="cb-axis" x1={P.l} x2={W - P.r} y1={sy(0)} y2={sy(0)} />}
        {x0 < 0 && x1 > 0 && <line className="cb-axis" x1={sx(0)} x2={sx(0)} y1={P.t} y2={H - P.b} />}
        <text className="cb-tick" x={P.l - 4} y={P.t + 8} textAnchor="end">{fmt(y1)}</text>
        <text className="cb-tick" x={P.l - 4} y={H - P.b} textAnchor="end">{fmt(y0)}</text>
        <text className="cb-tick" x={P.l} y={H - 6}>{fmt(x0)}</text>
        <text className="cb-tick" x={W - P.r} y={H - 6} textAnchor="end">{fmt(x1)}</text>
        {block.xLabel && <text className="cb-tick" x={(W + P.l) / 2} y={H - 6} textAnchor="middle">{block.xLabel}</text>}
        {samples.map((pts, i) => (
          <path key={i} d={path(pts)} fill="none" stroke={SERIES[i % SERIES.length]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
      </svg>
      <div className="cb-plot-legend">
        {fns.map((f, i) => (
          <span key={i} className="cb-legend">
            <span className="cb-legend-swatch" style={{ background: SERIES[i % SERIES.length] }} />
            <RichText text={f.label} lang="zh" inline />
          </span>
        ))}
      </div>
      {(block.params ?? []).map((p) => (
        <label key={p.name} className="cb-param">
          <span className="cb-param-name"><RichText text={p.label ?? `$${p.name}$`} lang="zh" inline /></span>
          <Slider value={vals[p.name]} min={p.min} max={p.max} step={p.step} label={p.label ?? p.name} onChange={(v) => setVals((o) => ({ ...o, [p.name]: v }))} />
          <span className="cb-param-val num">{fmt(vals[p.name])}</span>
        </label>
      ))}
    </div>
  );
}

/* ───────── sandboxed interactive widget ───────── */

const THEME_MAP: [string, string][] = [
  ['--background', '--glass-read'], ['--foreground', '--text'], ['--card', '--glass-card'], ['--card-foreground', '--text'],
  ['--muted', '--glass-well'], ['--muted-foreground', '--text-3'], ['--primary', '--primary'], ['--primary-foreground', '--text-on-primary'],
  ['--border', '--line'], ['--blue', '--c-math'], ['--green', '--c-chemistry'], ['--purple', '--c-physics'],
  ['--red', '--bad'], ['--orange', '--warn'], ['--yellow', '--warn'],
];

function widgetDoc(html: string, id: string) {
  const root = getComputedStyle(document.documentElement);
  const vars = THEME_MAP.map(([a, b]) => `${a}:${root.getPropertyValue(b).trim() || 'inherit'}`).join(';');
  const dark = document.documentElement.getAttribute('data-tone') !== 'light';
  const csp = "default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://esm.sh; style-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; img-src data: blob:; font-src data: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; connect-src 'none'; form-action 'none'";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}">
<style>:root{${vars};color-scheme:${dark ? 'dark' : 'light'}}*{box-sizing:border-box}html,body{margin:0;background:transparent;color:var(--foreground);font:13px/1.55 -apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans',sans-serif;-webkit-user-select:none;user-select:none}
button{font:inherit;color:var(--primary-foreground);background:var(--primary);border:0;border-radius:999px;padding:5px 12px}input[type=range]{accent-color:var(--primary)}svg{max-width:100%}</style></head>
<body>${html}<script>(function(){var send=function(){parent.postMessage({eju:'widget-size',id:${JSON.stringify(id)},h:document.documentElement.scrollHeight},'*')};new ResizeObserver(send).observe(document.body);addEventListener('load',send);document.addEventListener('contextmenu',function(e){e.preventDefault()});})();</script></body></html>`;
}

function Widget({ block }: { block: Extract<CoachBlock, { type: 'widget' }> }) {
  const id = useMemo(() => Math.random().toString(36).slice(2), []);
  const [h, setH] = useState(Math.max(120, Math.min(640, block.height || 260)));
  const ref = useRef<HTMLIFrameElement>(null);
  const doc = useMemo(() => widgetDoc(block.html, id), [block.html, id]);
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow || e.data?.eju !== 'widget-size' || e.data.id !== id) return;
      setH(Math.max(120, Math.min(640, Math.ceil(Number(e.data.h) || 0))));
    };
    addEventListener('message', on);
    return () => removeEventListener('message', on);
  }, [id]);
  return (
    <figure className="cb-widget">
      <figcaption className="cb-widget-title">
        <Icon name="sparkle" size={13} />
        {block.title}
      </figcaption>
      <iframe ref={ref} title={block.title} sandbox="allow-scripts" srcDoc={doc} style={{ height: h } as CSSProperties} />
    </figure>
  );
}
