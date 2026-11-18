import type { Attempt, ItemProgress } from './types.ts';
import { addDays } from './dates.ts';

export const INTERVALS = [1, 3, 7, 14, 30, 60];
export const SLOW_FACTOR = 1.8;
// This signal is deliberately tentative: very fast recognition can also indicate fluency.
export function possibleGuess(
  a: Pick<Attempt, 'correct' | 'seconds' | 'confidence'>,
  targetSec: number,
  choice: boolean,
) {
  return choice && a.correct && a.confidence !== 'sure' && a.seconds > 0 && a.seconds < Math.min(8, targetSec * 0.1);
}
export function updateItemProgress(
  prev: ItemProgress | undefined,
  a: Attempt,
  targetSec: number,
  choice = false,
): ItemProgress {
  const slow = a.correct && a.seconds > targetSec * SLOW_FACTOR;
  const fast = possibleGuess(a, targetSec, choice);
  const fragile = fast || !a.correct || !!a.gaveUp || a.confidence === 'guess' || a.confidence === 'unsure' || slow;
  const due = !prev?.due || a.date >= prev.due;
  const box = fragile ? 0 : Math.min(INTERVALS.length - 1, (prev?.box ?? 0) + Number(due));
  return {
    ...prev,
    attempts: (prev?.attempts ?? 0) + 1,
    correct: (prev?.correct ?? 0) + Number(a.correct),
    lastAt: a.at,
    lastCorrect: a.correct,
    lastScore: a.score,
    slow,
    possibleGuess: fast,
    box,
    inMistakes: fragile || (!!prev?.inMistakes && box < 3),
    due: fragile || due ? addDays(a.date, INTERVALS[box]) : prev!.due,
  };
}
