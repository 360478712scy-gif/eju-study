// Normalize both the historical v2 distribution and the v3 content build.
import {
  isSubject,
  SUBJECTS,
  type ContentBundle,
  type Item,
  type Subject,
  type School,
  type TaxonomyTopic,
  type TopicNote,
  type MockKind,
} from './types.ts';

export interface Paper {
  session: string;
  kind: MockKind;
  label: string;
  itemIds: string[];
  timeLimitSec: number;
  school?: School;
  schoolPurpose?: 'exam_style' | 'extension';
}
export interface BankIndex {
  bundle: ContentBundle;
  byId: Map<string, Item>;
  byTopic: Map<string, Item[]>;
  topics: Map<string, TaxonomyTopic & { subject: Subject }>;
  notesByTopic: Map<string, TopicNote>;
  papers: Paper[];
}

export function schoolPurpose(it: Item): 'exam_style' | 'extension' {
  // Undergraduate foreign-student route; see design/school-exams.md for sources and year.
  if (/拔高|拓展|水準|水平/.test(it.source.label)) return 'extension';
  return it.source.school === 'aoyama' || (it.source.school === 'meiji' && it.subject === 'math')
    ? 'exam_style'
    : 'extension';
}
export function isCard(item: Item) {
  return (
    item.id.startsWith('recall-') || item.tags?.some((tag) => ['recall', 'flashcard', 'card'].includes(tag)) === true
  );
}
export function indexBank(raw: ContentBundle): BankIndex {
  const topics: BankIndex['topics'] = new Map();
  const subjects = { ...raw.taxonomy.subjects };
  for (const key of Object.keys(subjects)) if (!isSubject(key)) delete (subjects as Record<string, unknown>)[key];
  for (const subject of SUBJECTS) {
    for (const unit of subjects[subject]?.units || []) {
      for (const topic of unit.topics) topics.set(topic.id, { ...topic, subject });
    }
  }
  const items = raw.items.filter(
    (it) => isSubject(it.subject) && !it.id.startsWith('recall-terms-') && !it.topic.startsWith('ja.'),
  );
  const notes = raw.notes.filter((note) => topics.has(note.topic));
  const papers = raw.papers
    .map((p) => ({ ...p, mocks: p.mocks.filter((k) => k === 'math' || k === 'science') }))
    .filter((p) => p.mocks.length);
  const bundle = { version: '3', builtAt: raw.builtAt, items, papers, notes, taxonomy: { subjects } };
  const byTopic = new Map<string, Item[]>();
  const schoolSets = new Map<string, Item[]>();
  function append(map: Map<string, Item[]>, key: string, item: Item) {
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  for (const it of items) {
    append(byTopic, it.topic, it);
    if (it.source.kind === 'school' && it.source.school) {
      const set = it.source.session || it.group || 'practice';
      append(schoolSets, it.source.school + '/' + set, it);
    }
  }
  const catalog: Paper[] = [];
  const order = (a: Item, b: Item) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id);
  for (const p of papers)
    for (const kind of p.mocks) {
      const qs = items.filter(
        (it) =>
          it.source.kind === 'official' &&
          it.source.session === p.session &&
          (kind === 'math' ? it.subject === 'math' : it.subject !== 'math'),
      );
      qs.sort((a, b) => SUBJECTS.indexOf(a.subject) - SUBJECTS.indexOf(b.subject) || order(a, b));
      if (qs.length)
        catalog.push({ kind, session: p.session, label: p.label, itemIds: qs.map((it) => it.id), timeLimitSec: 4800 });
    }
  for (const [session, qs] of schoolSets)
    catalog.push({
      session,
      kind: 'school',
      school: qs[0].source.school,
      schoolPurpose: qs.every((it) => schoolPurpose(it) === 'exam_style') ? 'exam_style' : 'extension',
      label: qs[0].source.label,
      itemIds: qs.sort(order).map((it) => it.id),
      timeLimitSec: qs.reduce((sum, it) => sum + it.targetSec, 0),
    });
  return {
    bundle,
    topics,
    byTopic,
    papers: catalog,
    byId: new Map(items.map((it) => [it.id, it])),
    notesByTopic: new Map(notes.map((n) => [n.topic, n])),
  };
}
