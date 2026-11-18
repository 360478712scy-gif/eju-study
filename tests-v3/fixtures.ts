import { indexBank } from '../shared/bank.ts';
import { createInitialState } from '../shared/migrate.ts';
import type { ContentBundle, Item, Subject } from '../shared/types.ts';
export const now = new Date('2026-11-19T10:00:00');
export const fresh = () => createInitialState(now);
const topicIds = {
  math: [
    'math.seq.seq',
    'math.calc.int',
    'math.trig.func',
    'math.vec.plane',
    'math.geo.plane',
    'math.prob.count',
    'math.explog.func',
  ],
  physics: [
    'phys.em.induction',
    'phys.em.capacitor',
    'phys.mech.spring',
    'phys.mech.pendulum',
    'phys.em.circuit',
    'phys.mech.kinematics',
  ],
  chemistry: ['chem.inorg.ions', 'chem.org.basics', 'chem.org.aliphatic', 'chem.react.enthalpy', 'chem.struct.atom'],
};
export const written: Item = {
  id: 'school-aoyama-1',
  subject: 'physics',
  topic: 'phys.em.induction',
  difficulty: 3,
  targetSec: 1200,
  source: { kind: 'school', school: 'aoyama', session: 'sample-A', label: '原创' },
  stem: '長さ L の導体が一様磁場 B と直角に速度 v で動く。起電力の大きさを求めよ。',
  format: 'written',
  written: {
    parts: [
      {
        id: '1',
        label: '(1)',
        prompt: '',
        points: 10,
        modelAnswer: '磁束変化率から V=BLv。',
        rubric: [
          { text: '磁束変化率を用いる', points: 4 },
          { text: 'V=BLv', points: 6 },
        ],
        final: 'BLv',
      },
    ],
  },
  explanation: { zh: '用法拉第定律。', traps: ['注意夹角'] },
};
export function fixture() {
  const subjects = {} as ContentBundle['taxonomy']['subjects'];
  const items: Item[] = [];
  const papers: ContentBundle['papers'] = [];
  for (const subject of Object.keys(topicIds) as Subject[]) {
    const ids = topicIds[subject];
    subjects[subject] = {
      name: subject,
      units: [{ id: subject, name: subject, topics: ids.map((id) => ({ id, name: id, weight: 3 })) }],
    };
    for (const topic of ids)
      for (const difficulty of [1, 2, 3] as const) {
        items.push({
          id: topic + difficulty,
          subject,
          topic,
          difficulty,
          targetSec: 240,
          source: { kind: 'original', label: topic },
          stem: '1 + 2 = ?',
          format: 'choice',
          options: ['2', '3', '4', '5'],
          answer: 1,
          explanation: { zh: '1 + 2 = 3', traps: ['加法'] },
        });
      }
  }
  for (let i = 1; i <= 10; i++) {
    const session = 'paper' + String(i).padStart(2, '0');
    papers.push({ session, label: session, mocks: ['math', 'science'] });
    for (const subject of Object.keys(topicIds) as Subject[]) {
      for (let j = 0; j < 3; j++)
        items.push({
          ...items.find((it) => it.subject === subject)!,
          id: session + subject + j,
          order: j + 1,
          source: { kind: 'official', session, label: 'test' },
        });
    }
  }
  const card = items.find((it) => it.topic === 'chem.inorg.ions')!;
  for (let i = 0; i < 8; i++) items.push({ ...card, id: 'recall-chem-' + i, targetSec: 60 });
  items.push(written);
  return {
    version: '3',
    builtAt: now.toISOString(),
    taxonomy: { subjects },
    papers,
    items,
    notes: [{ topic: card.topic, body: '离子' }],
  };
}
export const bundle = fixture();
export const bank = indexBank(bundle);
