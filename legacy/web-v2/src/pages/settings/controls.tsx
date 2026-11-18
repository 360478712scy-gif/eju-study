// Small form controls for the settings page (switch, slider, setting row, section card).
import { type ReactNode } from 'react';
import { cx } from '../../lib/format.ts';
import { Icon, type IconName } from '../../components/Icon.tsx';

// Settings save silently: the page says "改动会立刻保存" and the sidebar shows the save state.

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={cx('sg-switch', checked && 'is-on')} onClick={() => onChange(!checked)}>
      <span className="sg-switch-knob" />
    </button>
  );
}

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  onCommit,
  label,
  format,
  marks,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  onCommit?: () => void;
  label: string;
  format?: (v: number) => ReactNode;
  marks?: [number, string][];
}) {
  const p = ((value - min) / (max - min)) * 100;
  return (
    <div className="sg-slider">
      <div className="sg-slider-top">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          style={{ ['--p' as string]: `${p}%` }}
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerUp={onCommit}
          onKeyUp={onCommit}
          onBlur={onCommit}
        />
        {format && <span className="sg-slider-value num">{format(value)}</span>}
      </div>
      {marks && (
        <div className="sg-slider-marks" aria-hidden>
          {marks.map(([v, t]) => (
            <span key={v} style={{ left: `${((v - min) / (max - min)) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function Row({ title, desc, children, stack }: { title: ReactNode; desc?: ReactNode; children?: ReactNode; stack?: boolean }) {
  return (
    <div className={cx('sg-row', stack && 'sg-row-stack')}>
      <div className="sg-row-text">
        <div className="sg-row-title">{title}</div>
        {desc && <div className="sg-row-desc">{desc}</div>}
      </div>
      {children && <div className="sg-row-control">{children}</div>}
    </div>
  );
}

export function SettingCard({ id, icon, title, desc, children, aside }: { id: string; icon: IconName; title: string; desc?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="card sg-card" id={`st-${id}`} data-section={id}>
      <header className="sg-card-head">
        <div className="sg-card-titles">
          <h2>
            <Icon name={icon} size={16} className="sg-card-icon" />
            {title}
          </h2>
          {desc && <p>{desc}</p>}
        </div>
        {aside && <div className="sg-card-aside">{aside}</div>}
      </header>
      <div className="sg-card-body">{children}</div>
    </section>
  );
}
