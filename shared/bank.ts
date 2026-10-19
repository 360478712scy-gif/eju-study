// In-memory indexes over the content bundle (built once per load).
import type { ContentBundle, Item, MockKind, Subject, TaxonomyTopic, TopicNote, VocabEntry } from './types.ts';

export interface BankIndex {
  bundle: ContentBundle;
  byId: Map<string, Item>;
  bySubject: Record<Subject, Item[]>;
  byTopic: Map<string, Item[]>;
  bySession: Map<string, Item[]>;
  topics: Map<string, TaxonomyTopic & { subject: Subject; unit: string; unitName: string }>;
  vocabById: Map<string, VocabEntry>;
  notesByTopic: Map<string, TopicNote>;
}

const PREFIX: Record<string, Subject> = { math: 'math', phys: 'physics', chem: 'chemistry', ja: 'japanese' };

export function subjectOfTopic(topic: string): Subject {
  return PREFIX[topic.split('.')[0]] || 'math';
}

export function indexBank(bundle: ContentBundle): BankIndex {
  const byId = new Map<string, Item>();
  const bySubject: Record<Subject, Item[]> = { math: [], physics: [], chemistry: [], japanese: [] };
  const byTopic = new Map<string, Item[]>();
  const bySession = new Map<string, Item[]>();
  for (const it of bundle.items) {
    byId.set(it.id, it);
    bySubject[it.subject].push(it);
    if (!byTopic.has(it.topic)) byTopic.set(it.topic, []);
    byTopic.get(it.topic)!.push(it);
    const s = it.source.session;
    if (s) {
      if (!bySession.has(s)) bySession.set(s, []);
      bySession.get(s)!.push(it);
    }
  }
  for (const list of bySession.values()) list.sort((a, b) => subjectRank(a) - subjectRank(b) || (a.order ?? 0) - (b.order ?? 0));
  const topics = new Map<string, TaxonomyTopic & { subject: Subject; unit: string; unitName: string }>();
  for (const [subject, s] of Object.entries(bundle.taxonomy.subjects) as [Subject, { units: { id: string; name: string; topics: TaxonomyTopic[] }[] }][]) {
    for (const u of s.units) for (const t of u.topics) topics.set(t.id, { ...t, subject, unit: u.id, unitName: u.name });
  }
  return {
    bundle,
    byId,
    bySubject,
    byTopic,
    bySession,
    topics,
    vocabById: new Map(bundle.vocab.map((v) => [v.id, v])),
    notesByTopic: new Map((bundle.notes || []).map((n) => [n.topic, n])),
  };
}

function subjectRank(it: Item): number {
  const r: Record<Subject, number> = { japanese: 0, physics: 1, chemistry: 2, math: 3 };
  const sec = it.section === 'reading' ? 0 : it.section === 'listening-reading' ? 1 : it.section === 'listening' ? 2 : 0;
  return r[it.subject] * 10 + sec;
}

/** Items that make up one mock section of a paper, in paper order. */
export function mockItems(bank: BankIndex, kind: MockKind, session: string): Item[] {
  const all = bank.bySession.get(session) || [];
  const pick = (f: (it: Item) => boolean) => all.filter(f);
  switch (kind) {
    case 'math':
      return pick((it) => it.subject === 'math');
    case 'science':
      return pick((it) => it.subject === 'physics' || it.subject === 'chemistry');
    case 'ja-reading':
      return pick((it) => it.subject === 'japanese' && it.section === 'reading' && it.source.kind === 'official');
    case 'ja-listening':
      return pick((it) => it.subject === 'japanese' && (it.section === 'listening-reading' || it.section === 'listening'));
  }
}

/** Official time limit for a mock section (seconds). Partial Japanese papers are scaled. */
export function mockTimeLimit(kind: MockKind, items: Item[]): number {
  if (kind === 'math' || kind === 'science') return 80 * 60;
  if (kind === 'ja-reading') return Math.round(Math.min(40 * 60, (40 * 60 * items.length) / 25));
  return Math.round(items.reduce((s, it) => s + it.targetSec, 0));
}

export const MOCK_LABEL: Record<MockKind, string> = {
  math: '数学コース2',
  science: '理科（物理·化学）',
  'ja-reading': '日语读解',
  'ja-listening': '日语听解·听读解',
};

export function sessionLabel(session: string): string {
  const [y, n] = session.split('_');
  return `${y}年第${n}回`;
}
