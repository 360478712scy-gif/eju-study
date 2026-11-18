import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle, fresh, now } from './fixtures.ts';
import { indexBank } from '../shared/bank.ts';
import { applyAction } from '../shared/actions.ts';
import { addDays } from '../shared/dates.ts';
import { buildDayPlan } from '../shared/planner.ts';
import { predictions, reviewQueue } from '../shared/stats.ts';
import type { Attempt, Item, PracticeSession } from '../shared/types.ts';

test('new card quota is split by weak topic weight, consumed once per day and shared with the plan', () => {
  const inorganic = bundle.items.find((item) => item.topic === 'chem.inorg.ions')!;
  const organic = bundle.items.find((item) => item.topic === 'chem.org.basics')!;
  const cards = [inorganic, organic].flatMap((item, group) =>
    Array.from({ length: 32 }, (_, i) => ({ ...item, id: `recall-${group}-${i}`, targetSec: 40 })),
  );
  const bank = indexBank({
    ...bundle,
    items: [...bundle.items.filter((item) => !item.id.startsWith('recall-')), ...cards],
  });
  const s = fresh();
  const date = s.profile.startDate;
  const newRows = (d = date) => reviewQueue(s, bank, d).filter((row) => !row.due && row.reasons.includes('card'));
  const initial = newRows();
  assert.equal(initial.length, 20);
  assert.equal(initial.filter((row) => row.topic === inorganic.topic).length, 7);
  assert.equal(initial.filter((row) => row.topic === organic.topic).length, 13);
  assert.equal(reviewQueue(s, bank, date, 'all').length, 64);

  const plan = buildDayPlan(s, bank, date);
  const planned = plan.blocks.find((block) => block.kind === 'review')!.itemIds;
  assert.ok(planned.length && planned.every((id) => initial.some((row) => row.itemId === id)));
  s.plans[date] = plan;

  const itemId = initial[0].itemId;
  const session = applyAction(
    s,
    bank,
    { type: 'startPractice', kind: 'review', itemIds: [itemId] },
    now,
  ) as PracticeSession;
  applyAction(s, bank, { type: 'answer', sessionId: session.id, itemId, response: 1, seconds: 20 }, now);
  applyAction(s, bank, { type: 'finish', sessionId: session.id }, now);
  assert.deepEqual(
    newRows().map((row) => row.itemId),
    initial.slice(1).map((row) => row.itemId),
  );
  assert.equal(newRows(addDays(date, 1)).length, 20);
  assert.ok(!reviewQueue(s, bank, date).some((row) => row.itemId === itemId));
  assert.ok(
    reviewQueue(s, bank, addDays(date, 3)).some((row) => row.itemId === itemId && row.due === addDays(date, 3)),
  );
  assert.equal(reviewQueue(s, bank, date, 'all').length, 64);

  applyAction(s, bank, { type: 'settings', patch: { newCardsPerDay: 0 } }, now);
  assert.equal(newRows().length, 0);
  assert.ok(!buildDayPlan(s, bank, date).blocks.some((block) => block.kind === 'review'));
  assert.ok(reviewQueue(s, bank, addDays(date, 3)).some((row) => row.itemId === itemId));
  assert.throws(() => applyAction(s, bank, { type: 'settings', patch: { newCardsPerDay: -1 } }, now));
});

test('a legacy card without a due date returns on its inferred interval, outside the new card quota', () => {
  const card = bundle.items.find((item) => item.id.startsWith('recall-'))!;
  const bank = indexBank(bundle);
  const s = fresh();
  s.settings.newCardsPerDay = 0;
  const date = s.profile.startDate;
  s.progress[card.id] = {
    attempts: 1,
    correct: 1,
    lastAt: now.toISOString(),
    lastCorrect: true,
    lastScore: 1,
    box: 1,
    inMistakes: false,
    slow: true,
  };
  assert.equal(reviewQueue(s, bank, date).length, 0);
  assert.equal(reviewQueue(s, bank, date, 'all').find((row) => row.itemId === card.id)?.due, addDays(date, 3));
  assert.equal(reviewQueue(s, bank, addDays(date, 3))[0]?.itemId, card.id);
});

test('14 recent official answers stay within a few points of baseline, then developing evidence moves gradually', () => {
  const s = fresh();
  const date = s.profile.startDate;
  const topics = bundle.taxonomy.subjects.math.units[0].topics;
  const template = bundle.items.find((item) => item.subject === 'math')!;
  const official: Item[] = Array.from({ length: 20 }, (_, i) => ({
    ...template,
    id: 'forecast-' + i,
    topic: topics[i % topics.length].id,
    source: { kind: 'official', label: 'exam' },
  }));
  const bank = indexBank({ ...bundle, items: [...bundle.items, ...official] });
  const attempt = (item: Item): Attempt => ({
    itemId: item.id,
    id: item.id,
    subject: 'math',
    topic: item.topic,
    date,
    at: now.toISOString(),
    seconds: item.targetSec,
    correct: true,
    response: item.answer!,
    score: 1,
    firstTry: true,
    mode: 'free',
  });
  s.attempts = official.slice(0, 14).map(attempt);

  const [math, physics, chemistry] = predictions(s, bank, date);
  assert.equal(math.samples, 14);
  assert.equal(math.evidence, 'sparse');
  assert.ok(Math.abs(math.estimate - s.profile.baseline.math) <= 3);
  assert.deepEqual(math.range, [116, 148]);
  assert.deepEqual(physics.range, [46, 62]);
  assert.deepEqual(chemistry.range, [58, 74]);

  s.attempts = official.map(attempt);
  const [developing] = predictions(s, bank, date);
  assert.equal(developing.evidence, 'developing');
  assert.ok(developing.estimate > math.estimate && developing.estimate < math.estimate + 12);
  assert.ok(developing.range[1] - developing.range[0] < 48);
});
