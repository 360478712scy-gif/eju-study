// Shell: scene + glass panels (nav · main · optional detail column), a study status strip and the assistant button.
// Pages render into <Page>; a page that has context to show passes `aside`.
import type { ReactNode } from 'react';
import { Badge, Bar, Button, Icon, Glass, Tooltip, cx, type IconName } from '../ui/ui.tsx';
import { Scene, type CustomScene, type SceneMode, type Weather } from './Scene.tsx';
import './shell.css';

export interface NavItem {
  id: string;
  icon: IconName;
  label: string;
  href: string;
  count?: number;
  hint?: string;
  group?: string;
}

export function Shell({
  nav,
  children,
  aside,
  bar,
  fab,
  focus,
  scene = 'auto',
  weather = 'auto',
  parallax,
  tone,
  sceneCustom,
}: {
  nav: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
  bar?: ReactNode;
  fab?: ReactNode;
  focus?: boolean;
  scene?: SceneMode;
  weather?: Weather;
  parallax?: boolean;
  tone?: 'system' | 'light' | 'dark';
  sceneCustom?: CustomScene;
}) {
  return (
    <>
      <Scene mode={scene} weather={weather} calm={focus} parallax={parallax} tone={tone} custom={sceneCustom} />
      <div className="titlebar" />
      <div className={cx('stage', !aside && 'no-aside', focus && 'is-focus')}>
        <Glass as="nav" className="pane pane-nav" inert={focus || undefined}>
          {nav}
        </Glass>
        <Glass as="main" className="pane pane-main">
          {bar && !focus && <div className="study-bar-slot">{bar}</div>}
          {children}
        </Glass>
        {aside && (
          <Glass as="aside" className="pane pane-aside">
            {aside}
          </Glass>
        )}
      </div>
      {fab}
    </>
  );
}

export function NavPanel({
  brand,
  sub,
  countdown,
  items,
  active,
  foot,
}: {
  brand: string;
  sub?: string;
  countdown?: { value: number | string; label?: string; progress?: number };
  items: NavItem[];
  active: string;
  foot?: ReactNode;
}) {
  let lastGroup: string | undefined;
  return (
    <div className="nav">
      <div className="nav-brand">
        <span className="nav-mark" aria-hidden>
          <BrandMark />
        </span>
        <div>
          <div className="nav-name">{brand}</div>
          {sub && <div className="nav-sub">{sub}</div>}
        </div>
      </div>
      {countdown && (
        <div className="nav-count" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div className="hstack" style={{ alignItems: 'baseline', gap: 6 }}>
            <span className="num">{countdown.value}</span>
            <span className="nav-count-label">{countdown.label}</span>
          </div>
          {countdown.progress != null && (
            <div className="nav-count-bar">
              <Bar value={countdown.progress} thin />
            </div>
          )}
        </div>
      )}
      {items.map((it) => {
        const head = it.group && it.group !== lastGroup ? <div className="nav-group">{it.group}</div> : null;
        lastGroup = it.group;
        return (
          <div key={it.id} style={{ display: 'contents' }}>
            {head}
            <a href={it.href} title={it.hint ?? it.label} aria-label={it.label} className={cx('nav-item', active === it.id && 'is-on')} aria-current={active === it.id ? 'page' : undefined}>
              <Icon name={it.icon} size={19} />
              <span className="nav-label">{it.label}</span>
              {!!it.count && <Badge tone="warn">{it.count}</Badge>}
            </a>
          </div>
        );
      })}
      {foot && <div className="nav-foot">{foot}</div>}
    </div>
  );
}

/** Page scaffold inside the main pane. */
export function Page({
  eyebrow,
  title,
  desc,
  actions,
  children,
  wide,
}: {
  eyebrow?: ReactNode;
  title?: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="page">
      <div className="page-scroll scroll">
        <div className="page-inner" style={wide ? { maxWidth: 'none' } : undefined}>
          {(title || actions) && (
            <header className="page-head">
              <div className="page-head-text">
                {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
                {title && <h1 className="page-title">{title}</h1>}
                {desc && <p className="page-desc">{desc}</p>}
              </div>
              {actions && <div className="page-actions">{actions}</div>}
            </header>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

export function Aside({ title, actions, children }: { title?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <>
      {(title || actions) && (
        <div className="aside-head">
          <div className="aside-title">{title}</div>
          {actions}
        </div>
      )}
      <div className="aside-body scroll">{children}</div>
    </>
  );
}

/** Study status strip: shown at the top of the main pane while a task is running (not in the question player). */
export function StudyBar({
  label,
  title,
  sub,
  time,
  progress,
  glyph,
  paused,
  onToggle,
  toggleLabels,
  primary,
}: {
  label: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  time?: ReactNode;
  progress?: number;
  glyph?: ReactNode;
  paused?: boolean;
  onToggle?: () => void;
  toggleLabels: { pause: string; resume: string };
  primary?: { label: string; onClick: () => void };
}) {
  return (
    <div className={cx('study-bar', paused && 'is-paused')} role="status">
      <span className="study-bar-pulse" aria-hidden />
      <span className="study-bar-label">{label}</span>
      {glyph}
      <span className="study-bar-text">
        <span className="study-bar-title">{title}</span>
        {sub && <span className="study-bar-sub">{sub}</span>}
      </span>
      {progress != null && (
        <span className="study-bar-progress" aria-hidden>
          <span style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
        </span>
      )}
      {time && <span className="study-bar-time num">{time}</span>}
      {onToggle && (
        <Button size="sm" variant="ghost" icon={paused ? 'arrow-right' : 'clock'} onClick={onToggle}>
          {paused ? toggleLabels.resume : toggleLabels.pause}
        </Button>
      )}
      {primary && (
        <Button size="sm" variant="primary" onClick={primary.onClick}>
          {primary.label}
        </Button>
      )}
    </div>
  );
}

/** Floating assistant button (bottom right). */
export function AssistantFab({ label, kbd, on, onClick }: { label: string; kbd?: string; on?: boolean; onClick: () => void }) {
  return (
    <Tooltip label={label} kbd={kbd} side="left">
      <button type="button" className={cx('glass-float assistant-fab', on && 'is-on')} aria-label={label} aria-pressed={on} onClick={onClick}>
        <Icon name="coach" size={22} />
      </button>
    </Tooltip>
  );
}

/** The app mark: a frosted sheet behind an opaque worksheet with a check — the same as the app icon. */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="bm-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3f6fd8" />
          <stop offset="1" stopColor="#1b2d63" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#bm-bg)" />
      <rect x="9.5" y="5.5" width="15" height="18" rx="3.2" fill="rgba(255,255,255,0.28)" transform="rotate(10 17 14.5)" />
      <rect x="7" y="8" width="15" height="18" rx="3.2" fill="#f5f8ff" />
      <path d="M10.2 13.2h8.6M10.2 16.6h5.6" stroke="#b8c7e6" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M11 21.2l2.4 2.4 5.2-5.6" stroke="#2f6fea" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
