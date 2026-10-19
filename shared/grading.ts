// Objective grading for every item format. Pure functions, shared by client and tests.
import type { Item } from './types.ts';

export interface BlankGroupResult {
  group: string;
  expected: string;
  given: string;
  correct: boolean;
}

export interface GradeResult {
  correct: boolean;
  /** 0..1 */
  score: number;
  /** Per placeholder group, for "blanks" items. */
  groups?: BlankGroupResult[];
}

// Answer boxes are written as \bx{AB} (inside or outside $…$); one letter = one mark-sheet cell.
export const BOX_PATTERN = /\\bx\{([A-Z]+)\}/g;

/** Placeholder groups in stem order, e.g. ["A", "BC", "D"]. Each letter appears once. */
export function blankGroups(item: Item): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of item.stem.matchAll(BOX_PATTERN)) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
}

/** Normalize one mark-sheet character: full-width digits/minus → ASCII. */
export function normalizeMark(ch: string): string {
  const s = (ch || '').normalize('NFKC').trim();
  if (s === '−' || s === 'ー' || s === '－' || s === '‐' || s === '–') return '-';
  return s.slice(0, 1);
}

export function gradeItem(item: Item, response: unknown): GradeResult {
  if (item.format === 'choice') {
    const ok = typeof response === 'number' && response === item.answer;
    return { correct: ok, score: ok ? 1 : 0 };
  }
  const blanks = item.blanks || {};
  const given = (response && typeof response === 'object' ? response : {}) as Record<string, string>;
  const groups = blankGroups(item);
  const results: BlankGroupResult[] = groups.map((g) => {
    const expected = [...g].map((l) => blanks[l] ?? '').join('');
    const got = [...g].map((l) => normalizeMark(given[l] ?? '')).join('');
    return { group: g, expected, given: got, correct: got === expected && expected.length === g.length };
  });
  const n = results.length || 1;
  const right = results.filter((r) => r.correct).length;
  return { correct: right === results.length && results.length > 0, score: right / n, groups: results };
}

/** True when the learner has entered something gradable. */
export function isAnswered(item: Item, response: unknown): boolean {
  if (item.format === 'choice') return typeof response === 'number';
  if (!response || typeof response !== 'object') return false;
  const given = response as Record<string, string>;
  return blankGroups(item).some((g) => [...g].some((l) => (given[l] || '').trim() !== ''));
}

/** Kana normalization for vocabulary reading answers. */
export function normalizeKana(s: string): string {
  return (s || '')
    .normalize('NFKC')
    .replace(/[\s・。、，,.　]/g, '')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

export function readingMatches(input: string, reading: string, alts: string[] = []): boolean {
  const n = normalizeKana(input);
  if (!n) return false;
  return [reading, ...alts].some((r) => normalizeKana(r) === n);
}
