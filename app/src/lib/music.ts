// Background piano: plays as soon as the app opens and switches tracks.
// Built-in tracks plus the learner's own (server media, kind=music).
import { useSyncExternalStore } from 'react';
import { t } from '../copy/index.ts';

export interface Track {
  id: string;
  name: string;
  src: string;
  custom?: boolean;
}

export interface MediaItem {
  id: string;
  kind: 'music' | 'background';
  name: string;
  url: string;
  size: number;
  tone?: 'light' | 'dark';
}

const BUILT_IN: Track[] = [1, 2, 3].map((n) => ({ id: 'music-0' + n, name: t.settings.pianoTrack(n), src: '/assets/music/meditation-0' + n + '.mp3' }));

type Snapshot = { tracks: Track[]; index: number; playing: boolean; volume: number; time: number; duration: number };
let snap: Snapshot = { tracks: BUILT_IN, index: 0, playing: false, volume: 0.3, time: 0, duration: 0 };
const subs = new Set<() => void>();
const emit = (patch: Partial<Snapshot>) => {
  snap = { ...snap, ...patch };
  subs.forEach((f) => f());
};
export const useMusic = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => snap,
    () => snap,
  );

let audio: HTMLAudioElement | undefined;
let persist: (trackId: string, volume: number) => void = () => {};
let wantPlay = true;
let hidden = false;

function element() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'auto';
  audio.addEventListener('ended', () => next());
  audio.addEventListener('play', () => emit({ playing: true }));
  audio.addEventListener('pause', () => emit({ playing: false }));
  audio.addEventListener('timeupdate', () => emit({ time: audio!.currentTime, duration: Number.isFinite(audio!.duration) ? audio!.duration : 0 }));
  audio.addEventListener('error', () => {
    // A missing custom file: skip to the next track once.
    if (snap.tracks.length > 1) next();
  });
  return audio;
}

function load(index: number) {
  const el = element();
  const track = snap.tracks[(index + snap.tracks.length) % snap.tracks.length];
  if (!track) return;
  const i = snap.tracks.indexOf(track);
  if (!el.src.endsWith(track.src)) {
    el.src = track.src;
    emit({ index: i, time: 0, duration: 0 });
  } else emit({ index: i });
  persist(track.id, snap.volume);
}

function tryPlay() {
  if (!audio || hidden || !wantPlay) return;
  void audio.play().catch(() => {
    /* autoplay refused: the first click or key starts it (see start) */
  });
}

/** Called once at app start with the saved track and volume. Plays right away. */
export function start(opts: { trackId?: string; volume?: number; save: (trackId: string, volume: number) => void }) {
  persist = opts.save;
  const volume = typeof opts.volume === 'number' ? Math.max(0, Math.min(1, opts.volume)) : snap.volume;
  emit({ volume });
  element().volume = volume;
  const i = Math.max(0, snap.tracks.findIndex((tr) => tr.id === opts.trackId));
  load(i);
  tryPlay();
  // WebKit may refuse autoplay until the first click or key press.
  const gesture = () => tryPlay();
  window.addEventListener('pointerdown', gesture, { once: true, capture: true });
  window.addEventListener('keydown', gesture, { once: true, capture: true });
}

export function setVisible(visible: boolean) {
  hidden = !visible;
  if (hidden) audio?.pause();
  else tryPlay();
}

export function toggle() {
  if (snap.playing) {
    wantPlay = false;
    audio?.pause();
  } else {
    wantPlay = true;
    tryPlay();
  }
}
export function next() {
  load(snap.index + 1);
  tryPlay();
}
export function prev() {
  if (audio && audio.currentTime > 4) {
    audio.currentTime = 0;
    return;
  }
  load(snap.index - 1);
  tryPlay();
}
export function play(trackId: string) {
  wantPlay = true;
  load(snap.tracks.findIndex((tr) => tr.id === trackId));
  tryPlay();
}
export function seek(fraction: number) {
  if (audio && snap.duration) audio.currentTime = Math.max(0, Math.min(1, fraction)) * snap.duration;
}
export function setVolume(volume: number) {
  const v = Math.max(0, Math.min(1, volume));
  if (audio) audio.volume = v;
  emit({ volume: v });
  const track = snap.tracks[snap.index];
  if (track) persist(track.id, v);
}

/** Replace the custom part of the track list (keeps the current track playing when it still exists). */
export function setCustomTracks(items: MediaItem[]) {
  const current = snap.tracks[snap.index]?.id;
  const tracks = [...BUILT_IN, ...items.filter((it) => it.kind === 'music').map((it) => ({ id: 'custom:' + it.id, name: it.name, src: it.url, custom: true }))];
  const index = Math.max(0, tracks.findIndex((tr) => tr.id === current));
  emit({ tracks, index });
  if (!tracks.some((tr) => tr.id === current)) load(0);
}

export const isPlaying = () => snap.playing;

/* ───────── learner media (backgrounds + piano) ───────── */

export async function listMedia(): Promise<MediaItem[]> {
  try {
    const r = await fetch('/api/media');
    if (!r.ok) return [];
    return ((await r.json()) as { items: MediaItem[] }).items;
  } catch {
    return [];
  }
}

export async function addMedia(file: File, kind: 'music' | 'background', extra: Record<string, string> = {}): Promise<MediaItem | null> {
  const name = file.name.replace(/\.[^.]+$/, '');
  const q = new URLSearchParams({ kind, name, ...extra });
  const r = await fetch('/api/media?' + q, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
  if (!r.ok) return null;
  return ((await r.json()) as { item: MediaItem }).item;
}

export async function removeMedia(id: string): Promise<boolean> {
  const r = await fetch('/api/media/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
  return r.ok;
}

/** Average luminance of a picture → which glass tone reads best over it. */
export function measureTone(file: File): Promise<'light' | 'dark'> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 32;
      c.height = 32;
      const g = c.getContext('2d');
      if (!g) return resolve('dark');
      g.drawImage(img, 0, 0, 32, 32);
      const d = g.getImageData(0, 0, 32, 32).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      URL.revokeObjectURL(url);
      resolve(sum / (d.length / 4) > 150 ? 'light' : 'dark');
    };
    img.onerror = () => resolve('dark');
    img.src = url;
  });
}

/* shared media list (settings scene picker, scene layer, player folder) */
let mediaItems: MediaItem[] = [];
const mediaSubs = new Set<() => void>();
export const useMediaItems = () =>
  useSyncExternalStore(
    (f) => {
      mediaSubs.add(f);
      return () => mediaSubs.delete(f);
    },
    () => mediaItems,
    () => mediaItems,
  );
export async function refreshMedia() {
  mediaItems = await listMedia();
  mediaSubs.forEach((f) => f());
  setCustomTracks(mediaItems);
  return mediaItems;
}
