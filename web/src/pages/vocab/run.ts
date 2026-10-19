// One vocabulary run (queue + answers) kept outside React so leaving the page and
// coming back resumes where the learner stopped. Answers are recorded into AppState
// immediately; this only remembers the order and what is on screen.
import { useSyncExternalStore } from 'react';
import type { AppState, VocabEntry, VocabSkill } from '@shared/types.ts';
import type { BankIndex } from '@shared/bank.ts';
import { vocabQueue } from '@shared/actions.ts';

export interface RunCard {
  vocabId: string;
  skill: VocabSkill;
  /** Second chance for a card answered wrong earlier in this run. */
  retry?: boolean;
}

export interface RunAnswer {
  correct: boolean;
  /** Kana typed (read) or chosen meaning text (meaning). */
  response: string;
  /** Raw input as typed, for showing back. */
  typed?: string;
  choice?: number;
}

export interface RunResult extends RunAnswer {
  vocabId: string;
  skill: VocabSkill;
  retry: boolean;
  seconds: number;
}

export interface VocabRun {
  id: string;
  date: string;
  title: string;
  cards: RunCard[];
  index: number;
  /** Answer to cards[index] once given. */
  current: RunAnswer | null;
  results: RunResult[];
  startedAt: number;
  /** Study seconds credited so far, and when the last credit was taken. */
  seconds: number;
  tickAt: number;
  finished: boolean;
  /** Reached the end of the queue (vs. stopped early). */
  completed: boolean;
  /** Today's planned vocab block was closed by this run. */
  closedBlock: boolean;
}

let run: VocabRun | null = null;
const listeners = new Set<() => void>();

export function getRun(): VocabRun | null {
  return run;
}

export function setRun(next: VocabRun | null) {
  run = next;
  for (const l of listeners) l();
}

export function patchRun(fn: (r: VocabRun) => VocabRun) {
  if (run) setRun(fn(run));
}

export function useRun(): VocabRun | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => run,
  );
}

// ─── Queue ───

const CHUNK = 6;

/**
 * Interleave readings and meanings: a block of "看字写读音" cards, then the "选意思"
 * cards of words revealed at least CHUNK cards earlier, so the meaning test is a
 * real recall rather than an echo of the answer just shown.
 */
export function orderCards(queue: { id: string; skill: VocabSkill }[]): RunCard[] {
  const reads = queue.filter((q) => q.skill === 'read');
  const pending = queue.filter((q) => q.skill === 'meaning');
  const readIds = new Set(reads.map((q) => q.id));
  const placedAt = new Map<string, number>();
  const out: RunCard[] = [];
  let r = 0;
  while (r < reads.length || pending.length) {
    for (let k = 0; k < CHUNK && r < reads.length; k++, r++) {
      placedAt.set(reads[r].id, out.length);
      out.push({ vocabId: reads[r].id, skill: 'read' });
    }
    let placed = 0;
    for (let i = 0; i < pending.length && placed < CHUNK; ) {
      const m = pending[i];
      const at = placedAt.get(m.id);
      if (!readIds.has(m.id) || (at !== undefined && out.length - at >= CHUNK)) {
        out.push({ vocabId: m.id, skill: 'meaning' });
        pending.splice(i, 1);
        placed++;
      } else i++;
    }
    if (r >= reads.length && placed === 0 && pending.length) {
      out.push(...pending.map((m) => ({ vocabId: m.id, skill: 'meaning' as const })));
      pending.length = 0;
    }
  }
  return out;
}

/** Cards a learner can practise beyond today's queue: weakest skills first. */
export function extraQueue(state: AppState, bank: BankIndex, count: number): { id: string; skill: VocabSkill }[] {
  const out: { id: string; skill: VocabSkill; box: number; ok: number; due: string }[] = [];
  for (const v of bank.bundle.vocab) {
    const p = state.vocab[v.id];
    if (!p) continue;
    for (const skill of ['read', 'meaning'] as const) {
      const sp = p[skill];
      if (sp) out.push({ id: v.id, skill, box: sp.box, ok: sp.lastCorrect ? 1 : 0, due: sp.due });
    }
  }
  out.sort((a, b) => a.ok - b.ok || a.box - b.box || a.due.localeCompare(b.due));
  return out.slice(0, count).map(({ id, skill }) => ({ id, skill }));
}

export function buildQueue(state: AppState, bank: BankIndex, date: string, newLimit: number, max?: number) {
  let q = vocabQueue(state, bank, date, newLimit);
  if (max !== undefined) q = q.slice(0, max);
  return q;
}

export function newRun(cards: RunCard[], date: string, title: string): VocabRun {
  return {
    id: `vr-${Date.now().toString(36)}`,
    date,
    title,
    cards,
    index: 0,
    current: null,
    results: [],
    startedAt: Date.now(),
    seconds: 0,
    tickAt: Date.now(),
    finished: false,
    completed: false,
    closedBlock: false,
  };
}

/** Put a second try of the current card a few cards later (or at the end). */
export function withRetry(r: VocabRun, gap = 4): RunCard[] {
  const card = r.cards[r.index];
  const cards = [...r.cards];
  const at = Math.min(cards.length, r.index + 1 + gap);
  cards.splice(at, 0, { ...card, retry: true });
  return cards;
}

// ─── Meaning options ───

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(xs: readonly T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface MeaningChoice {
  options: { vocabId: string; text: string }[];
  answer: number;
}

/** The right meaning plus three from the same category, in a stable order per word and day. */
export function meaningChoice(bank: BankIndex, v: VocabEntry, date: string, salt = ''): MeaningChoice {
  const rand = rng(hash(`${v.id}|${date}|${salt}`));
  const all = bank.bundle.vocab;
  let pool = all.filter((x) => x.category === v.category && x.id !== v.id && x.meaningZh !== v.meaningZh);
  if (pool.length < 3) pool = all.filter((x) => x.id !== v.id && x.meaningZh !== v.meaningZh);
  const seen = new Set<string>([v.meaningZh]);
  const picks: VocabEntry[] = [];
  for (const x of shuffled(pool, rand)) {
    if (seen.has(x.meaningZh)) continue;
    seen.add(x.meaningZh);
    picks.push(x);
    if (picks.length === 3) break;
  }
  const options = shuffled([v, ...picks], rand).map((x) => ({ vocabId: x.id, text: x.meaningZh }));
  return { options, answer: options.findIndex((o) => o.vocabId === v.id) };
}

// ─── Labels ───

export const CATEGORY_LABEL: Record<VocabEntry['category'], string> = {
  general: '通用学术',
  science: '理科',
  math: '数学',
  reading: '读解',
};

/** Theme group from the content build (e.g. "调查与数据"), when present. */
export function vocabGroup(v: VocabEntry): string | undefined {
  return 'group' in v && typeof v.group === 'string' ? v.group : undefined;
}

export const SKILL_LABEL: Record<VocabSkill, string> = {
  read: '读音',
  meaning: '词义',
};
