// Helpers for the mock pages: targets, finding a result's session, per-item rows.
import type { AppState, Confidence, Item, MockKind, MockResult, PracticeSession, Profile, Subject } from '@shared/types.ts';
import type { BankIndex } from '@shared/bank.ts';
import type { IconName } from '../../components/Icon.tsx';

export const KIND_ORDER: MockKind[] = ['math', 'science', 'ja-reading', 'ja-listening'];

export const KIND_INFO: Record<MockKind, { name: string; short: string; tone: 'math' | 'primary' | 'japanese'; icon: IconName; subject: Subject | 'mixed' }> = {
  math: { name: '数学コース2', short: '数学', tone: 'math', icon: 'sigma', subject: 'math' },
  science: { name: '理科（物理·化学）', short: '理科', tone: 'primary', icon: 'atom', subject: 'mixed' },
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

/** Items to correct after a mock: wrong, unanswered, partial or marked as a guess. */
export function correctionIds(rows: ResultRow[]): string[] {
  return rows.filter((r) => r.status !== 'right' || r.confidence === 'guess').map((r) => r.item.id);
}

export function kindSubject(kind: MockKind): Subject | 'mixed' {
  return KIND_INFO[kind].subject;
}
