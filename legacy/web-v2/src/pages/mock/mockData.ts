// Helpers for the mock pages: targets, finding a result's session, per-item rows.
import type { AppState, Confidence, Item, MockKind, MockResult, PracticeSession, Profile, Subject } from '@shared/types.ts';
import { mockItems, type BankIndex } from '@shared/bank.ts';
import { JA_FULL, mockItemsPadded, mockLimitFor } from '@shared/planner.ts';
import type { IconName } from '../../components/Icon.tsx';

export { mockTitle } from '../practice/practiceData.ts';

export const KIND_ORDER: MockKind[] = ['math', 'science', 'ja-reading', 'ja-listening'];

/** Tone = subject identity (理科 spans two subjects, so it takes the neutral 综合 tone). */
export const KIND_INFO: Record<MockKind, { name: string; short: string; tone: 'math' | 'mixed' | 'japanese'; icon: IconName; subject: Subject | 'mixed' }> = {
  math: { name: '数学コース2', short: '数学', tone: 'math', icon: 'sigma', subject: 'math' },
  science: { name: '理科（物理·化学）', short: '理科', tone: 'mixed', icon: 'atom', subject: 'mixed' },
  'ja-reading': { name: '日语读解', short: '读解', tone: 'japanese', icon: 'book', subject: 'japanese' },
  'ja-listening': { name: '日语听解·听读解', short: '听解', tone: 'japanese', icon: 'headphones', subject: 'japanese' },
};

/** Every mock section is reported on a 0–200 scale. */
export const MOCK_MAX = 200;

/** The learner's target for one mock section (Japanese 400 is split evenly between reading and listening). */
export function kindTarget(p: Profile, kind: MockKind): number {
  switch (kind) {
    case 'math':
      return p.targets.math;
    case 'science':
      return p.targets.physics + p.targets.chemistry;
    case 'ja-reading':
    case 'ja-listening':
      return Math.round(p.targets.japanese / 2);
  }
}

export function findMockSession(state: AppState, r: MockResult): PracticeSession | undefined {
  const all = Object.values(state.sessions).filter((s) => s.kind === 'mock' && s.mock?.kind === r.kind && s.mock.session === r.session);
  return all.find((s) => s.finishedAt === r.finishedAt) ?? all.find((s) => s.startedAt === r.startedAt) ?? (all.length === 1 ? all[0] : undefined);
}

/** Unfinished mock sessions by `${kind}:${session}` (the active one wins, then the newest). */
export function openMocks(state: AppState): Map<string, PracticeSession> {
  const m = new Map<string, PracticeSession>();
  for (const s of Object.values(state.sessions)) {
    if (!s.mock || s.finishedAt) continue;
    const key = `${s.mock.kind}:${s.mock.session}`;
    const cur = m.get(key);
    if (!cur || (cur.id !== state.activeSessionId && (s.id === state.activeSessionId || s.startedAt > cur.startedAt))) m.set(key, s);
  }
  return m;
}

export interface PaperFacts {
  /** The items a new attempt would use (empty for a recorded or open attempt). */
  items: Item[];
  count: number;
  limitSec: number;
  /** Questions from the real paper vs original items padding a Japanese section. */
  official: number;
  original: number;
  /** Exam length of a Japanese section (0 for math / science). */
  full: number;
  /** Padding could not bring a Japanese section to exam length. */
  short: boolean;
}

/**
 * Count and time limit of one paper's mock: an open attempt and a recorded result keep what they
 * actually used; a new attempt is padded and timed the way it would start now.
 */
export function paperFacts(state: AppState, bank: BankIndex, kind: MockKind, session: string, from: { open?: PracticeSession; result?: MockResult } = {}): PaperFacts {
  const base = new Set(mockItems(bank, kind, session).map((it) => it.id));
  const split = (ids: string[]) => {
    const official = ids.filter((id) => base.has(id)).length;
    return { official, original: ids.length - official };
  };
  const full = kind === 'ja-reading' || kind === 'ja-listening' ? JA_FULL[kind] : 0;
  const recorded = from.open ?? (from.result ? findMockSession(state, from.result) : undefined);
  const ids = from.open?.itemIds ?? from.result?.itemIds;
  if (ids) {
    const used = ids.map((id) => bank.byId.get(id)).filter(Boolean) as Item[];
    return {
      items: [],
      count: from.open ? ids.length : from.result!.total,
      limitSec: recorded?.timeLimitSec ?? mockLimitFor(kind, used),
      ...split(ids),
      full,
      short: false,
    };
  }
  const items = mockItemsPadded(state, bank, kind, session);
  return { items, count: items.length, limitSec: mockLimitFor(kind, items), ...split(items.map((it) => it.id)), full, short: items.length < full };
}

export function paperMinutes(f: PaperFacts): number {
  return Math.max(1, Math.round(f.limitSec / 60));
}

/** "6 题 · 80 分钟", "原卷 10 题 + 原创 15 题 · 40 分钟", "原卷 12 题 + 原创 5 题（不足整卷）· 27 分钟". */
export function paperMeta(f: PaperFacts): string {
  const min = `${paperMinutes(f)} 分钟`;
  if (!f.original && !f.short) return `${f.count} 题 · ${min}`;
  const what = f.original ? `原卷 ${f.official} 题 + 原创 ${f.original} 题` : `原卷 ${f.official} 题`;
  return f.short ? `${what}（不足整卷）· ${min}` : `${what} · ${min}`;
}

export type RowStatus = 'right' | 'partial' | 'wrong' | 'blank';

export interface ResultRow {
  item: Item;
  /** Group heading inside the paper (物理 / 化学 / 聴読解 / 聴解 / 数学 / 読解). */
  group: string;
  /** 1-based number inside the group. */
  no: number;
  response: number | Record<string, string> | null;
  status: RowStatus;
  score: number;
  seconds: number;
  confidence?: Confidence;
}

function groupName(it: Item): string {
  if (it.subject === 'physics') return '物理';
  if (it.subject === 'chemistry') return '化学';
  if (it.subject === 'math') return '数学';
  if (it.section === 'reading') return '读解';
  if (it.section === 'listening-reading') return '听读解';
  return '听解';
}

export function resultRows(state: AppState, bank: BankIndex, r: MockResult): ResultRow[] {
  const session = findMockSession(state, r);
  const attempts = new Map<string, AppState['attempts'][number]>();
  for (const a of state.attempts) {
    if (a.mode !== 'mock' || !r.itemIds.includes(a.itemId)) continue;
    if (session ? a.sessionId === session.id : a.at === r.finishedAt) attempts.set(a.itemId, a);
  }
  const counters = new Map<string, number>();
  const rows: ResultRow[] = [];
  for (const id of r.itemIds) {
    const item = bank.byId.get(id);
    if (!item) continue;
    const ans = session?.answers[id];
    const att = attempts.get(id);
    const response = ans ? ans.response : (att?.response ?? null);
    const score = ans?.score ?? att?.score ?? 0;
    const seconds = ans?.seconds ?? att?.seconds ?? 0;
    const blank = response === null || response === undefined || (typeof response === 'object' && Object.values(response).every((v) => !String(v).trim()));
    const status: RowStatus = blank ? 'blank' : score >= 1 ? 'right' : score > 0 ? 'partial' : 'wrong';
    const group = groupName(item);
    const no = (counters.get(group) || 0) + 1;
    counters.set(group, no);
    rows.push({ item, group, no, response, status, score, seconds, confidence: ans?.confidence ?? att?.confidence });
  }
  return rows;
}

/** Items to correct after a mock: wrong, unanswered, partial, or right but not sure (same rule as the planner's correction block). */
export function correctionIds(rows: ResultRow[]): string[] {
  return rows.filter((r) => r.status !== 'right' || isShaky(r)).map((r) => r.item.id);
}

/** Answered right but marked 没把握 / 蒙的. */
export function isShaky(r: ResultRow): boolean {
  return r.status === 'right' && !!r.confidence && r.confidence !== 'sure';
}

export function kindSubject(kind: MockKind): Subject | 'mixed' {
  return KIND_INFO[kind].subject;
}
