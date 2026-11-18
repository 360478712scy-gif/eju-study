// Predicted scores as Today and Plan show them. Below MIN_SAMPLES first attempts an estimate is
// mostly noise: a dip under the baseline is shown as the baseline ("数据还少，先按起点算"), with
// the model's range next to it, and the bar is drawn faded.
import type { Subject } from '@shared/types.ts';
import { SCALE_MAX, type SubjectEstimate } from '@shared/stats.ts';

export const MIN_SAMPLES = 30;
export const SCORE_ORDER: Subject[] = ['japanese', 'math', 'physics', 'chemistry'];
export const TOTAL_MAX = SCORE_ORDER.reduce((s, k) => s + SCALE_MAX[k], 0);

export function isLowData(e: SubjectEstimate): boolean {
  return e.samples < MIN_SAMPLES;
}

export function shownScore(e: SubjectEstimate): number {
  return isLowData(e) ? Math.max(e.estimate, e.baseline) : e.estimate;
}

/** "数据还少，先按起点 295 算" / "数据还少 · 236–305", or null when there is enough data. */
export function lowDataNote(e: SubjectEstimate): string | null {
  if (!isLowData(e)) return null;
  return e.estimate < e.baseline ? `数据还少，先按起点 ${e.baseline} 算` : `数据还少 · ${e.low}–${e.high}`;
}
