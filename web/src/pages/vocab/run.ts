// One vocabulary run (queue + answers) kept outside React so leaving the page and
// coming back resumes where the learner stopped. Answers are recorded into AppState
// immediately; this only remembers the order and what is on screen.
import { useSyncExternalStore } from 'react';
import type { AppState, VocabEntry, VocabSkill } from '@shared/types.ts';
import type { BankIndex } from '@shared/bank.ts';
import { vocabQueue } from '@shared/actions.ts';
import { daysLeftOn, phaseFor, vocabDueCount, vocabSkills, vocabToday } from '@shared/planner.ts';

export interface RunCard {
  vocabId: string;
  skill: VocabSkill;
  /** Second chance for a card answered wrong earlier in this run. */
  retry?: boolean;
}

export interface RunAnswer {
  correct: boolean;
  /** Kana answer (read) or the vocab id whose meaning was picked (meaning); '' = gave up. */
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

/** Cards in one "加练" round once today's queue is done. */
export const MORE_COUNT = 20;

/**
 * Today's words come straight from the shared engine, so this page, the day plan, Today and
 * Stats agree: due cards are vocabDueCount, and as the day began the round is exactly
 * vocabToday's queue (the vocab block's card count). Later in the day the same rule runs on the
 * records as the day began, so finished reviews and today's new words are not handed out again.
 */
export interface VocabDay {
  /** Cards due now — the whole pile, not only what fits in one round (vocabDueCount). */
  due: number;
  /** Cards that were due as the day began (what the automatic new-word number is based on). */
  dueStart: number;
  /** Engine limit on new words for today (vocabToday as the day began). */
  planned: number;
  /** New words allowed today: the engine's, or the learner's own choice on this device. */
  limit: number;
  /** The learner picked the number on this device. */
  manual: boolean;
  /** No new words because the exam is days away (vs. because of the review pile). */
  finalDays: boolean;
  /** New words already started today. */
  started: number;
  /** New words still to start today. */
  left: number;
  /** This round, in the engine's order. */
  queue: { id: string; skill: VocabSkill }[];
  /** The round split: due reviews, the untested other skill of words met before, brand-new words. */
  split: QueueSplit;
}

export interface QueueSplit {
  /** Due review cards. */
  review: number;
  /** 补另一项: words practised in only one skill (读音 or 词义) get a card for the other one. */
  fill: number;
  /** Cards of words never practised. */
  fresh: number;
  /** Words never practised (one or two cards each). */
  newWords: number;
}

export function vocabDay(state: AppState, bank: BankIndex, date: string, override: number | null): VocabDay {
  const start = dayStart(state, bank, date);
  const engine = vocabToday(start.view, bank, date);
  const planned = engine.newWords;
  const limit = override ?? planned;
  const left = Math.max(0, limit - start.started);
  const phase = phaseFor(daysLeftOn(state, date));
  const queue = vocabQueue(state, bank, date, left);
  return {
    due: vocabDueCount(state, bank, date),
    dueStart: engine.dueCards,
    planned,
    limit,
    manual: override !== null,
    finalDays: phase === 'final' || phase === 'exam',
    started: start.started,
    left,
    queue,
    split: splitQueue(state, bank, queue),
  };
}

export function splitQueue(state: AppState, bank: BankIndex, queue: { id: string; skill: VocabSkill }[]): QueueSplit {
  const out: QueueSplit = { review: 0, fill: 0, fresh: 0, newWords: 0 };
  const words = new Set<string>();
  for (const q of queue) {
    const p = state.vocab[q.id];
    const v = bank.vocabById.get(q.id);
    if (p?.[q.skill]) out.review++;
    else if (p && v && vocabSkills(v).some((k) => p[k])) out.fill++;
    else {
      out.fresh++;
      words.add(q.id);
    }
  }
  out.newWords = words.size;
  return out;
}

/** Seconds per card, the same pace as the engine's estimate (vocabToday). */
export const SECONDS_PER_CARD = 9;

export function cardMinutes(cards: number): number {
  return Math.max(1, Math.round((cards * SECONDS_PER_CARD) / 60));
}

/**
 * Vocab records as the study day began, so the new-word limit does not grow as the learner
 * clears reviews and stays put once today's words are learned: cards first met today are
 * taken out, cards answered again today count as having been on today's pile.
 */
function dayStart(state: AppState, bank: BankIndex, date: string): { view: AppState; started: number } {
  const todayCount = new Map<string, number>();
  for (const a of state.vocabAttempts) {
    if (a.date !== date) continue;
    const key = `${a.vocabId}|${a.skill}`;
    todayCount.set(key, (todayCount.get(key) || 0) + 1);
  }
  if (!todayCount.size) return { view: state, started: 0 };
  const vocab: AppState['vocab'] = { ...state.vocab };
  const touched = new Set<string>();
  for (const [key, n] of todayCount) {
    const cut = key.lastIndexOf('|');
    const id = key.slice(0, cut);
    const skill = key.slice(cut + 1) as VocabSkill;
    const sp = state.vocab[id]?.[skill];
    if (!sp) continue;
    const before = { ...vocab[id] };
    if (sp.seen <= n) delete before[skill];
    else if (sp.due > date) before[skill] = { ...sp, due: date };
    vocab[id] = before;
    touched.add(id);
  }
  let started = 0;
  for (const id of touched) {
    const v = bank.vocabById.get(id);
    if (!v) continue;
    const skills = vocabSkills(v);
    if (skills.every((k) => !vocab[id]?.[k]) && skills.some((k) => state.vocab[id]?.[k])) started++;
  }
  return { view: { ...state, vocab }, started };
}

/** How many new words, and why, in a few words. */
export function newWordsNote(day: VocabDay): string {
  const started = day.started ? ` · 今天已学 ${day.started} 个` : '';
  // 补另一项 cards share the new-word allowance (two cards per word), ahead of brand-new words.
  const shared = day.split.fill ? '，补另一项的卡也占这个名额' : '';
  if (day.manual) return `你设了每天 ${day.limit} 个（自动是 ${day.planned} 个）${shared}${started}`;
  if (day.planned === 0) {
    if (day.finalDays) return '考前最后几天只复习，不加新词';
    return `今天开始时待复习 ${day.dueStart} 张卡，先只复习；降到约 120 张以下才加新词`;
  }
  return `按待复习量自动定：今天 ${day.planned} 个${shared}${started}`;
}

const GAP = 6;

/**
 * Keep the engine's order, but put at least GAP cards between the two cards of one word:
 * the reading card shows the meaning, so the meaning test right after would only be an echo.
 */
export function spaceCards(queue: { id: string; skill: VocabSkill }[]): RunCard[] {
  const out: RunCard[] = [];
  const firstAt = new Map<string, number>();
  const waiting: { id: string; skill: VocabSkill }[] = [];
  const release = () => {
    for (let i = 0; i < waiting.length; ) {
      const w = waiting[i];
      if (out.length - firstAt.get(w.id)! >= GAP) {
        out.push({ vocabId: w.id, skill: w.skill });
        waiting.splice(i, 1);
      } else i++;
    }
  };
  for (const q of queue) {
    release();
    const at = firstAt.get(q.id);
    if (at === undefined) firstAt.set(q.id, out.length);
    if (at !== undefined && out.length - at < GAP) waiting.push(q);
    else out.push({ vocabId: q.id, skill: q.skill });
  }
  release();
  out.push(...waiting.map((q) => ({ vocabId: q.id, skill: q.skill })));
  return out;
}

/** Cards to practise once today's queue is empty: weakest skills first. */
export function extraQueue(state: AppState, bank: BankIndex, count: number): { id: string; skill: VocabSkill }[] {
  const out: { id: string; skill: VocabSkill; box: number; ok: number; due: string }[] = [];
  for (const v of bank.bundle.vocab) {
    const p = state.vocab[v.id];
    if (!p) continue;
    for (const skill of vocabSkills(v)) {
      const sp = p[skill];
      if (sp) out.push({ id: v.id, skill, box: sp.box, ok: sp.lastCorrect ? 1 : 0, due: sp.due });
    }
  }
  out.sort((a, b) => a.ok - b.ok || a.box - b.box || a.due.localeCompare(b.due));
  return out.slice(0, count).map(({ id, skill }) => ({ id, skill }));
}

// The learner's own new-word number on this device; absent = follow the engine.
const NEW_WORDS_KEY = 'eju-vocab-new-words';
export const NEW_WORD_CHOICES = [10, 20, 30, 40] as const;

export function readNewWords(): number | null {
  try {
    const n = Number(localStorage.getItem(NEW_WORDS_KEY));
    return NEW_WORD_CHOICES.some((c) => c === n) ? n : null;
  } catch {
    return null;
  }
}

export function writeNewWords(n: number | null) {
  try {
    if (n === null) localStorage.removeItem(NEW_WORDS_KEY);
    else localStorage.setItem(NEW_WORDS_KEY, String(n));
  } catch {
    /* ignore */
  }
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

/** Why a word has no "看字写读音" card, or null when it has one (skills come from the engine). */
export function noReadReason(v: VocabEntry): string | null {
  if (vocabSkills(v).includes('read')) return null;
  return /^[\u3040-\u30ffー・ ]+$/.test(v.word) ? '只用假名书写，不用单独练读音' : '理科术语只考词义，读音不单独练';
}

export const SKILL_LABEL: Record<VocabSkill, string> = {
  read: '读音',
  meaning: '词义',
};
