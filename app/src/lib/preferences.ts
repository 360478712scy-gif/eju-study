import type { SceneMode } from '../shell/Scene.tsx';
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
      scene: scenes.some(({ id }) => id === value.scene) || /^custom:[0-9a-f-]{36}$/.test(String(value.scene)) ? value.scene : 'auto',
      particles: value.particles !== false,
      parallax: value.parallax !== false,
    };
  } catch { return defaultAppearance; }
}

export function writeAppearance(value: Appearance) {
  try { localStorage.setItem('eju-v3-appearance', JSON.stringify(value)); } catch { /* storage unavailable */ }
}

