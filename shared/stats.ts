// Learner statistics and EJU score estimates.
// JASSO publishes no raw→scaled table (scores are IRT-equated), so estimates use a
// linear working model anchored at the learner's baseline: math 200·p, physics/chemistry
// 100·p each, Japanese (reading+listening) 400·p. Treat them as trend indicators.
import type { AppState, Attempt, MockKind, MockResult, Subject } from './types.ts';
import type { BankIndex } from './bank.ts';
import { addDays, daysBetween } from './dates.ts';

export const SCALE_MAX: Record<Subject, number> = { math: 200, physics: 100, chemistry: 100, japanese: 400 };
const PRIOR_N = 12;
const WINDOW = 80;

export interface SubjectEstimate {
  subject: Subject;
  estimate: number;
  low: number;
  high: number;
  target: number;
  baseline: number;
  /** Attempts on official/original items used for the estimate. */
  samples: number;
  accuracy: number | null;
}

export function subjectAttempts(state: AppState, subject: Subject): Attempt[] {
  return state.attempts.filter((a) => a.subject === subject);
}

export function estimateSubject(state: AppState, subject: Subject): SubjectEstimate {
  const max = SCALE_MAX[subject];
  const baseline = state.profile.baseline[subject];
  const target = state.profile.targets[subject];
  const p0 = Math.min(0.97, Math.max(0.05, baseline / max));
  const recent = subjectAttempts(state, subject).slice(-WINDOW);
  // First tries weigh more than re-tests of known mistakes.
  let n = 0;
  let sum = 0;
  for (const a of recent) {
    const w = a.mode === 'review' ? 0.5 : 1;
    n += w;
    sum += w * a.score;
  }
  let p = (PRIOR_N * p0 + sum) / (PRIOR_N + n);
  const mock = latestMockForSubject(state.mocks, subject);
  if (mock) p = 0.55 * mock + 0.45 * p;
  const sd = Math.sqrt((p * (1 - p)) / (PRIOR_N + n));
  return {
    subject,
    estimate: Math.round(p * max),
    low: Math.round(Math.max(0, p - 1.3 * sd) * max),
    high: Math.round(Math.min(1, p + 1.3 * sd) * max),
    target,
    baseline,
    samples: recent.length,
    accuracy: recent.length ? sum / Math.max(1e-9, n) : null,
  };
}

function latestMockForSubject(mocks: MockResult[], subject: Subject): number | null {
  for (let i = mocks.length - 1; i >= 0; i--) {
    const m = mocks[i];
    const part = m.bySubject?.[subject];
    if (part && part.total > 0) return part.raw;
    if (subject === 'math' && m.kind === 'math') return m.raw;
  }
  return null;
}

export function estimateAll(state: AppState): Record<Subject, SubjectEstimate> {
  return {
    japanese: estimateSubject(state, 'japanese'),
    math: estimateSubject(state, 'math'),
    physics: estimateSubject(state, 'physics'),
    chemistry: estimateSubject(state, 'chemistry'),
  };
}

export function totalEstimate(est: Record<Subject, SubjectEstimate>): number {
  return est.japanese.estimate + est.math.estimate + est.physics.estimate + est.chemistry.estimate;
}

/** Relative remaining gap (0..1) used to tilt the planner toward the subject furthest from target. */
export function gapRatio(e: SubjectEstimate): number {
  return Math.max(0, e.target - e.estimate) / SCALE_MAX[e.subject];
}

export interface TopicStat {
  topic: string;
  attempts: number;
  correct: number;
  /** Smoothed accuracy (Laplace with subject prior). */
  mastery: number;
  lastDate?: string;
  seconds: number;
}

export function topicStats(state: AppState, bank: BankIndex): Map<string, TopicStat> {
  const prior: Record<Subject, number> = {
    math: state.profile.baseline.math / 200,
    physics: state.profile.baseline.physics / 100,
    chemistry: state.profile.baseline.chemistry / 100,
    japanese: state.profile.baseline.japanese / 400,
  };
  const map = new Map<string, TopicStat>();
  for (const a of state.attempts) {
    const t = map.get(a.topic) || { topic: a.topic, attempts: 0, correct: 0, mastery: 0, seconds: 0 };
    t.attempts += 1;
    t.correct += a.score;
    t.seconds += a.seconds;
    if (!t.lastDate || a.date > t.lastDate) t.lastDate = a.date;
    map.set(a.topic, t);
  }
  for (const [id, info] of bank.topics) {
    const t = map.get(id) || { topic: id, attempts: 0, correct: 0, mastery: 0, seconds: 0 };
    const p0 = prior[info.subject];
    t.mastery = (t.correct + 3 * p0) / (t.attempts + 3);
    map.set(id, t);
  }
  return map;
}

export interface PaceStat {
  subject: Subject;
  /** Median seconds / targetSec over recent first tries; 1 = exactly EJU pace. */
  ratio: number | null;
  samples: number;
}

export function paceStats(state: AppState, bank: BankIndex): Record<Subject, PaceStat> {
  const out = {} as Record<Subject, PaceStat>;
  for (const subject of ['math', 'physics', 'chemistry', 'japanese'] as Subject[]) {
    const ratios: number[] = [];
    for (const a of state.attempts.slice(-300)) {
      if (a.subject !== subject || !a.firstTry || a.seconds <= 0) continue;
      const it = bank.byId.get(a.itemId);
      if (it) ratios.push(a.seconds / it.targetSec);
    }
    ratios.sort((x, y) => x - y);
    const mid = ratios.length ? ratios[Math.floor(ratios.length / 2)] : null;
    out[subject] = { subject, ratio: mid, samples: ratios.length };
  }
  return out;
}

export function daySeconds(state: AppState, date: string): number {
  return state.days[date]?.seconds ?? 0;
}

/** Consecutive days (ending today or yesterday) with at least 30 minutes of study. */
export function streak(state: AppState, today: string): number {
  let n = 0;
  let d = today;
  if (daySeconds(state, d) < 1800) d = addDays(d, -1);
  while (daySeconds(state, d) >= 1800) {
    n += 1;
    d = addDays(d, -1);
  }
  return n;
}

export function daysLeft(state: AppState, date: string): number {
  return daysBetween(date, state.profile.examDate);
}

export function mockEstimate(kind: MockKind, raw: number): number {
  switch (kind) {
    case 'math':
      return Math.round(raw * 200);
    case 'science':
      return Math.round(raw * 200);
    case 'ja-reading':
      return Math.round(raw * 200);
    case 'ja-listening':
      return Math.round(raw * 200);
  }
}
