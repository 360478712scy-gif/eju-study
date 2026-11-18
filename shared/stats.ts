import type { AppState, Item, Subject } from './types.ts';
import { DEFAULT_NEW_CARDS_PER_DAY, MAX_SCORE, SUBJECTS } from './types.ts';
import { addDays, daysBetween, isValidDate, studyDate } from './dates.ts';
import { isCard, type BankIndex } from './bank.ts';
import { INTERVALS, SLOW_FACTOR, updateItemProgress, possibleGuess } from './srs.ts';

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
    const baseline = state.profile.baseline[subject];
    // Narrow topic coverage and stale rounds both reduce usable evidence.
    const n = Math.min(weight, topics.size * 3);
    const evidence = n < 15 ? 'sparse' : n < 24 ? 'developing' : 'broader';
    const observed = weight ? (4 * baseline + maximum * sum) / (4 + weight) : baseline;
    const estimate = baseline + (observed - baseline) * clamp((n - 15) / 30, 0, 1);
    const margin = n < 24 ? 0.08 + 0.04 * clamp((n - 15) / 9, 0, 1) : Math.max(0.05, 0.12 * Math.sqrt(24 / n));
    return {
      subject,
      estimate: Math.round(estimate),
      range: [
        Math.round(clamp(estimate - maximum * margin, 0, maximum)),
        Math.round(clamp(estimate + maximum * margin, 0, maximum)),
      ],
      samples: seen.size,
      topics: topics.size,
      evidence,
      scale: maximum,
    };
  });
}

interface ReviewRow {
  itemId: string;
  topic: string;
  reasons: string[];
  due: string | null;
  traps: string[];
}

const INORGANIC = 'chem.inorg';
const ORGANIC = 'chem.org';

function releaseNewCards(state: AppState, bank: BankIndex, date: string, cards: ReviewRow[]) {
  const limit = state.settings.newCardsPerDay ?? DEFAULT_NEW_CARDS_PER_DAY;
  if (!limit || !cards.length) return [];
  const introduced = new Map<string, string>();
  for (const attempt of state.attempts) {
    if (attempt.date !== date || !attempt.firstTry) continue;
    const item = bank.byId.get(attempt.itemId);
    if (item && isCard(item)) introduced.set(item.id, item.topic);
  }
  const remaining = Math.max(0, limit - introduced.size);
  if (!remaining) return [];

  // Use the marked weak topics' exam weights so a rating cannot reshuffle today's share.
  const weakWeight = (prefix: string) =>
    [...bank.topics.values()].reduce(
      (sum, topic) =>
        sum + (matchesTopic([prefix], topic.id) && matchesTopic(state.profile.weakTopics, topic.id) ? topic.weight : 0),
      0,
    ) || 1;
  const inorganic = weakWeight(INORGANIC);
  const inorganicLimit = Math.round((limit * inorganic) / (inorganic + weakWeight(ORGANIC)));
  const allot = (prefix: string, cap: number) => {
    const used = [...introduced.values()].filter((topic) => matchesTopic([prefix], topic)).length;
    return cards.filter((row) => matchesTopic([prefix], row.topic)).slice(0, Math.max(0, cap - used));
  };
  const selected = new Set(
    [...allot(INORGANIC, inorganicLimit), ...allot(ORGANIC, limit - inorganicLimit)].slice(0, remaining),
  );
  // Give unused slots to the other priority group before releasing the remaining cards.
  for (const row of [...cards.filter((card) => matchesTopic([INORGANIC, ORGANIC], card.topic)), ...cards]) {
    if (selected.size >= remaining) break;
    selected.add(row);
  }
  return [...selected];
}

export function reviewQueue(state: AppState, bank: BankIndex, date: string, scope: 'due' | 'all' = 'due') {
  const queue: ReviewRow[] = [];
  const freshCards: ReviewRow[] = [];
  const last = new Map(state.attempts.filter((a) => a.date <= date).map((a) => [a.itemId, a]));
  for (const it of bank.bundle.items) {
    let p = state.progress[it.id];
    const card = isCard(it);
    if (p && studyDate(new Date(p.lastAt)) > date) {
      const earlier = state.attempts.filter((a) => a.itemId === it.id && a.date <= date);
      if (!earlier.length && !card) continue;
      p = earlier.reduce(
        (prev, a) => updateItemProgress(prev, a, it.targetSec, it.format === 'choice'),
        undefined as typeof p | undefined,
      )!;
    }
    const prior = last.get(it.id);
    const isNew = card && !p?.attempts && !prior;
    let due = p?.due;
    if (card && !isNew && !due) {
      // Some imported v2 cards were graded without a spaced-review date.
      const studiedOn = prior?.date ?? studyDate(new Date(p!.lastAt));
      if (isValidDate(studiedOn)) due = addDays(studiedOn, INTERVALS[clamp(p?.box ?? 0, 0, INTERVALS.length - 1)]);
    }
    if (scope === 'due' && (due ? due > date : card && !isNew)) continue;
    const reasons: string[] = [];
    if (p?.inMistakes) reasons.push('mistake');
    if (p?.slow) reasons.push('slow');
    if (p?.possibleGuess) reasons.push('possible_guess');
    if (prior?.confidence === 'guess') reasons.push('guess');
    if (due) reasons.push('spaced');
    if (card && (due || isNew || scope === 'all')) reasons.push('card');
    if (reasons.length) {
      const row = { itemId: it.id, topic: it.topic, reasons, due: due ?? null, traps: it.explanation.traps ?? [] };
      (scope === 'due' && isNew ? freshCards : queue).push(row);
    }
  }
  freshCards.sort((a, b) => a.itemId.localeCompare(b.itemId));
  queue.push(...releaseNewCards(state, bank, date, freshCards));
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
