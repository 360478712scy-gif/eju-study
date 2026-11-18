// Ball menu: a small glass ball in the bottom-left corner of the question player. A click lifts a column of
// smaller balls (main menu, music, notes, settings…), each with its name beside it.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Icon, cx, type IconName } from '../ui/ui.tsx';

export interface BallItem {
  id: string;
  icon: IconName;
  label: string;
  on?: boolean;
  className?: string;
  onClick: () => void;
}

export function BallMenu({ items, label, closeLabel, onOpenChange }: {
  items: BallItem[];
  label: string;
  closeLabel: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpenState] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const setOpen = (value: boolean) => {
    setOpenState(value);
    onOpenChange?.(value);
  };
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    addEventListener('pointerdown', away, true);
    addEventListener('keydown', esc, true);
    return () => {
      removeEventListener('pointerdown', away, true);
      removeEventListener('keydown', esc, true);
    };
  }, [open]);
  const menu = (
    <div ref={ref} className={cx('ball-menu', open && 'is-open')}>
      <div className="ball-list" role="menu" aria-label={label} inert={!open || undefined}>
        {items.map((it, i) => (
          <button key={it.id} type="button" role="menuitem" className={cx('ball-item', it.on && 'is-on', it.className)}
            style={{ '--i': items.length - 1 - i } as CSSProperties}
            onClick={() => {
              setOpen(false);
              it.onClick();
            }}>
            <span className="glass-float ball"><Icon name={it.icon} size={18} /></span>
            <span className="glass-float ball-label">{it.label}</span>
          </button>
        ))}
      </div>
      <button type="button" className={cx('glass-float ball ball-main', open && 'is-on')} aria-haspopup="menu" aria-expanded={open}
        aria-label={open ? closeLabel : label} onClick={() => setOpen(!open)}>
        <span className="ball-main-icon"><Icon name={open ? 'close' : 'dots-v'} size={20} /></span>
      </button>
    </div>
  );
  return typeof document === 'undefined' ? menu : createPortal(menu, document.body);
}
