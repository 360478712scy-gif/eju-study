// Music: the small player window opened from the nav (and from the ball menu while practising).
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../copy/index.ts';
import * as music from '../lib/music.ts';
import { Button, Icon, IconButton, Slider, cx, toast } from '../ui/ui.tsx';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** The small player window: switch tracks, play/pause, volume, and the music folder (add / delete). */
export function MusicPlayer({ open, onClose, className }: { open: boolean; onClose: () => void; className?: string }) {
  const m = music.useMusic();
  const [folder, setFolder] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const el = e.target as HTMLElement;
      if (!box.current?.contains(el) && !el.closest?.('.music-trigger')) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('pointerdown', away, true);
    addEventListener('keydown', esc);
    return () => {
      removeEventListener('pointerdown', away, true);
      removeEventListener('keydown', esc);
    };
  }, [open, onClose]);
  if (!open) return null;
  const track = m.tracks[m.index];
  const refresh = () => music.refreshMedia();
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    let ok = 0;
    for (const f of Array.from(files)) if (await music.addMedia(f, 'music')) ok++;
    await refresh();
    setBusy(false);
    toast(ok ? t.music.added(ok) : t.music.addFailed, ok ? 'ok' : 'warn');
  };
  const pop = (
    <div ref={box} className={cx('glass-float music-pop', className)} role="dialog" aria-label={t.music.title}>
      <div className="music-pop-head">
        <span className={cx('music-eq', m.playing && 'is-on')} aria-hidden>
          <span /><span /><span /><span />
        </span>
        <b>{t.music.title}</b>
        <span className="spacer" />
        <IconButton icon="close" size="sm" label={t.common.closeBtn} onClick={onClose} />
      </div>
      <div className="music-now">
        <div className="music-now-title">{track?.name}</div>
        <div className="music-now-sub num">{m.index + 1} / {m.tracks.length}{track?.custom ? ` · ${t.music.mine}` : ''}</div>
      </div>
      <button type="button" className="music-progress" aria-label={t.music.seek} onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        music.seek((e.clientX - r.left) / r.width);
      }}>
        <span style={{ width: m.duration ? `${(m.time / m.duration) * 100}%` : '0%' }} />
      </button>
      <div className="music-times num">
        <span>{clock(m.time)}</span>
        <span>{m.duration ? clock(m.duration) : '–:––'}</span>
      </div>
      <div className="music-controls">
        <IconButton icon="prev" label={t.music.prev} onClick={() => music.prev()} />
        <button type="button" className="music-play" aria-label={m.playing ? t.music.pause : t.music.play} onClick={() => music.toggle()}>
          <Icon name={m.playing ? 'pause' : 'play'} size={20} />
        </button>
        <IconButton icon="next" label={t.music.next} onClick={() => music.next()} />
      </div>
      <div className="music-volume">
        <Icon name={m.volume ? 'volume' : 'mute'} size={16} />
        <Slider value={m.volume} min={0} max={1} step={0.01} label={t.music.volume} onChange={(v) => music.setVolume(v)} />
      </div>
      <Button size="sm" variant="ghost" block icon="list" onClick={() => setFolder((v) => !v)} aria-expanded={folder}>
        {folder ? t.music.hideFolder : t.music.openFolder}
      </Button>
      {folder && (
        <div className="music-folder">
          <ul className="music-list scroll">
            {m.tracks.map((tr, i) => (
              <li key={tr.id} className={cx('music-row', i === m.index && 'is-current')}>
                <button type="button" className="music-row-main" onClick={() => music.play(tr.id)}>
                  <span className="music-row-no num">{i === m.index && m.playing ? <span className="music-eq is-on is-tiny"><span /><span /><span /></span> : i + 1}</span>
                  <span className="music-row-name">{tr.name}</span>
                </button>
                {tr.custom && (
                  <IconButton icon="trash" size="sm" label={t.music.remove} onClick={async () => {
                    if (await music.removeMedia(tr.id.slice('custom:'.length))) await refresh();
                  }} />
                )}
              </li>
            ))}
          </ul>
          <input ref={input} type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/ogg,.mp3,.m4a,.aac,.wav,.ogg" multiple hidden
            onChange={(e) => { void add(e.currentTarget.files); e.currentTarget.value = ''; }} />
          <Button size="sm" block icon="plus" loading={busy} disabled={busy} onClick={() => input.current?.click()}>
            {t.music.add}
          </Button>
        </div>
      )}
    </div>
  );
  // Portalled: inside a glass pane (backdrop-filter) `position: fixed` would follow the pane, not the window.
  return typeof document === 'undefined' ? pop : createPortal(pop, document.body);
}
