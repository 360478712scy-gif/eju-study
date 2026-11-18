// Small design-system primitives. Styles live in ./ui.css; rules for using them in web/DESIGN.md.
import {
  cloneElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon, SUBJECT_ICON, type IconName } from './Icon.tsx';
import { cx, SUBJECT_NAME } from '../lib/format.ts';
import type { Subject } from '@shared/types.ts';
import './ui.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft' | 'success';

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  loading,
  block,
  className,
  children,
  onBlur,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  block?: boolean;
}) {
  return (
    <button
      type="button"
      className={cx('btn', `btn-${variant}`, `btn-${size}`, block && 'btn-block', loading && 'is-loading', className)}
      disabled={rest.disabled || loading}
      // An autofocused page CTA (Enter starts it) wears no ring until focus leaves it once.
      data-quiet-focus={rest.autoFocus ? '' : undefined}
      onBlur={(e) => {
        e.currentTarget.removeAttribute('data-quiet-focus');
        onBlur?.(e);
      }}
      {...rest}
    >
      {loading ? <Spinner size={size === 'lg' ? 17 : 15} /> : icon ? <Icon name={icon} size={size === 'sm' ? 15 : size === 'lg' ? 18 : 16} /> : null}
      {children !== undefined && <span>{children}</span>}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 15 : 16} />}
    </button>
  );
}

/** Icon-only button. The label is the accessible name and shows as a tooltip on hover / keyboard focus. */
export function IconButton({
  icon,
  label,
  size = 'md',
  active,
  className,
  tooltip = true,
  tooltipSide,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; size?: 'sm' | 'md'; active?: boolean; tooltip?: boolean; tooltipSide?: TipSide }) {
  return (
    <Tooltip label={label} side={tooltipSide} disabled={!tooltip}>
      <button type="button" className={cx('icon-btn', `icon-btn-${size}`, active && 'is-active', className)} aria-label={label} {...rest}>
        <Icon name={icon} size={size === 'sm' ? 16 : 18} />
      </button>
    </Tooltip>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className,
  padding = true,
  icon,
  variant = 'default',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  padding?: boolean;
  icon?: IconName;
  /** hero: the page's one lead card (radius 20, 24/28 padding). sunken: a quiet well inside another card. */
  variant?: 'default' | 'hero' | 'sunken' | 'plain';
}) {
  return (
    <section className={cx('card', variant !== 'default' && `card-${variant}`, !padding && 'card-flush', className)}>
      {(title || actions) && (
        <header className="card-head">
          <div className="card-title-wrap">
            {icon && <Icon name={icon} size={17} className="card-icon" />}
            <div>
              {title && <h3 className="card-title">{title}</h3>}
              {subtitle && <p className="card-sub">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export type Tone = 'neutral' | 'primary' | 'success' | 'danger' | 'warning' | Subject | 'mixed';

export function Badge({
  tone = 'neutral',
  children,
  icon,
  className,
  size = 'md',
  outline,
}: {
  tone?: Tone;
  children: ReactNode;
  icon?: IconName;
  className?: string;
  size?: 'sm' | 'md';
  outline?: boolean;
}) {
  return (
    <span className={cx('badge', `tone-${tone}`, size === 'sm' && 'badge-sm', outline && 'badge-outline', className)}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

/** Neutral fact chip, e.g. "还差 17" or "计划 11/4". Gaps are never red. */
export function Chip({ children, icon, className }: { children: ReactNode; icon?: IconName; className?: string }) {
  return (
    <span className={cx('chip', className)}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

export function SubjectTag({ subject, size = 'md' }: { subject: Subject | 'mixed'; size?: 'sm' | 'md' }) {
  return (
    <span className={cx('subject-tag', `tone-${subject}`, size === 'sm' && 'subject-tag-sm')}>
      <Icon name={SUBJECT_ICON[subject]} size={size === 'sm' ? 12 : 14} />
      {SUBJECT_NAME[subject]}
    </span>
  );
}

export function SubjectDot({ subject }: { subject: Subject | 'mixed' }) {
  return <span className={cx('subject-dot', `tone-${subject}`)} />;
}

/** 8px tone dot placed before a title (instead of a colored border on a rounded card). */
export function Dot({ tone = 'neutral', size = 'md' }: { tone?: Tone; size?: 'sm' | 'md' }) {
  return <span className={cx('dot', `tone-${tone}`, size === 'sm' && 'dot-sm')} aria-hidden />;
}

/** Tone-soft square with an icon: identifies a subject or kind in a list (28), card (36) or hero (44). */
export function IconTile({ icon, tone = 'neutral', size = 'sm', className }: { icon: IconName; tone?: Tone; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span className={cx('icon-tile', `tone-${tone}`, size !== 'sm' && `icon-tile-${size}`, className)} aria-hidden>
      <Icon name={icon} size={size === 'lg' ? 22 : size === 'md' ? 18 : 15} />
    </span>
  );
}

export function Progress({ value, tone = 'primary', size = 'md', className }: { value: number; tone?: Tone; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <div className={cx('progress', `progress-${size}`, `tone-${tone}`, className)} role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-fill" style={{ width: `${v * 100}%` }} />
    </div>
  );
}

export function Ring({ value, size = 120, stroke = 10, tone = 'primary', children }: { value: number; size?: number; stroke?: number; tone?: Tone; children?: ReactNode }) {
  const v = Math.max(0, Math.min(1, value || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className={cx('ring', `tone-${tone}`)} style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="ring-track" fill="none" />
        {v > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            className="ring-fill"
            fill="none"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - v)}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
}: {
  options: { value: T; label: ReactNode; icon?: IconName; count?: number; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div className={cx('segmented', size === 'sm' && 'segmented-sm', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          disabled={o.disabled}
          className={cx('seg-btn', o.value === value && 'is-active')}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} size={14} />}
          {o.label}
          {o.count !== undefined && <span className="seg-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Underline tabs for a page-level view switch (Segmented is for filters). */
export function Tabs<T extends string>({ options, value, onChange, className }: { options: { value: T; label: ReactNode; icon?: IconName; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx('tabs', className)} role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={cx('tab', o.value === value && 'is-active')} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={15} />}
          {o.label}
          {o.count !== undefined && <span className="seg-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-label="加载中" />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Empty({ icon = 'sparkles', title, desc, action, size = 'md' }: { icon?: IconName; title: ReactNode; desc?: ReactNode; action?: ReactNode; size?: 'sm' | 'md' }) {
  return (
    <div className={cx('empty', size === 'sm' && 'empty-sm')}>
      <div className="empty-icon">
        <Icon name={icon} size={size === 'sm' ? 18 : 22} />
      </div>
      <div className="empty-title">{title}</div>
      {desc && <div className="empty-desc">{desc}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone, icon }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: Tone; icon?: IconName }) {
  return (
    <div className={cx('stat', tone && `tone-${tone}`)}>
      <div className="stat-label">
        {icon && <Icon name={icon} size={14} />}
        {label}
      </div>
      <div className="stat-value num">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/** One stat: label (12) on top, .num value (22, or 28 with size="lg") with a unit, then a sub line. */
export function StatTile({
  label,
  value,
  unit,
  sub,
  icon,
  tone,
  size = 'md',
  boxed,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  sub?: ReactNode;
  icon?: IconName;
  tone?: Tone;
  size?: 'md' | 'lg';
  /** Grouped tiles in a grid get a quiet sunken background (no border). */
  boxed?: boolean;
  className?: string;
}) {
  return (
    <div className={cx('stat-tile', tone && `tone-${tone}`, size === 'lg' && 'stat-tile-lg', boxed && 'is-boxed', className)}>
      <div className="stat-tile-label">
        {icon && <Icon name={icon} size={13} />}
        {label}
      </div>
      <div className="stat-tile-value">
        <span className="num">{value}</span>
        {unit && <span className="stat-tile-unit">{unit}</span>}
      </div>
      {sub && <div className="stat-tile-sub">{sub}</div>}
    </div>
  );
}

/** Label / value pairs (settings data, item facts). */
export function KeyValue({ items, className }: { items: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cx('kv', className)}>
      {items.map(([k, v], i) => (
        <div key={i} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Chart / bar legend. dot = categorical series, bar = line or target, square = area. */
export function Legend({ items, className }: { items: { label: ReactNode; tone?: Tone; color?: string; shape?: 'dot' | 'bar' | 'square'; value?: ReactNode }[]; className?: string }) {
  return (
    <div className={cx('legend', className)}>
      {items.map((it, i) => (
        <span key={i} className={cx('legend-item', it.tone && `tone-${it.tone}`)}>
          <i className={cx('legend-mark', it.shape === 'bar' && 'is-bar', it.shape === 'square' && 'is-square')} style={it.color ? { background: it.color } : undefined} />
          {it.label}
          {it.value !== undefined && <span className="legend-value">{it.value}</span>}
        </span>
      ))}
    </div>
  );
}

export type ItemStatus = 'todo' | 'right' | 'wrong' | 'due' | 'partial' | 'skipped';
const STATUS_ICON: Record<ItemStatus, { icon: IconName | null; tone: Tone; label: string }> = {
  todo: { icon: null, tone: 'neutral', label: '未做' },
  right: { icon: 'check', tone: 'success', label: '答对' },
  wrong: { icon: 'x', tone: 'danger', label: '答错' },
  due: { icon: 'clock', tone: 'warning', label: '到期' },
  partial: { icon: 'minus', tone: 'warning', label: '部分得分' },
  skipped: { icon: 'skip', tone: 'neutral', label: '跳过' },
};

/** One status mark for every item list: todo ring · right check · wrong x · due clock. */
export function StatusIcon({ status, size = 20, label }: { status: ItemStatus; size?: number; label?: string }) {
  const s = STATUS_ICON[status];
  return (
    <span className={cx('status-icon', `is-${status}`, `tone-${s.tone}`)} style={size !== 20 ? { width: size, height: size } : undefined} role="img" aria-label={label || s.label}>
      {s.icon && <Icon name={s.icon} size={Math.round(size * 0.6)} style={{ strokeWidth: 2.6 }} />}
    </span>
  );
}

/** Quiet note block (考点 / 易错 / 速解 / tips): sunken surface, tone only in the icon and label. */
export function Callout({ tone = 'neutral', icon = 'info', title, children, className }: { tone?: Tone; icon?: IconName; title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cx('callout', `tone-${tone}`, className)}>
      <Icon name={icon} size={16} className="callout-icon" />
      <div className="callout-body">
        {title && <div className="callout-title">{title}</div>}
        {children}
      </div>
    </div>
  );
}

/** "数学 · 12 题 · 目标 1:50": children are joined with middle dots. */
export function Meta({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('meta', className)}>{children}</span>;
}

/** Search field: 34px, icon, optional "/" key hint and clear button. */
export function SearchField({
  value,
  onChange,
  placeholder = '搜索',
  kbd,
  className,
  autoFocus,
  inputRef,
  onKeyDown,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  kbd?: string;
  className?: string;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className={cx('field', className)}>
      <Icon name="search" size={15} />
      <input ref={inputRef} type="search" value={value} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} />
      {value ? (
        <button type="button" className="field-clear" aria-label="清除" onClick={() => onChange('')}>
          <Icon name="x" size={12} />
        </button>
      ) : kbd ? (
        <Kbd>{kbd}</Kbd>
      ) : null}
    </label>
  );
}

/** Native select in the same 34px field look. */
export function Select<T extends string>({ value, onChange, options, icon, className, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; icon?: IconName; className?: string; label?: string }) {
  return (
    <label className={cx('field', 'field-select', className)}>
      {icon && <Icon name={icon} size={15} />}
      <select value={value} aria-label={label} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="down" size={14} className="field-chevron" />
    </label>
  );
}

/** A list row: the whole row is the target. Use inside <List> (inset hairlines, hover fill). */
export function ListRow({
  lead,
  title,
  meta,
  trail,
  hoverAction,
  chevron,
  onClick,
  href,
  current,
  active,
  className,
  children,
}: {
  lead?: ReactNode;
  title?: ReactNode;
  meta?: ReactNode;
  /** Fixed, right-aligned column: counts (tabular), a status, or the one filled action of the list. */
  trail?: ReactNode;
  /** Ghost action that appears on hover / keyboard focus. */
  hoverAction?: ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  href?: string;
  /** The "next" row: a soft primary fill. */
  current?: boolean;
  active?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const interactive = !!(onClick || href);
  const body = (
    <>
      {lead && <div className="list-row-lead">{lead}</div>}
      <div className="list-row-main">
        {title && <div className="list-row-title">{title}</div>}
        {meta && <div className="list-row-meta">{meta}</div>}
        {children}
      </div>
      {(trail || hoverAction || chevron) && (
        <div className="list-row-trail">
          {hoverAction && <span className="list-row-hover">{hoverAction}</span>}
          {trail}
          {chevron && <Icon name="right" size={16} className="list-row-chevron" />}
        </div>
      )}
    </>
  );
  const cls = cx('list-row', interactive && 'is-interactive', current && 'is-current', active && 'is-active', className);
  if (href) {
    return (
      <a className={cls} href={href}>
        {body}
      </a>
    );
  }
  if (onClick) {
    return (
      <div
        className={cls}
        role="button"
        tabIndex={0}
        onClick={(e: ReactMouseEvent) => {
          // A button or link inside the row does its own thing.
          const inner = (e.target as HTMLElement).closest('button, a, input, select, textarea, [role="button"]');
          if (inner && inner !== e.currentTarget) return;
          onClick();
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget || e.nativeEvent.isComposing) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
      >
        {body}
      </div>
    );
  }
  return <div className={cls}>{body}</div>;
}

export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('list', className)}>{children}</div>;
}

// ─── Tooltip ───
// One shared tooltip, rendered by <Toaster/>. 400ms delay, instant when moving between tooltipped
// controls, hidden on scroll / click / Escape.
export type TipSide = 'top' | 'bottom' | 'right' | 'left';
interface TipState {
  label: ReactNode;
  kbd?: string;
  side: TipSide;
  el: HTMLElement;
}
let tip: TipState | null = null;
let tipTimer: ReturnType<typeof setTimeout> | undefined;
let tipHiddenAt = 0;
const tipListeners = new Set<() => void>();
const emitTip = () => tipListeners.forEach((l) => l());

export function showTooltip(el: HTMLElement, label: ReactNode, side: TipSide = 'top', kbd?: string, immediate = false) {
  clearTimeout(tipTimer);
  const warm = tip !== null || performance.now() - tipHiddenAt < 500;
  tipTimer = setTimeout(
    () => {
      if (!el.isConnected) return;
      tip = { el, label, side, kbd };
      emitTip();
    },
    immediate || warm ? 0 : 400,
  );
}

export function hideTooltip() {
  clearTimeout(tipTimer);
  if (!tip) return;
  tip = null;
  tipHiddenAt = performance.now();
  emitTip();
}

/** Wraps one element (button, link, icon) and shows `label` above it on hover or keyboard focus. */
export function Tooltip({ label, side = 'top', kbd, disabled, children }: { label: ReactNode; side?: TipSide; kbd?: string; disabled?: boolean; children: ReactElement }) {
  if (disabled || label === undefined || label === null || label === '') return children;
  const p = (children.props || {}) as {
    onMouseEnter?: (e: ReactMouseEvent<HTMLElement>) => void;
    onMouseLeave?: (e: ReactMouseEvent<HTMLElement>) => void;
    onFocus?: (e: FocusEvent<HTMLElement>) => void;
    onBlur?: (e: FocusEvent<HTMLElement>) => void;
  };
  return cloneElement(children as ReactElement<Record<string, unknown>>, {
    onMouseEnter: (e: ReactMouseEvent<HTMLElement>) => {
      p.onMouseEnter?.(e);
      showTooltip(e.currentTarget, label, side, kbd);
    },
    onMouseLeave: (e: ReactMouseEvent<HTMLElement>) => {
      p.onMouseLeave?.(e);
      hideTooltip();
    },
    onFocus: (e: FocusEvent<HTMLElement>) => {
      p.onFocus?.(e);
      const el = e.currentTarget;
      if (el.matches(':focus-visible')) showTooltip(el, label, side, kbd);
    },
    onBlur: (e: FocusEvent<HTMLElement>) => {
      p.onBlur?.(e);
      hideTooltip();
    },
  });
}

/** Small (i) next to a title; the rule explanation lives in its tooltip instead of a wall of text. */
export function InfoTip({ children, side = 'bottom' }: { children: ReactNode; side?: TipSide }) {
  return (
    <Tooltip label={children} side={side}>
      <button type="button" className="info-tip" aria-label={typeof children === 'string' ? children : '说明'}>
        <Icon name="info" size={15} />
      </button>
    </Tooltip>
  );
}

function TooltipHost() {
  const t = useSyncExternalStore(
    (l) => {
      tipListeners.add(l);
      return () => tipListeners.delete(l);
    },
    () => tip,
  );
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const hide = () => hideTooltip();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && hideTooltip();
    window.addEventListener('scroll', hide, true);
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('resize', hide);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('resize', hide);
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);
  // The anchor can disappear without a mouseleave (route change, list re-render).
  useEffect(() => {
    if (!t) return;
    const iv = setInterval(() => !t.el.isConnected && hideTooltip(), 400);
    return () => clearInterval(iv);
  }, [t]);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!t || !node) return;
    const r = t.el.getBoundingClientRect();
    const w = node.offsetWidth;
    const h = node.offsetHeight;
    const gap = 8;
    let side = t.side;
    if (side === 'top' && r.top - h - gap < 4) side = 'bottom';
    else if (side === 'bottom' && r.bottom + h + gap > window.innerHeight - 4) side = 'top';
    else if (side === 'right' && r.right + w + gap > window.innerWidth - 4) side = 'left';
    let x: number;
    let y: number;
    if (side === 'top' || side === 'bottom') {
      x = r.left + r.width / 2 - w / 2;
      y = side === 'top' ? r.top - h - gap : r.bottom + gap;
    } else {
      x = side === 'right' ? r.right + gap : r.left - w - gap;
      y = r.top + r.height / 2 - h / 2;
    }
    x = Math.max(6, Math.min(window.innerWidth - w - 6, x));
    y = Math.max(6, Math.min(window.innerHeight - h - 6, y));
    node.style.left = `${Math.round(x)}px`;
    node.style.top = `${Math.round(y)}px`;
    node.style.visibility = 'visible';
  }, [t]);
  if (!t) return null;
  return (
    <div ref={ref} className="tooltip" role="tooltip" style={{ left: 0, top: 0, visibility: 'hidden' }}>
      {t.label}
      {t.kbd && <kbd className="kbd">{t.kbd}</kbd>}
    </div>
  );
}

// Open modals, top-most last. Only the top-most one reacts to Escape.
const modalStack: symbol[] = [];

// A control can ask for initial focus with autoFocus / data-autofocus (e.g. the selected option of a
// picker); a selected radio in the body also qualifies. Toggles (收藏 etc.) never do.
const MODAL_PREFERRED_FOCUS = ['[autofocus], [data-autofocus]', '.modal-body [role="radio"][aria-checked="true"]:not(:disabled)'];

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 560,
  closeOnBackdrop = true,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  closeOnBackdrop?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<Element | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const id = Symbol('modal');
    modalStack.push(id);
    last.current = document.activeElement;
    hideTooltip();
    // Focus what the dialog asks for (an autofocus control or the selected choice), else the dialog
    // itself — never the × button, which would look pressed.
    const t = setTimeout(() => {
      const el = ref.current;
      if (!el || el.contains(document.activeElement)) return;
      let target: HTMLElement | null = null;
      for (const sel of MODAL_PREFERRED_FOCUS) {
        target = el.querySelector<HTMLElement>(sel);
        if (target) break;
      }
      (target || el).focus({ preventScroll: true });
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing || modalStack[modalStack.length - 1] !== id) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      closeRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      const i = modalStack.indexOf(id);
      if (i >= 0) modalStack.splice(i, 1);
      clearTimeout(t);
      window.removeEventListener('keydown', onKey, true);
      (last.current as HTMLElement | null)?.focus?.({ preventScroll: true });
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => closeOnBackdrop && e.target === e.currentTarget && closeRef.current()}>
      <div className={cx('modal', className)} style={{ width }} ref={ref} role="dialog" aria-modal="true" tabIndex={-1}>
        {title && (
          <header className="modal-head">
            <h3>{title}</h3>
            <IconButton icon="x" label="关闭" size="sm" tooltip={false} onClick={() => closeRef.current()} />
          </header>
        )}
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export const isModalOpen = () => modalStack.length > 0;
/** Number of open modals (a page-level key handler for a modal should act only when its depth is the top). */
export const modalDepth = () => modalStack.length;

// ─── Toasts ───
interface ToastItem {
  id: number;
  text: ReactNode;
  tone: 'neutral' | 'success' | 'danger' | 'warning';
}
let toasts: ToastItem[] = [];
const toastListeners = new Set<() => void>();
let toastSeq = 0;

/** Toast only for actions with consequences (plan regenerated, item removed, export). Autosave is silent. */
export function toast(text: ReactNode, tone: ToastItem['tone'] = 'neutral', ms = 2600) {
  const id = ++toastSeq;
  // Same message again: replace it instead of stacking; never show more than three.
  toasts = [...toasts.filter((t) => !(typeof text === 'string' && t.text === text)), { id, text, tone }].slice(-3);
  toastListeners.forEach((l) => l());
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    toastListeners.forEach((l) => l());
  }, ms);
}

const TOAST_ICON: Record<ToastItem['tone'], IconName> = { neutral: 'info', success: 'checkCircle', danger: 'xCircle', warning: 'alert' };

/** Renders toasts and the shared tooltip. Mount once. */
export function Toaster() {
  const list = useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toasts,
  );
  return createPortal(
    <>
      <div className="toaster" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={cx('toast', `toast-${t.tone}`)}>
            <Icon name={TOAST_ICON[t.tone]} size={16} />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
      <TooltipHost />
    </>,
    document.body,
  );
}

/** Confirm dialog (window.confirm does not work in the native shell). */
export function useConfirm() {
  const [state, setState] = useState<{ title: string; body?: ReactNode; ok: string; cancel: string; danger?: boolean; focusCancel?: boolean; resolve: (v: boolean) => void } | null>(null);
  /** focus: 'cancel' for irreversible actions, so an extra Enter cannot confirm by accident. */
  const ask = (title: string, opts: { body?: ReactNode; ok?: string; cancel?: string; danger?: boolean; focus?: 'ok' | 'cancel' } = {}) =>
    new Promise<boolean>((resolve) =>
      setState({ title, body: opts.body, ok: opts.ok || '确定', cancel: opts.cancel || '取消', danger: opts.danger, focusCancel: opts.focus === 'cancel' || !!opts.danger, resolve }),
    );
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  const node = (
    <Modal
      open={!!state}
      onClose={() => close(false)}
      title={state?.title}
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)} autoFocus={!!state?.focusCancel}>
            {state?.cancel}
          </Button>
          <Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus={!state?.focusCancel}>
            {state?.ok}
          </Button>
        </>
      }
    >
      {state?.body && <div className="muted">{state.body}</div>}
    </Modal>
  );
  return { ask, node };
}

export function Section({ title, desc, actions, children, className, info }: { title: ReactNode; desc?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; info?: ReactNode }) {
  return (
    <section className={cx('section', className)}>
      <div className="section-head">
        <div>
          <h2 className="section-title">
            {title}
            {info && <InfoTip>{info}</InfoTip>}
          </h2>
          {desc && <p className="section-desc">{desc}</p>}
        </div>
        {actions && <div className="section-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * Page header: H1 (28/600) with actions on the same row, an optional one-line description
 * (≤ ~32 Chinese characters) and an optional (i) tooltip for the rules. Eyebrows only for dates
 * or detail-page context; `back` renders the "← 模考" link above.
 */
export function PageHeader({
  title,
  desc,
  actions,
  eyebrow,
  info,
  back,
}: {
  title: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  info?: ReactNode;
  back?: { label: ReactNode; href: string };
}) {
  return (
    <>
      {back && (
        <a className="back-link" href={back.href}>
          <Icon name="arrowLeft" size={14} />
          {back.label}
        </a>
      )}
      <header className="page-header">
        <div>
          {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
          <h1 className="page-title">
            {title}
            {info && <InfoTip>{info}</InfoTip>}
          </h1>
          {desc && <p className="page-desc">{desc}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </header>
    </>
  );
}
