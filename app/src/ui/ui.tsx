// 澄学 3.0 primitives. Pages compose these; they never restyle them.
// All user-facing words come from props (pages take them from copy/zh.ts).
import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  createElement,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './icons.tsx';
import './ui.css';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export type Tone = 'math' | 'physics' | 'chemistry' | 'school' | 'primary' | 'ok' | 'bad' | 'warn' | 'neutral';
export type Subject = 'math' | 'physics' | 'chemistry';

/* ───────── materials ───────── */

export function Glass({
  as = 'div',
  kind = 'panel',
  className,
  style,
  children,
  ...rest
}: {
  as?: string;
  kind?: 'panel' | 'float' | 'read' | 'card' | 'well';
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  [k: string]: unknown;
}) {
  const k = { panel: 'glass', float: 'glass-float', read: 'glass-read', card: 'card', well: 'well' }[kind];
  return createElement(as, { className: cx(k, className), style, ...rest }, children);
}

export function Card({
  children,
  className,
  pad = true,
  onClick,
  style,
  title,
  actions,
  sub,
}: {
  children?: ReactNode;
  className?: string;
  pad?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
  title?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={cx('card', pad && 'card-pad', onClick && 'is-interactive', className)} onClick={onClick} style={style}>
      {(title || actions) && (
        <div className="hstack" style={{ marginBottom: 14, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {title && <div className="sec-title">{title}</div>}
            {sub && <div className="sec-desc" style={{ marginTop: 2 }}>{sub}</div>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </Tag>
  );
}

/* ───────── buttons ───────── */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'glass' | 'ghost' | 'danger' | 'ok';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  iconRight?: IconName;
  kbd?: string;
  block?: boolean;
  square?: boolean;
  loading?: boolean;
};

export function Button({ variant = 'glass', size = 'md', icon, iconRight, kbd, block, square, loading, className, children, ...rest }: BtnProps) {
  const is = size === 'sm' ? 15 : size === 'lg' ? 19 : 17;
  return (
    <button
      type="button"
      className={cx('btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, block && 'btn-block', square && 'btn-square', className)}
      {...rest}
    >
      {loading ? <span className="spinner" /> : icon && <Icon name={icon} size={is} />}
      {children}
      {iconRight && <Icon name={iconRight} size={is} />}
      {kbd && <Kbd>{kbd}</Kbd>}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  size = 'md',
  on,
  glass,
  kbd,
  tipSide = 'top',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconName;
  label: string;
  size?: 'sm' | 'md' | 'lg';
  on?: boolean;
  glass?: boolean;
  kbd?: string;
  tipSide?: 'top' | 'bottom' | 'left' | 'right';
}) {
  const is = size === 'sm' ? 15 : size === 'lg' ? 21 : 18;
  return (
    <Tooltip label={label} kbd={kbd} side={tipSide}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={on}
        className={cx('icon-btn', size !== 'md' && `icon-btn-${size}`, on && 'is-on', glass && 'is-glass', className)}
        {...rest}
      >
        <Icon name={icon} size={is} />
      </button>
    </Tooltip>
  );
}

export function RoundPlay({
  playing,
  onClick,
  label,
  size = 52,
  primary,
}: {
  playing?: boolean;
  onClick?: () => void;
  label: string;
  size?: number;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      className={cx('round-play', primary && 'is-primary', playing && 'is-pause')}
      style={{ '--s': `${size}px` } as CSSProperties}
      aria-label={label}
      onClick={onClick}
    >
      <Icon name={playing ? 'pause' : 'play'} size={Math.round(size * 0.4)} />
    </button>
  );
}

/* ───────── chips, badges ───────── */

export function Chip({
  children,
  tone,
  icon,
  sm,
  onClick,
  selected,
  title,
}: {
  children?: ReactNode;
  tone?: Tone;
  icon?: IconName;
  sm?: boolean;
  onClick?: () => void;
  selected?: boolean;
  title?: string;
}) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      className={cx('chip', sm && 'is-sm', onClick && 'is-button', selected && 'is-selected')}
      data-tone={tone}
      onClick={onClick}
      aria-pressed={onClick ? !!selected : undefined}
      title={title}
    >
      {icon && <Icon name={icon} size={sm ? 12 : 14} />}
      {children}
    </Tag>
  );
}

export function Badge({ children, tone }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className="badge num" data-tone={tone}>
      {children}
    </span>
  );
}

export function Dot({ tone }: { tone?: Tone }) {
  return <span className="dot" data-tone={tone} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

const SUBJECT_ICON: Record<string, IconName> = { math: 'math', physics: 'physics', chemistry: 'chemistry', school: 'school', mixed: 'mixed' };

export function SubjectGlyph({ subject, size = 'md' }: { subject: Subject | 'school' | 'mixed'; size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'sm' ? 14 : size === 'lg' ? 22 : 18;
  return (
    <span className={cx('glyph', size !== 'md' && `is-${size}`)} data-tone={subject === 'mixed' ? 'neutral' : subject}>
      <Icon name={SUBJECT_ICON[subject] ?? 'mixed'} size={s} />
    </span>
  );
}

/* ───────── segmented, tabs ───────── */

export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: IconName;
  count?: number;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegOption<T>[];
  size?: 'md' | 'lg';
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('.seg-item.is-on');
    if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value, options.length]);
  return (
    <div ref={ref} className={cx('seg', size === 'lg' && 'seg-lg')} role="radiogroup" aria-label={label}>
      {thumb && <span className="seg-thumb" style={thumb} />}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={cx('seg-item', o.value === value && 'is-on')}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} size={size === 'lg' ? 17 : 15} />}
          {o.label}
          {o.count != null && <span className="seg-count num">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: SegOption<T>[] }) {
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={cx('tab', o.value === value && 'is-on')} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count != null && <span className="seg-count num" style={{ marginLeft: 6 }}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ───────── progress ───────── */

export function Bar({ value, max = 1, tone, mark, thin, label }: { value: number; max?: number; tone?: Tone; mark?: number; thin?: boolean; label?: string }) {
  const p = Math.max(0, Math.min(1, max ? value / max : 0));
  return (
    <div className={cx('bar', thin && 'is-thin')} data-tone={tone} role="progressbar" aria-label={label} aria-valuenow={Math.round(p * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="bar-fill" style={{ width: `${p * 100}%` }} />
      {mark != null && <div className="bar-mark" style={{ left: `calc(${Math.min(1, mark / max) * 100}% - 1px)` }} />}
    </div>
  );
}

export function Ring({ value, max = 1, size = 44, stroke = 4, tone, children }: { value: number; max?: number; size?: number; stroke?: number; tone?: Tone; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, max ? value / max : 0));
  return (
    <span className="ring" style={{ width: size, height: size }} data-tone={tone}>
      <svg width={size} height={size}>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle className="ring-fill" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)} />
      </svg>
      {children}
    </span>
  );
}

/** The frosted orb with a ring of radial ticks — the visual centre of 今天. `ticks` = total, `lit` = done, `now` = current index. */
export function Orb({
  size = 220,
  ticks = 120,
  lit = 0,
  now,
  value,
  unit,
  children,
}: {
  size?: number;
  ticks?: number;
  lit?: number;
  now?: number;
  value?: ReactNode;
  unit?: ReactNode;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) / window.innerWidth;
      const y = (e.clientY - (r.top + r.height / 2)) / window.innerHeight;
      el.style.setProperty('--hx', String(Math.max(-1, Math.min(1, x * 2))));
      el.style.setProperty('--hy', String(Math.max(-1, Math.min(1, y * 2))));
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, []);
  const outer = size * 1.42;
  const c = outer / 2;
  const r1 = size / 2 + size * 0.1;
  const r2 = r1 + size * 0.075;
  const lines = [];
  for (let i = 0; i < ticks; i++) {
    const a = (i / ticks) * Math.PI * 2 - Math.PI / 2;
    const long = i % 10 === 0;
    const rr2 = long ? r2 + size * 0.025 : r2;
    lines.push(
      <line
        key={i}
        x1={c + Math.cos(a) * r1}
        y1={c + Math.sin(a) * r1}
        x2={c + Math.cos(a) * rr2}
        y2={c + Math.sin(a) * rr2}
        className={i === now ? 'is-now' : i < lit ? 'is-on' : undefined}
        style={{ transitionDelay: `${Math.min(i, 60) * 6}ms` }}
      />,
    );
  }
  return (
    <div className="orb-wrap" ref={ref} style={{ width: outer, height: outer }}>
      <svg className="orb-ticks" width={outer} height={outer} viewBox={`0 0 ${outer} ${outer}`} aria-hidden>
        {lines}
      </svg>
      <div className="orb" style={{ width: size, height: size }}>
        <div className="orb-label">
          {value != null && <div className="orb-value">{value}</div>}
          {unit != null && <span className="orb-unit">{unit}</span>}
          {children}
        </div>
      </div>
    </div>
  );
}

/* ───────── stat ───────── */

export function Stat({ label, value, unit, sub, icon, lg }: { label: ReactNode; value: ReactNode; unit?: ReactNode; sub?: ReactNode; icon?: IconName; lg?: boolean }) {
  return (
    <div className={cx('stat', lg && 'is-lg')}>
      <div className="stat-label">
        {icon && <Icon name={icon} size={14} />}
        {label}
      </div>
      <div className="stat-value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/* ───────── rows ───────── */

export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('list', className)}>{children}</div>;
}

export function Row({
  lead,
  index,
  title,
  meta,
  trail,
  hover,
  current,
  done,
  onClick,
  chevron,
}: {
  lead?: ReactNode;
  index?: number;
  title: ReactNode;
  meta?: ReactNode[];
  trail?: ReactNode;
  hover?: ReactNode;
  current?: boolean;
  done?: boolean;
  onClick?: () => void;
  chevron?: boolean;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} className={cx('row', current && 'is-current', done && 'is-done')} onClick={onClick} aria-current={current ? 'step' : undefined}>
      {index != null && <span className="row-index">{index}</span>}
      {lead && <span className="row-lead">{lead}</span>}
      <span className="row-main">
        <span className="row-title" style={{ display: 'block' }}>
          {title}
        </span>
        {meta && meta.length > 0 && (
          <span className="row-meta">
            {meta.filter(Boolean).map((m, i) => (
              <span key={i}>{m}</span>
            ))}
          </span>
        )}
      </span>
      {(trail || hover || chevron) && (
        <span className="row-trail">
          {hover && <span className="row-hover">{hover}</span>}
          {trail}
          {chevron && <Icon name="chev-right" size={16} />}
        </span>
      )}
    </Tag>
  );
}

/* ───────── form controls ───────── */

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={cx('toggle', on && 'is-on')} onClick={() => onChange(!on)} />;
}

export function Slider({ value, min = 0, max = 1, step = 0.01, onChange, label }: { value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void; label: string }) {
  const p = ((value - min) / (max - min)) * 100;
  return (
    <input
      className="slider"
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      style={{ '--p': `${p}%` } as CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

export function Field({
  value,
  onChange,
  placeholder,
  icon,
  pill,
  kbd,
  autoFocus,
  onEnter,
  type = 'text',
  inputRef,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon?: IconName;
  pill?: boolean;
  kbd?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
  type?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  style?: CSSProperties;
}) {
  return (
    <label className={cx('field', pill && 'is-pill')} style={style}>
      {icon && <Icon name={icon} size={16} />}
      <input
        ref={inputRef}
        type={type}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) onEnter();
        }}
      />
      {kbd && <Kbd>{kbd}</Kbd>}
    </label>
  );
}

export function TextArea({ value, onChange, placeholder, rows = 4, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; autoFocus?: boolean }) {
  return (
    <label className="field is-area">
      <textarea value={value} rows={rows} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/* ───────── tooltip ───────── */

export function Tooltip({ label, kbd, side = 'top', children }: { label: ReactNode; kbd?: string; side?: 'top' | 'bottom' | 'left' | 'right'; children: ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = () => {
    timer.current = setTimeout(() => {
      const el = ref.current?.firstElementChild as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const p =
        side === 'top'
          ? { x: r.left + r.width / 2, y: r.top - 8 }
          : side === 'bottom'
            ? { x: r.left + r.width / 2, y: r.bottom + 8 }
            : side === 'left'
              ? { x: r.left - 8, y: r.top + r.height / 2 }
              : { x: r.right + 8, y: r.top + r.height / 2 };
      setPos(p);
    }, 420);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setPos(null);
  };
  const tf = { top: 'translate(-50%,-100%)', bottom: 'translate(-50%,0)', left: 'translate(-100%,-50%)', right: 'translate(0,-50%)' }[side];
  return (
    <span ref={ref} style={{ display: 'contents' }} onPointerEnter={show} onPointerLeave={hide} onPointerDown={hide} onFocus={show} onBlur={hide}>
      {children}
      {pos &&
        createPortal(
          <span className="tooltip" style={{ left: pos.x, top: pos.y, transform: tf }}>
            {label}
            {kbd && <Kbd>{kbd}</Kbd>}
          </span>,
          document.body,
        )}
    </span>
  );
}

/* ───────── modal, sheet ───────── */

export function Modal({
  open,
  onClose,
  title,
  icon,
  children,
  footer,
  width,
  closeLabel,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
  closeLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>('[autofocus],[data-autofocus]') ?? ref.current;
      el?.focus();
    }, 20);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', key, true);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" className="glass-float modal" style={{ '--w': width ? `${width}px` : undefined } as CSSProperties}>
        {(title || icon) && (
          <div className="modal-head">
            {icon}
            <h2 className="modal-title">{title}</h2>
            <IconButton icon="close" label={closeLabel} size="sm" onClick={onClose} />
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Sheet({ open, onClose, children, width, label }: { open: boolean; onClose: () => void; children: ReactNode; width?: number; label: string }) {
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <aside className="glass-float sheet" role="complementary" aria-label={label} style={{ '--w': width ? `${width}px` : undefined } as CSSProperties}>
      {children}
    </aside>,
    document.body,
  );
}

/* ───────── toast ───────── */

type ToastItem = { id: number; text: ReactNode; tone: Tone; icon: IconName };
let toasts: ToastItem[] = [];
const toastSubs = new Set<() => void>();
let toastId = 0;
export function toast(text: ReactNode, tone: Tone = 'primary', icon: IconName = tone === 'ok' ? 'check' : tone === 'bad' || tone === 'warn' ? 'alert' : 'info') {
  const id = ++toastId;
  toasts = [...toasts, { id, text, tone, icon }];
  toastSubs.forEach((f) => f());
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    toastSubs.forEach((f) => f());
  }, 3200);
}
export function Toaster() {
  const list = useSyncExternalStore(
    (f) => {
      toastSubs.add(f);
      return () => toastSubs.delete(f);
    },
    () => toasts,
  );
  return createPortal(
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="glass-float toast" data-tone={t.tone}>
          <Icon name={t.icon} size={16} />
          {t.text}
        </div>
      ))}
    </div>,
    document.body,
  );
}

/* ───────── empty, skeleton, spinner ───────── */

export function Empty({ icon = 'sparkle', title, desc, action }: { icon?: IconName; title: ReactNode; desc?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={24} />
      </div>
      <div className="empty-title">{title}</div>
      {desc && <div className="empty-desc">{desc}</div>}
      {action}
    </div>
  );
}

export function Skeleton({ w = '100%', h = 14, r }: { w?: number | string; h?: number; r?: number }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: r }} />;
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spinner" style={{ '--s': `${size}px` } as CSSProperties} />;
}

/** Thin ticked ring that turns while the assistant is thinking. */
export function ThinkRing({ size = 22 }: { size?: number }) {
  const n = 24;
  return (
    <svg className="think-ring" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        return <line key={i} x1={12 + Math.cos(a) * 7.5} y1={12 + Math.sin(a) * 7.5} x2={12 + Math.cos(a) * 10.5} y2={12 + Math.sin(a) * 10.5} stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" opacity={0.15 + (i / n) * 0.85} />;
      })}
    </svg>
  );
}

/* ───────── sections ───────── */

export function Section({ title, desc, actions, children, className }: { title?: ReactNode; desc?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('sec', className)}>
      {(title || actions) && (
        <div className="sec-head">
          {title && <h3 className="sec-title">{title}</h3>}
          {desc && <span className="sec-desc">{desc}</span>}
          {actions && <div className="sec-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/* ───────── mastery tile ───────── */

export function MasteryTile({
  name,
  ja,
  mastery,
  tone,
  weak,
  selected,
  foot,
  onClick,
}: {
  name: ReactNode;
  ja?: ReactNode;
  mastery: number;
  tone?: Tone;
  weak?: boolean;
  selected?: boolean;
  foot?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button type="button" className={cx('mtile', selected && 'is-selected')} data-tone={tone} style={{ '--m': Math.max(0.04, Math.min(1, mastery)) } as CSSProperties} onClick={onClick}>
      {weak && <span className="mtile-weak" />}
      <span className="mtile-name">{name}</span>
      {ja && <span className="mtile-ja ja">{ja}</span>}
      {foot && <span className="mtile-foot">{foot}</span>}
    </button>
  );
}

export { Icon, cx };
export type { IconName };
