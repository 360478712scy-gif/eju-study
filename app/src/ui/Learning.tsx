import type { InputHTMLAttributes, ReactNode, Ref } from 'react';
import type { Figure } from '@shared/types.ts';
import { Button, Glass, Icon, type IconName, type Tone } from './ui.tsx';
import { t } from '../copy/index.ts';
import './learning.css';

export function DayPicker({ value, onChange, large, label }: { value: number[]; onChange: (days: number[]) => void; large?: boolean; label: string }) {
  return <div className="hstack day-picker" role="group" aria-label={label}>
    {Array.from({ length: 7 }, (_, index) => index + 1).map(day => (
      <Button key={day} className={`daypill${value.includes(day) ? ' is-on' : ''}${large ? ' is-lg' : ''}`} variant="ghost"
        aria-pressed={value.includes(day)} aria-label={t.time.weekdayLabel(day)}
        onClick={() => onChange(value.includes(day) ? value.filter(d => d !== day) : [...value, day].sort((a, b) => a - b))}>
        {t.time.weekdayShort(day)}
      </Button>
    ))}
  </div>;
}

export function Callout({ tone, icon, label, children }: { tone: Tone; icon: IconName; label: ReactNode; children: ReactNode }) {
  return <div className="callout" data-tone={tone}>
    <div className="callout-head"><Icon name={icon} size={14} />{label}</div>
    {children}
  </div>;
}

export function Figures({ figures }: { figures?: Figure[] }) {
  if (!figures?.length) return null;
  return <div className="question-figures">
    {figures.map((figure, i) => <figure key={figure.src + i}>
      <Glass kind="read" as="a" href={figure.src} target="_blank" rel="noreferrer">
        <img src={figure.src} alt={figure.caption || t.session.figure(i + 1)} width={figure.width} loading="lazy" />
      </Glass>
      {figure.caption && <figcaption>{figure.caption}</figcaption>}
    </figure>)}
  </div>;
}

export function CheckRow({ checked, onChange, children, disabled }: { checked: boolean; onChange: (value: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return <label className="check-row">
    <input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
    <span>{children}</span>
  </label>;
}

export function OptionRow({ marker, selected, result, disabled, onClick, children }: {
  marker: ReactNode; selected: boolean; result?: 'right' | 'wrong'; disabled?: boolean; onClick: () => void; children: ReactNode;
}) {
  return <button type="button" role="radio" aria-checked={selected} disabled={disabled}
    className={`opt ${result ? 'is-' + result : selected ? 'is-picked' : ''}`} onClick={onClick}>
    <span className="opt-key num">{result === 'right' ? <Icon name="check" size={15} stroke={2.2} /> : marker}</span>
    <span className="opt-text">{children}</span>
  </button>;
}

export function MarkCell({ marker, label, expected, inputRef, ...input }: InputHTMLAttributes<HTMLInputElement> & {
  marker: string; label: string; expected?: string; inputRef?: Ref<HTMLInputElement>;
}) {
  return <label className="marks-cell">
    <span>{marker}</span>
    <input className="num" type="text" size={1} aria-label={label} autoComplete="off" ref={inputRef} {...input} />
    {expected !== undefined && <b data-tone={input.value === expected ? 'ok' : 'bad'}>{expected}</b>}
  </label>;
}
