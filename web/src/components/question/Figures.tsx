// Question figures: crisp thumbnails on a paper-white card, click to zoom.
import { useState } from 'react';
import type { Figure } from '@shared/types.ts';
import { Modal } from '../ui.tsx';
import { Icon } from '../Icon.tsx';

export function Figures({ figures }: { figures: Figure[] }) {
  const [open, setOpen] = useState<Figure | null>(null);
  return (
    <div className="q-figures">
      {figures.map((f) => (
        <figure key={f.src} className="q-figure">
          <button type="button" className="q-figure-btn" onClick={() => setOpen(f)} title="点击放大">
            <img src={f.src} alt={f.caption || '题图'} loading="lazy" style={f.width ? { maxWidth: `min(100%, ${f.width}px)` } : undefined} />
            <span className="q-figure-zoom-hint" aria-hidden>
              <Icon name="expand" size={14} />
            </span>
          </button>
          {f.caption && (
            <figcaption lang="ja">
              <Icon name="image" size={12} />
              {f.caption}
            </figcaption>
          )}
        </figure>
      ))}
      <Modal open={!!open} onClose={() => setOpen(null)} width={1040} title={open?.caption || '题图'}>
        {open && (
          <div className="q-figure-zoom-wrap">
            <img src={open.src} alt={open.caption || '题图'} className="q-figure-zoom" />
          </div>
        )}
      </Modal>
    </div>
  );
}
