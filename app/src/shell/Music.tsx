// Music: the equalizer layer between the scene and the glass, and the small player window opened from the nav.
import { useEffect, useRef, useState } from 'react';
import { t } from '../copy/index.ts';
import * as music from '../lib/music.ts';
import { Button, Icon, IconButton, Slider, cx, toast } from '../ui/ui.tsx';

/** Vertical bars that rise and fall with the music, drawn between the background and the panels. */
export function MusicBars({ dim }: { dim?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { playing } = music.useMusic();
  useEffect(() => {
    const cv = ref.current;
    if (!cv || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const g = cv.getContext('2d')!;
    let raf = 0;
    let last = 0;
    let w = 0,
      h = 0,
      dpr = 1;
    const N = 56;
    const cur = new Array(N).fill(0);
    const seed = Array.from({ length: N }, (_, i) => ({ a: 0.6 + ((i * 37) % 11) / 22, p: (i * 1.7) % 6.28, s: 0.7 + ((i * 13) % 7) / 10 }));
    const resize = () => {
      dpr = Math.min(2, devicePixelRatio || 1);
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    addEventListener('resize', resize);
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 33) return; // ~30 fps is plenty behind frosted glass
      last = now;
      const live = music.levels(N);
      const on = music.isPlaying();
      const tsec = now / 1000;
      for (let i = 0; i < N; i++) {
        // Without an analyser yet (autoplay before the first click) the bars breathe on their own.
        const target = !on ? 0 : live ? live[i] : 0.18 + 0.32 * seed[i].a * (0.5 + 0.5 * Math.sin(tsec * 1.6 * seed[i].s + seed[i].p)) * (0.6 + 0.4 * Math.sin(tsec * 0.5 + i * 0.3));
        cur[i] += (target - cur[i]) * (target > cur[i] ? 0.35 : 0.12);
      }
      g.clearRect(0, 0, w, h);
      const style = getComputedStyle(document.documentElement);
      const tint = style.getPropertyValue('--music-bar').trim() || 'rgba(170,210,255,0.5)';
      const gap = w / N;
      const bw = Math.max(3, gap * 0.42);
      const maxH = h * 0.46;
      for (let i = 0; i < N; i++) {
        const bh = Math.max(4, cur[i] * maxH);
        const x = i * gap + (gap - bw) / 2;
        const y = h - bh - h * 0.04;
        const grad = g.createLinearGradient(0, y, 0, h);
        grad.addColorStop(0, tint);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.beginPath();
        g.roundRect(x, y, bw, bh, bw / 2);
        g.fill();
      }
      if (!on && cur.every((v) => v < 0.005)) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
    };
  }, [playing]);
  return <canvas ref={ref} className={cx('music-bars', playing && 'is-on', dim && 'is-dim')} aria-hidden />;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** The small player window: switch tracks, play/pause, volume, and the music folder (add / delete). */
export function MusicPlayer({ open, onClose }: { open: boolean; onClose: () => void }) {
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
  return (
    <div ref={box} className="glass-float music-pop" role="dialog" aria-label={t.music.title}>
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
}
