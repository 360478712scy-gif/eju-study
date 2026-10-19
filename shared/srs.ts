// Spaced review tuned for a short sprint (≈19 days).
// Mistake book: wrong / guessed items come back after 1, 2, then 4 days; three
// spaced correct re-tests graduate them. Vocabulary uses a Leitner ladder per skill.
import type { Attempt, Confidence, ItemProgress, VocabSkill, VocabSkillProgress } from './types.ts';
import { addDays } from './dates.ts';

export const MISTAKE_INTERVALS = [1, 2, 4];
export const MISTAKE_GRADUATE_BOX = MISTAKE_INTERVALS.length;
export const VOCAB_INTERVALS = [1, 1, 2, 4, 7, 12];
export const VOCAB_MAX_BOX = VOCAB_INTERVALS.length - 1;

export function updateItemProgress(
  prev: ItemProgress | undefined,
  attempt: Pick<Attempt, 'correct' | 'score' | 'at' | 'date' | 'confidence' | 'gaveUp'>,
): ItemProgress {
  const p: ItemProgress = prev
    ? { ...prev }
    : { attempts: 0, correct: 0, lastAt: attempt.at, lastCorrect: false, lastScore: 0, box: 0, inMistakes: false };
  p.attempts += 1;
  if (attempt.correct) p.correct += 1;
  p.lastAt = attempt.at;
  p.lastCorrect = attempt.correct;
  p.lastScore = attempt.score;

  const shaky: Confidence | undefined = attempt.confidence;
  const failed = !attempt.correct || attempt.gaveUp || shaky === 'guess';
  if (failed) {
    p.inMistakes = true;
    p.box = 0;
    p.due = addDays(attempt.date, MISTAKE_INTERVALS[0]);
    return p;
  }
  if (!p.inMistakes) {
    if (shaky === 'unsure') {
      p.inMistakes = true;
      p.box = 1;
      p.due = addDays(attempt.date, MISTAKE_INTERVALS[1]);
    }
    return p;
  }
  // Correct re-test of a mistake: advance only when it was actually due (no same-day cramming credit).
  if (!p.due || attempt.date >= p.due) {
    p.box += 1;
    if (p.box >= MISTAKE_GRADUATE_BOX) {
      p.inMistakes = false;
      p.due = undefined;
    } else {
      p.due = addDays(attempt.date, MISTAKE_INTERVALS[p.box]);
    }
  }
  return p;
}

export function isDue(p: ItemProgress | undefined, date: string): boolean {
  return !!p && p.inMistakes && !!p.due && p.due <= date;
}

export function updateVocabSkill(
  prev: VocabSkillProgress | undefined,
  correct: boolean,
  at: string,
  date: string,
): VocabSkillProgress {
  const p: VocabSkillProgress = prev
    ? { ...prev }
    : { box: 0, due: date, seen: 0, correct: 0, lastAt: at, lastCorrect: false };
  const wasDue = !prev || prev.due <= date;
  p.seen += 1;
  if (correct) p.correct += 1;
  p.lastAt = at;
  p.lastCorrect = correct;
  if (!correct) {
    p.box = 0;
    p.due = addDays(date, VOCAB_INTERVALS[0]);
  } else if (wasDue) {
    p.box = Math.min(VOCAB_MAX_BOX, p.box + 1);
    p.due = addDays(date, VOCAB_INTERVALS[p.box]);
  }
  return p;
}

export function vocabDue(p: VocabSkillProgress | undefined, date: string): boolean {
  return !!p && p.due <= date;
}

export const VOCAB_SKILLS: readonly VocabSkill[] = ['read', 'meaning'];
