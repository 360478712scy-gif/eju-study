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

// ── Science paper finish (physics + chemistry share one 80-minute paper) ──

/** Questions per subject on the EJU science paper. */
export const SCIENCE_ITEMS = { physics: 19, chemistry: 20 } as const;
export type ScienceSubject = keyof typeof SCIENCE_ITEMS;
export const SCIENCE_TOTAL = SCIENCE_ITEMS.physics + SCIENCE_ITEMS.chemistry;
/** First-try timed answers a subject needs before its pace (and finish share) is trusted. */
export const PACE_MIN_SAMPLES = 10;

export interface Finish {
  done: number;
  total: number;
}

/** Questions finished in 80 minutes at the current pace (null until the pace is known). */
export function finishOf(subject: ScienceSubject, completion: number | undefined): Finish | null {
  if (completion === undefined) return null;
  const total = SCIENCE_ITEMS[subject];
  return { done: Math.max(0, Math.min(total, Math.floor(completion * total + 1e-6))), total };
}

export type FinishTone = 'success' | 'warning' | 'danger';

export function finishVerdict(f: Finish): { text: string; tone: FinishTone } {
  if (f.done >= f.total) return { text: '做得完', tone: 'success' };
  if (f.done >= f.total * 0.9) return { text: '有点赶', tone: 'warning' };
  return { text: '做不完', tone: 'danger' };
}
