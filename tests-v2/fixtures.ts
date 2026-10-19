// Synthetic bank shaped like the real one (sessions, subjects, topics) for planner tests.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContentBundle, Item, Subject, Taxonomy } from '../shared/types.ts';
import { indexBank } from '../shared/bank.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const taxonomy: Taxonomy = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/taxonomy.json'), 'utf8'));

const topicsOf = (s: Subject) => taxonomy.subjects[s].units.flatMap((u) => u.topics.map((t) => t.id));

function item(id: string, subject: Subject, topic: string, session: string, order: number, extra: Partial<Item> = {}): Item {
  return {
    id, subject, topic, difficulty: ((order % 3) + 1) as 1 | 2 | 3, targetSec: subject === 'math' ? 700 : subject === 'japanese' ? 90 : 110,
    order, source: { kind: 'official', session, label: id }, stem: '問', format: 'choice', options: ['a', 'b', 'c', 'd'], answer: order % 4,
    explanation: { zh: 'x'.repeat(50) }, verified: { status: 'verified' }, ...extra,
  };
}

export const SCI_SESSIONS = ['2021_1', '2020_2', '2019_1', '2018_2', '2018_1', '2017_2', '2017_1', '2016_2', '2016_1', '2015_2'];
export const JA_SESSIONS = ['2018_1', '2017_2', '2017_1', '2016_2', '2016_1'];

export function makeBundle(): ContentBundle {
  const items: Item[] = [];
  const phys = topicsOf('physics');
  const chem = topicsOf('chemistry');
  const math = topicsOf('math');
  for (const s of SCI_SESSIONS) {
    for (let r = 1; r <= 19; r++) items.push(item(`${s}-phy-${String(r).padStart(2, '0')}`, 'physics', phys[(r * 7 + s.length) % phys.length], s, r));
    for (let r = 1; r <= 20; r++) items.push(item(`${s}-chem-${String(r).padStart(2, '0')}`, 'chemistry', chem[(r * 5 + Number(s.slice(2, 4))) % chem.length], s, r));
    ['I1', 'I2', 'II1', 'II2', 'III', 'IV'].forEach((p, i) =>
      items.push(item(`${s}-math-${p}`, 'math', math[(i * 3 + Number(s.slice(2, 4))) % math.length], s, i + 1, { format: 'blanks', options: undefined, answer: undefined, stem: '\\bx{A}', blanks: { A: '1' }, targetSec: i >= 4 ? 1200 : 660 })),
    );
  }
  for (const s of JA_SESSIONS) {
    for (let r = 1; r <= 10; r++) items.push(item(`${s}-ja-r${String(r).padStart(2, '0')}`, 'japanese', r <= 5 ? 'ja.reading.short' : 'ja.reading.long', s, r, { section: 'reading', group: r > 5 ? `${s}-p${Math.ceil(r / 2)}` : undefined }));
    for (let r = 1; r <= 6; r++) items.push(item(`${s}-ja-lr${String(r).padStart(2, '0')}`, 'japanese', 'ja.listening.lr', s, 25 + r, { section: 'listening-reading', audio: { src: '/x.m4a' } }));
    for (let r = 13; r <= 27; r++) items.push(item(`${s}-ja-l${r}`, 'japanese', 'ja.listening.l', s, 25 + r, { section: 'listening', audio: { src: '/x.m4a' }, transcript: 'x'.repeat(30), targetSec: 110 }));
  }
  const vocab = Array.from({ length: 400 }, (_, i) => ({ id: `w${i}`, word: `語${i}`, reading: 'ご', meaningZh: '词', category: 'general' as const }));
  return { version: 'test', builtAt: '', items, vocab, taxonomy, papers: [], notes: [] };
}

export const bank = indexBank(makeBundle());
