import type { AppState, Item, Subject } from './types.ts';
import { MAX_SCORE, SUBJECTS } from './types.ts';
import { daysBetween, studyDate } from './dates.ts';
import { isCard, type BankIndex } from './bank.ts';
import { SLOW_FACTOR, updateItemProgress, possibleGuess } from './srs.ts';

export const matchesTopic = (list: string[], topic: string) =>
  list.some((t) => topic === t || topic.startsWith(t + '.'));
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export interface Mastery {
  topic: string;
  subject: Subject;
  weight: number;
  value: number;
  difficulty: number;
  samples: number;
  speedRatio: number | null;
  lastDate?: string;
  priority: number;
}
// Discount repeated retrieval, guesses and slow correct answers. Evidence decays toward
// a conservative prior. A harder item has a lower expected success probability.
export function mastery(state: AppState, bank: BankIndex, date: string): Mastery[] {
  const rows = new Map<string, Mastery>();
  for (const t of bank.topics.values()) {
    const prior = state.profile.baseline[t.subject] / MAX_SCORE[t.subject];
    const weak = matchesTopic(state.profile.weakTopics, t.id),
      strong = matchesTopic(state.profile.strongTopics, t.id);
    const value = clamp(prior + (weak ? -0.22 : strong ? 0.2 : 0), 0.12, 0.9);
    rows.set(t.id, {
      topic: t.id,
      subject: t.subject,
      weight: t.weight,
      value,
      samples: 0,
      speedRatio: null,
      difficulty: 1,
      priority: 0,
    });
  }
  function decay(r: Mastery, day: string) {
    if (!r.lastDate) return;
    const age = Math.max(0, daysBetween(r.lastDate, day));
    const floor = Math.min(r.value, 0.35);
    r.value = floor + (r.value - floor) * 2 ** (-age / (42 + 3 * Math.min(r.samples, 12)));
  }
  for (const a of state.attempts.filter((a) => a.date <= date).sort((a, b) => a.at.localeCompare(b.at))) {
    const r = rows.get(a.topic);
    if (!r) continue;
    decay(r, a.date);
    const item = bank.byId.get(a.itemId);
    const ratio = item && a.seconds > 0 ? a.seconds / item.targetSec : null;
    const fast = item && possibleGuess(a, item.targetSec, item.format === 'choice');
    const evidence = a.gaveUp
      ? 0
      : a.score *
        (a.confidence === 'guess' ? 0.35 : a.confidence === 'unsure' || fast ? 0.75 : 1) *
        (ratio && ratio > SLOW_FACTOR ? 0.8 : 1);
    const expected = clamp(r.value + (2 - (item?.difficulty ?? 2)) * 0.13, 0.04, 0.96);
    r.value = clamp(r.value + (a.firstTry ? 0.22 : 0.12) * (evidence - expected), 0.03, 0.98);
    if (ratio !== null) r.speedRatio = r.speedRatio === null ? ratio : 0.7 * r.speedRatio + 0.3 * ratio;
    r.samples++;
    r.lastDate = a.date;
  }
  for (const r of rows.values()) {
    decay(r, date);
    r.difficulty = r.value < 0.48 ? 1 : r.value < 0.76 ? 2 : 3;
    const emphasis = matchesTopic(state.profile.weakTopics, r.topic)
      ? 3
      : matchesTopic(state.profile.strongTopics, r.topic)
        ? 0.45
        : 1;
    r.priority = r.weight * (1 - r.value) * emphasis * (r.speedRatio && r.speedRatio > SLOW_FACTOR ? 1.25 : 1);
  }
  return [...rows.values()];
}

export function predictions(state: AppState, bank: BankIndex, date: string) {
  return SUBJECTS.map((subject) => {
    const maximum = MAX_SCORE[subject];
    const seen = new Set<string>(),
      topics = new Set<string>();
    let weight = 0,
      sum = 0;
    for (const a of state.attempts) {
      const it = bank.byId.get(a.itemId);
      if (
        !it ||
        a.subject !== subject ||
        a.date > date ||
        !a.firstTry ||
        a.mode === 'review' ||
        it.source.kind !== 'official' ||
        seen.has(it.id)
      )
        continue;
      seen.add(it.id);
      topics.add(it.topic);
      const w = 2 ** (-daysBetween(a.date, date) / 60);
      const reliability =
        a.confidence === 'guess'
          ? 0.35
          : a.confidence === 'unsure' || possibleGuess(a, it.targetSec, it.format === 'choice')
            ? 0.75
            : 1;
      weight += w;
      sum += w * a.score * reliability;
    }
    const base = state.profile.baseline[subject] / maximum;
    const estimate = (4 * base + sum) / (4 + weight);
    // Heuristic uncertainty band. Effective evidence is capped for repeated coverage of one topic.
    const n = Math.min(weight, topics.size * 3);
    const margin = Math.max(0.07, 0.48 / Math.sqrt(1 + n / 3));
    return {
      subject,
      estimate: Math.round(estimate * maximum),
      range: [
        Math.floor(maximum * clamp(estimate - margin, 0, 1)),
        Math.ceil(maximum * clamp(estimate + margin, 0, 1)),
      ],
      samples: seen.size,
      topics: topics.size,
      evidence: n < 8 ? 'sparse' : n < 24 ? 'developing' : 'broader',
      scale: maximum,
    };
  });
}

export function reviewQueue(state: AppState, bank: BankIndex, date: string, scope: 'due' | 'all' = 'due') {
  const queue: { itemId: string; topic: string; reasons: string[]; due: string | null; traps: string[] }[] = [];
  const last = new Map(state.attempts.filter((a) => a.date <= date).map((a) => [a.itemId, a]));
  for (const it of bank.bundle.items) {
    let p = state.progress[it.id];
    if (p && studyDate(new Date(p.lastAt)) > date) {
      const earlier = state.attempts.filter((a) => a.itemId === it.id && a.date <= date);
      if (!earlier.length && !isCard(it)) continue;
      p = earlier.reduce(
        (prev, a) => updateItemProgress(prev, a, it.targetSec, it.format === 'choice'),
        undefined as typeof p | undefined,
      )!;
    }
    if (scope === 'due' && p?.due && p.due > date) continue;
    const card = isCard(it),
      reasons: string[] = [];
    if (p?.inMistakes) reasons.push('mistake');
    if (p?.slow) reasons.push('slow');
    if (p?.possibleGuess) reasons.push('possible_guess');
    if (last.get(it.id)?.confidence === 'guess') reasons.push('guess');
    if (p?.due) reasons.push('spaced');
    if (card && (p?.due || !p?.attempts)) reasons.push('card');
    if (reasons.length)
      queue.push({ itemId: it.id, topic: it.topic, reasons, due: p?.due ?? null, traps: it.explanation.traps ?? [] });
  }
  return queue.sort(
    (a, b) =>
      Number(!a.due) - Number(!b.due) ||
      (a.due ?? '').localeCompare(b.due ?? '') ||
      Number(b.reasons.includes('mistake')) - Number(a.reasons.includes('mistake')) ||
      a.itemId.localeCompare(b.itemId),
  );
}

export function earlyChemConcept(it: Item) {
  return (
    it.subject === 'chemistry' &&
    it.source.kind === 'official' &&
    (it.order ?? 99) <= 10 &&
    it.targetSec <= 100 &&
    !/何\s*(?:g|mol|L|mL)|求め|計算/.test(it.stem)
  );
}
