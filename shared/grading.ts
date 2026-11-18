// Objective grading for every item format. Pure functions, shared by client and tests.
import type { Item, WrittenResponse } from './types.ts';

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

/** Require one bounded award per rubric line, including explicit zeroes. */
export function writtenPoints(item: Item, input: unknown) {
  const r = input as WrittenResponse | null;
  if (!r || !['self', 'ai'].includes(r.method) || !r.marks || typeof r.marks !== 'object')
    throw new Error('written marks required');
  const parts = item.written?.parts;
  if (!parts?.length || Object.keys(r.marks).length !== parts.length) throw new Error('invalid parts');
  let earned = 0,
    possible = 0;
  for (const p of parts) {
    const row = r.marks[p.id];
    if (
      !Array.isArray(row) ||
      row.length !== p.rubric.length ||
      !row.every(
        (n, i) =>
          Number.isFinite(n) &&
          n >= 0 &&
          n <= p.rubric[i].points &&
          (r.method !== 'self' || n === 0 || n === p.rubric[i].points),
      )
    )
      throw new Error('invalid marks');
    if (p.points <= 0 || p.rubric.reduce((s, c) => s + c.points, 0) !== p.points) throw new Error('invalid rubric');
    earned += row.reduce((sum, n) => sum + n, 0);
    possible += p.points;
  }
  return { earned, possible };
}

export function gradeItem(item: Item, response: unknown): GradeResult {
  if (item.format === 'written') {
    if (response == null) return { correct: false, score: 0 };
    const { earned, possible } = writtenPoints(item, response);
    return { correct: earned === possible, score: earned / possible };
  }
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
  if (item.format === 'written') return response != null && writtenPoints(item, response).possible > 0;
  if (item.format === 'choice') return typeof response === 'number';
  if (!response || typeof response !== 'object') return false;
  const given = response as Record<string, string>;
  return blankGroups(item).some((g) => [...g].some((l) => (given[l] || '').trim() !== ''));
}
