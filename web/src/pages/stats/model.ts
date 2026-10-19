// Small shared model helpers for stats and notes (mastery bands, subject colors).
import type { AppState, Subject } from '@shared/types.ts';
import { SCALE_MAX, type TopicStat } from '@shared/stats.ts';

export const COLOR: Record<Subject, string> = {
  math: 'var(--math)',
  physics: 'var(--physics)',
  chemistry: 'var(--chemistry)',
  japanese: 'var(--japanese)',
};

export type Band = 'weak' | 'near' | 'good' | 'none';
export const BAND_TEXT: Record<Band, string> = { weak: '薄弱', near: '接近目标', good: '达标', none: '还没练' };

/** Accuracy that corresponds to the learner's target score in a subject. */
export function targetRatio(state: AppState, s: Subject): number {
  return state.profile.targets[s] / SCALE_MAX[s];
}

export function masteryBand(t: TopicStat | undefined, target: number): Band {
  if (!t || t.attempts === 0) return 'none';
  if (t.mastery >= target) return 'good';
  if (t.mastery >= target - 0.15) return 'near';
  return 'weak';
}
