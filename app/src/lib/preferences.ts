import { useEffect } from 'react';
import { onWindowVisibility } from './native.ts';
import type { SceneMode } from '../shell/Scene.tsx';
import type { Settings } from '@shared/types.ts';
import { t } from '../copy/index.ts';

export const scenes = [
  { id: 'winter-night', label: t.settings.winterNight },
  { id: 'winter-day', label: t.settings.winterDay },
  { id: 'spring-day', label: t.settings.springDay },
  { id: 'spring-night', label: t.settings.springNight },
  { id: 'summer-day', label: t.settings.summerDay },
  { id: 'summer-night', label: t.settings.summerNight },
] as const;

export interface Appearance {
  scene: SceneMode;
  particles: boolean;
  parallax: boolean;
}

export const defaultAppearance: Appearance = { scene: 'auto', particles: true, parallax: true };
export function readAppearance(): Appearance {
  try {
    const value = JSON.parse(localStorage.getItem('eju-v3-appearance') || 'null');
    if (!value) return defaultAppearance;
    return {
      scene: scenes.some(({ id }) => id === value.scene) ? value.scene : 'auto',
      particles: value.particles !== false,
      parallax: value.parallax !== false,
    };
  } catch { return defaultAppearance; }
}

export function writeAppearance(value: Appearance) {
  try { localStorage.setItem('eju-v3-appearance', JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export const tracks = [1, 2, 3].map(n => ({
  id: 'music-0' + n,
  label: t.settings.pianoTrack(n),
  src: '/assets/music/meditation-0' + n + '.mp3',
}));
let player: HTMLAudioElement | undefined;
let visible = true;
export function setMusic(enabled: boolean, track: string, volume: number) {
  if (!enabled && !player) return;
  if (!player) {
    player = new Audio();
    player.loop = true;
    player.preload = 'none';
  }
  const src = (tracks.find(entry => entry.id === track) ?? tracks[0]).src;
  if (!player.src.endsWith(src)) player.src = src;
  player.volume = volume;
  if (enabled && visible) void player.play().catch(() => {});
  else player.pause();
}

export function useMusic({ musicEnabled, musicTrack, musicVolume }: Settings) {
  useEffect(() => {
    const apply = () => setMusic(musicEnabled, musicTrack, musicVolume);
    visible = document.visibilityState === 'visible';
    apply();
    window.addEventListener('pointerdown', apply, { once: true });
    window.addEventListener('keydown', apply, { once: true });
    const off = onWindowVisibility(value => { visible = value; apply(); });
    return () => {
      off();
      window.removeEventListener('pointerdown', apply);
      window.removeEventListener('keydown', apply);
      player?.pause();
    };
  }, [musicEnabled, musicTrack, musicVolume]);
}
