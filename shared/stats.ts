// Learner statistics and EJU score estimates.
// JASSO publishes no raw→scaled table (scores are IRT-equated), so estimates use a
// linear working model anchored at the learner's baseline: math 200·p, physics/chemistry
// 100·p each, Japanese (reading+listening) 400·p. Treat them as trend indicators.
import type { AppState, Attempt, MockKind, Subject } from './types.ts';
import type { BankIndex } from './bank.ts';
import { addDays, daysBetween } from './dates.ts';

export const SCALE_MAX: Record<Subject, number> = { math: 200, physics: 100, chemistry: 100, japanese: 400 };
const PRIOR_N = 12;
const WINDOW = 80;
/** Probability of a lucky guess on an unanswered science question (≈ 5–6 options). */
const GUESS = 0.18;

export interface SubjectEstimate {
  subject: Subject;
  estimate: number;
  low: number;
  high: number;
  target: number;
  baseline: number;
  /** First-try attempts used for the estimate. */
  samples: number;
  accuracy: number | null;
  /** Physics/chemistry: share of an 80-minute paper the learner would finish at current pace. */
  completion?: number;
  /** Japanese: separate halves (each out of 200). */
  parts?: { reading: number; listening: number };
}

export function subjectAttempts(state: AppState, subject: Subject): Attempt[] {
  return state.attempts.filter((a) => a.subject === subject);
}

/** Recall checks and grammar drills say little about exam score; repeats say even less. */
export function isEvidence(a: Attempt): boolean {
  return a.firstTry && a.mode !== 'review' && !a.itemId.startsWith('recall-') && !a.topic.startsWith('ja.vocab');
}

function weightOf(a: Attempt, bank?: BankIndex): number {
  const it = bank?.byId.get(a.itemId);
  let w = it && it.source.kind === 'original' ? 0.5 : 1;
  // A long Ⅲ/Ⅳ 大問 is a bigger share of the math paper than a Ⅰ/Ⅱ 問.
  if (a.subject === 'math' && it) w *= Math.max(0.6, Math.min(2.2, it.targetSec / 660));
  return w;
}

function estimateFrom(attempts: Attempt[], p0: number, bank?: BankIndex): { p: number; n: number; samples: number; acc: number | null } {
  const recent = attempts.filter(isEvidence).slice(-WINDOW);
  let n = 0;
  let sum = 0;
  for (const a of recent) {
    const w = weightOf(a, bank);
    n += w;
    sum += w * a.score;
  }
  return { p: (PRIOR_N * p0 + sum) / (PRIOR_N + n), n, samples: recent.length, acc: recent.length ? sum / Math.max(1e-9, n) : null };
}

export function estimateSubject(state: AppState, subject: Subject, bank?: BankIndex): SubjectEstimate {
  const max = SCALE_MAX[subject];
  const baseline = state.profile.baseline[subject];
  const target = state.profile.targets[subject];
  const p0 = Math.min(0.97, Math.max(0.05, baseline / max));
  const all = subjectAttempts(state, subject);
  if (subject === 'japanese') {
    const r = estimateFrom(all.filter((a) => a.topic.startsWith('ja.reading')), p0, bank);
    const l = estimateFrom(all.filter((a) => a.topic.startsWith('ja.listening')), p0, bank);
    const p = (r.p + l.p) / 2;
    const n = r.n + l.n;
    const sd = Math.sqrt((p * (1 - p)) / (PRIOR_N + n / 2));
    return {
      subject,
      estimate: Math.round(p * max),
      low: Math.round(Math.max(0, p - 1.3 * sd) * max),
      high: Math.round(Math.min(1, p + 1.3 * sd) * max),
      target,
      baseline,
      samples: r.samples + l.samples,
      accuracy: r.acc === null && l.acc === null ? null : ((r.acc ?? p0) + (l.acc ?? p0)) / 2,
      parts: { reading: Math.round(r.p * 200), listening: Math.round(l.p * 200) },
    };
  }
  // Science estimates already discount unfinished questions through the pace factor, so mock
  // questions left blank at time-up are not counted a second time as wrong.
  const paced = subject === 'physics' || subject === 'chemistry';
  const e = estimateFrom(paced ? all.filter((a) => !(a.mode === 'mock' && a.gaveUp)) : all, p0, bank);
  let p = e.p;
  let completion: number | undefined;
  if ((subject === 'physics' || subject === 'chemistry') && bank) {
    const pace = paceStats(state, bank)[subject];
    if (pace.ratio !== null && pace.samples >= 10) {
      // Exam pressure speeds people up a little; beyond that, unanswered questions are guesses.
      completion = Math.min(1, 1.15 / pace.ratio);
      p = p * completion + GUESS * (1 - completion);
    }
  }
  const sd = Math.sqrt((p * (1 - p)) / (PRIOR_N + e.n));
  return {
    subject,
    estimate: Math.round(p * max),
    low: Math.round(Math.max(0, p - 1.3 * sd) * max),
    high: Math.round(Math.min(1, p + 1.3 * sd) * max),
    target,
    baseline,
    samples: e.samples,
    accuracy: e.acc,
    completion,
  };
}

export function estimateAll(state: AppState, bank?: BankIndex): Record<Subject, SubjectEstimate> {
  return {
    japanese: estimateSubject(state, 'japanese', bank),
    math: estimateSubject(state, 'math', bank),
    physics: estimateSubject(state, 'physics', bank),
    chemistry: estimateSubject(state, 'chemistry', bank),
  };
}

export function totalEstimate(est: Record<Subject, SubjectEstimate>): number {
  return est.japanese.estimate + est.math.estimate + est.physics.estimate + est.chemistry.estimate;
}

/** Relative remaining gap (0..1) of a subject on its own scale. */
export function gapRatio(e: SubjectEstimate): number {
  return Math.max(0, e.target - e.estimate) / SCALE_MAX[e.subject];
}

/** Remaining points to target (every point counts the same toward the 630 total). */
export function gapPoints(e: SubjectEstimate): number {
  return Math.max(0, e.target - e.estimate);
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
