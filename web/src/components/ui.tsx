// Small design-system primitives. Styles live in ./ui.css.
import { useEffect, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode } from 'react';
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
      {...rest}
    >
      {loading ? <Spinner size={size === 'lg' ? 18 : 15} /> : icon ? <Icon name={icon} size={size === 'sm' ? 15 : size === 'lg' ? 19 : 17} /> : null}
      {children !== undefined && <span>{children}</span>}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 15 : 17} />}
    </button>
  );
}

export function IconButton({ icon, label, size = 'md', active, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; size?: 'sm' | 'md'; active?: boolean }) {
  return (
    <button type="button" className={cx('icon-btn', `icon-btn-${size}`, active && 'is-active', className)} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={size === 'sm' ? 16 : 18} />
    </button>
  );
}

export function Card({ title, subtitle, actions, children, className, padding = true, icon }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; padding?: boolean; icon?: IconName }) {
  return (
    <section className={cx('card', !padding && 'card-flush', className)}>
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

export function Badge({ tone = 'neutral', children, icon, className }: { tone?: Tone; children: ReactNode; icon?: IconName; className?: string }) {
  return (
    <span className={cx('badge', `tone-${tone}`, className)}>
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
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, size = 'md' }: { options: { value: T; label: ReactNode; icon?: IconName }[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className={cx('segmented', size === 'sm' && 'segmented-sm')} role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={cx('seg-btn', o.value === value && 'is-active')} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={14} />}
          {o.label}
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

export function Empty({ icon = 'sparkles', title, desc, action }: { icon?: IconName; title: ReactNode; desc?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={22} />
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

// Open modals, top-most last. Only the top-most one reacts to Escape.
const modalStack: symbol[] = [];

export function Modal({ open, onClose, title, children, footer, width = 560, closeOnBackdrop = true }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number; closeOnBackdrop?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<Element | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const id = Symbol('modal');
    modalStack.push(id);
    last.current = document.activeElement;
    const t = setTimeout(() => {
      const el = ref.current;
      if (!el || el.contains(document.activeElement)) return;
      el.querySelector<HTMLElement>('[autofocus], input, textarea, select, .modal-body button, button')?.focus();
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
      (last.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => closeOnBackdrop && e.target === e.currentTarget && closeRef.current()}>
      <div className="modal" style={{ width }} ref={ref} role="dialog" aria-modal="true">
        {title && (
          <header className="modal-head">
            <h3>{title}</h3>
            <IconButton icon="x" label="关闭" size="sm" onClick={() => closeRef.current()} />
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

// ─── Toasts ───
interface ToastItem {
  id: number;
  text: ReactNode;
  tone: 'neutral' | 'success' | 'danger' | 'warning';
}
let toasts: ToastItem[] = [];
const toastListeners = new Set<() => void>();
let toastSeq = 0;

export function toast(text: ReactNode, tone: ToastItem['tone'] = 'neutral', ms = 2600) {
  const id = ++toastSeq;
  toasts = [...toasts, { id, text, tone }];
  toastListeners.forEach((l) => l());
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    toastListeners.forEach((l) => l());
  }, ms);
}

export function Toaster() {
  const list = useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toasts,
  );
  return createPortal(
    <div className="toaster" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={cx('toast', `toast-${t.tone}`)}>
          {t.tone === 'success' && <Icon name="checkCircle" size={16} />}
          {t.tone === 'danger' && <Icon name="xCircle" size={16} />}
          {t.tone === 'warning' && <Icon name="alert" size={16} />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>,
    document.body,
  );
}

/** Confirm dialog (window.confirm does not work in the native shell). */
export function useConfirm() {
  const [state, setState] = useState<{ title: string; body?: ReactNode; ok: string; danger?: boolean; resolve: (v: boolean) => void } | null>(null);
  const ask = (title: string, opts: { body?: ReactNode; ok?: string; danger?: boolean } = {}) =>
    new Promise<boolean>((resolve) => setState({ title, body: opts.body, ok: opts.ok || '确定', danger: opts.danger, resolve }));
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
          <Button variant="ghost" onClick={() => close(false)}>
            取消
          </Button>
          <Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
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

export function Section({ title, desc, actions, children, className }: { title: ReactNode; desc?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('section', className)}>
      <div className="section-head">
        <div>
          <h2 className="section-title">{title}</h2>
          {desc && <p className="section-desc">{desc}</p>}
        </div>
        {actions && <div className="section-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function PageHeader({ title, desc, actions, eyebrow }: { title: ReactNode; desc?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {desc && <p className="page-desc">{desc}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
