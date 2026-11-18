// Shell: scene + floating panels (nav · main · optional aside) + the dock.
// Pages render into <Page>; a page that has context to show passes `aside`.
import type { ReactNode } from 'react';
import { Badge, Bar, Icon, IconButton, Glass, cx, type IconName } from '../ui/ui.tsx';
import { Scene, type SceneMode, type Weather } from './Scene.tsx';
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
  dock,
  focus,
  scene = 'auto',
  weather = 'auto',
  parallax,
  tone,
}: {
  nav: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
  dock?: ReactNode;
  focus?: boolean;
  scene?: SceneMode;
  weather?: Weather;
  parallax?: boolean;
  tone?: 'system' | 'light' | 'dark';
}) {
  return (
    <>
      <Scene mode={scene} weather={weather} calm={focus} parallax={parallax} tone={tone} />
      <div className="titlebar" />
      <div className={cx('stage', !aside && 'no-aside', focus && 'is-focus')}>
        <Glass as="nav" className="pane pane-nav" inert={focus || undefined}>
          {nav}
        </Glass>
        <Glass as="main" className="pane pane-main">
          {children}
        </Glass>
        {aside && (
          <Glass as="aside" className="pane pane-aside">
            {aside}
          </Glass>
        )}
      </div>
      {dock}
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
        <span className="nav-mark" aria-hidden />
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
            <a href={it.href} title={it.hint} aria-label={it.label} className={cx('nav-item', active === it.id && 'is-on')} aria-current={active === it.id ? 'page' : undefined}>
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

/** The floating capsule at the bottom. Running: transport + now-playing; idle: a start shortcut. */
export function Dock({
  running,
  paused,
  title,
  sub,
  time,
  progress,
  glyph,
  onPrev,
  onToggle,
  onNext,
  onOpen,
  startLabel,
  onStart,
  tools,
  labels,
  showToggle = true,
}: {
  running: boolean;
  paused?: boolean;
  title?: ReactNode;
  sub?: ReactNode;
  time?: ReactNode;
  progress?: number;
  glyph?: ReactNode;
  onPrev?: () => void;
  onToggle?: () => void;
  onNext?: () => void;
  onOpen?: () => void;
  startLabel?: ReactNode;
  onStart?: () => void;
  tools?: { icon: IconName; label: string; on?: boolean; onClick: () => void; kbd?: string }[];
  showToggle?: boolean;
  labels: { prev: string; next: string; play: string; pause: string };
}) {
  return (
    <div className="glass-float dock" role="toolbar">
      {running ? (
        <>
          <div className="dock-transport">
            <IconButton icon="prev" label={labels.prev} onClick={onPrev} disabled={!onPrev} />
            {showToggle && <button type="button" className="icon-btn dock-play" aria-label={paused ? labels.play : labels.pause} onClick={onToggle} style={{ '--s': '40px' } as React.CSSProperties}>
              <Icon name={paused ? 'play' : 'pause'} size={20} />
            </button>}
            <IconButton icon="next" label={labels.next} onClick={onNext} disabled={!onNext} />
          </div>
          <button type="button" className="dock-now" onClick={onOpen} disabled={!onOpen}>
            {glyph}
            <span className="dock-now-text">
              <span className="dock-now-title" style={{ display: 'block' }}>
                {title}
              </span>
              {sub && (
                <span className="dock-now-sub" style={{ display: 'block' }}>
                  {sub}
                </span>
              )}
            </span>
            {time && <span className="dock-now-time num">{time}</span>}
            {progress != null && (
              <span className="dock-progress">
                <span style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
              </span>
            )}
          </button>
        </>
      ) : (
        startLabel && (
          <button type="button" className="btn btn-ghost dock-start" onClick={onStart} disabled={!onStart}>
            <span className="round-play is-primary" style={{ '--s': '30px' } as React.CSSProperties} aria-hidden>
              <Icon name="play" size={12} />
            </span>
            {startLabel}
          </button>
        )
      )}
      {tools && tools.length > 0 && (
        <>
          <span className="dock-sep" />
          {tools.map((t) => (
            <IconButton key={t.icon} icon={t.icon} label={t.label} on={t.on} kbd={t.kbd} onClick={t.onClick} />
          ))}
        </>
      )}
    </div>
  );
}
