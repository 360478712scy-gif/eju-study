import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bank } from './fixtures.ts';
import { createInitialState, migrateV1 } from '../shared/migrate.ts';
import { buildDayPlan, budgetFor, mockSchedule, phaseFor, daysLeftOn, reservedSessions, mockItemsPadded } from '../shared/planner.ts';
import { estimateAll } from '../shared/stats.ts';
import { startBlock, submitAnswer, finishSession, ensurePlan, recordVocab, vocabQueue, regeneratePlan } from '../shared/actions.ts';
import { gradeItem, normalizeKana, readingMatches } from '../shared/grading.ts';
import { updateItemProgress } from '../shared/srs.ts';
import { parseBlocks, parseInline, collectMath } from '../shared/markup.ts';
import { studyDate, addDays } from '../shared/dates.ts';
import type { AppState, Item } from '../shared/types.ts';

const NOW = new Date('2026-10-20T10:00:00+09:00');
const fresh = (): AppState => createInitialState(NOW);

test('phases and budgets follow days left', () => {
  const s = fresh();
  assert.equal(daysLeftOn(s, '2026-10-20'), 19);
  assert.equal(phaseFor(19), 'foundation');
  assert.equal(phaseFor(11), 'practice');
  assert.equal(phaseFor(4), 'final');
  assert.equal(phaseFor(0), 'exam');
  assert.equal(budgetFor(s, '2026-10-20'), 360);
  assert.equal(budgetFor(s, '2026-11-07'), 150);
  assert.equal(budgetFor(s, '2026-11-08'), 0);
  s.profile.dayMinutes['2026-10-21'] = 240;
  assert.equal(budgetFor(s, '2026-10-21'), 240);
});

test('foundation day plan fills the budget without duplicates or reserved papers', () => {
  const s = fresh();
  const plan = buildDayPlan(s, bank, '2026-10-20');
  const total = plan.blocks.reduce((n, b) => n + b.minutes, 0);
  assert.ok(total >= 360 * 0.8 && total <= 360 * 1.15, `planned ${total} min`);
  const ids = plan.blocks.flatMap((b) => b.itemIds);
  assert.equal(new Set(ids).size, ids.length, 'no item twice');
  const reservedSci = reservedSessions(s, bank, ['science', 'math']);
  const reservedJa = reservedSessions(s, bank, ['ja-reading', 'ja-listening']);
  for (const id of ids) {
    const it = bank.byId.get(id)!;
    const reserved = it.subject === 'japanese' ? reservedJa : reservedSci;
    assert.ok(!reserved.has(it.source.session!), `${id} comes from a paper kept for a mock`);
  }
  const subjects = new Set(plan.blocks.map((b) => b.subject));
  for (const sub of ['math', 'physics', 'chemistry', 'japanese']) assert.ok(subjects.has(sub as never), `has ${sub}`);
  assert.ok(plan.blocks.some((b) => b.kind === 'vocab'));
  assert.ok(!plan.blocks.some((b) => b.kind === 'mock'), 'no mock in foundation phase');
});

test('plans are deterministic', () => {
  const a = buildDayPlan(fresh(), bank, '2026-10-22');
  const b = buildDayPlan(fresh(), bank, '2026-10-22');
  assert.deepEqual(a.blocks.map((x) => x.itemIds), b.blocks.map((x) => x.itemIds));
});

test('mock schedule keeps newest papers for later mocks', () => {
  const sch = mockSchedule(fresh(), bank);
  const sci = sch.filter((m) => m.parts.some((p) => p.kind === 'science'));
  assert.deepEqual(sci.map((m) => m.parts.find((p) => p.kind === 'science')!.session), ['2018_2', '2019_1', '2020_2', '2021_1']);
  assert.equal(sch.at(-1)!.date, '2026-11-04');
  assert.equal(sch.at(-1)!.parts.length, 4);
});

test('mock day has science+math mocks and correction blocks', () => {
  const plan = buildDayPlan(fresh(), bank, '2026-10-28');
  const mocks = plan.blocks.filter((b) => b.kind === 'mock');
  assert.deepEqual(mocks.map((b) => b.mock!.kind).sort(), ['math', 'science']);
  assert.ok(plan.blocks.some((b) => b.reviewOfMock?.kind === 'science'));
});

test('a missed mock is re-planned on the next day without its own mock', () => {
  const kinds = (d: string) => buildDayPlan(fresh(), bank, d).blocks.filter((x) => x.kind === 'mock').map((x) => x.mock!.kind).sort();
  assert.deepEqual(kinds('2026-10-29'), ['ja-listening', 'ja-reading'], 'today keeps its own Japanese mock');
  assert.deepEqual(kinds('2026-10-30'), ['math', 'science'], 'the missed science/math mock comes back on a free day');
});

test('regenerating a mock day keeps the other mock and the corrections', () => {
  const s = fresh();
  const date = '2026-10-28';
  const plan = ensurePlan(s, bank, date);
  const sci = plan.blocks.find((x) => x.mock?.kind === 'science')!;
  const ss = startBlock(s, bank, sci)!;
  finishSession(s, bank, ss.id, date);
  s.profile.dayMinutes[date] = 300;
  const next = regeneratePlan(s, bank, date);
  assert.ok(next.blocks.some((x) => x.mock?.kind === 'math' && x.status === 'todo'), 'math mock still planned');
  assert.ok(next.blocks.some((x) => x.reviewOfMock?.kind === 'science'), 'science correction still planned');
  assert.equal(next.blocks.filter((x) => x.mock?.kind === 'science').length, 1);
});

test('final full simulation on 11-04 and an empty exam day', () => {
  const plan = buildDayPlan(fresh(), bank, '2026-11-04');
  assert.equal(plan.blocks.filter((b) => b.kind === 'mock').length, 4);
  assert.equal(buildDayPlan(fresh(), bank, '2026-11-08').blocks.length, 0);
  const last = buildDayPlan(fresh(), bank, '2026-11-07');
  assert.ok(last.blocks.reduce((n, b) => n + b.minutes, 0) <= 170);
});

test('grading: choice, blanks groups, normalization', () => {
  const choice = bank.byId.get('2019_1-phy-01')!;
  assert.equal(gradeItem(choice, choice.answer).correct, true);
  assert.equal(gradeItem(choice, ((choice.answer as number) + 1) % 4).correct, false);
  const blanks: Item = { ...choice, format: 'blanks', options: undefined, answer: undefined, stem: '$\\bx{A}x+\\bx{BC}$ と \\bx{D}', blanks: { A: '-', B: '1', C: '2', D: '0' } };
  const g = gradeItem(blanks, { A: '－', B: '１', C: '2', D: '9' });
  assert.equal(g.groups!.length, 3);
  assert.equal(g.groups!.filter((x) => x.correct).length, 2);
  assert.ok(Math.abs(g.score - 2 / 3) < 1e-9);
  assert.equal(normalizeKana('アツリョク'), 'あつりょく');
  assert.ok(readingMatches(' あつりょく ', 'あつりょく'));
});

test('mistake book: wrong → due in 2 days, two spaced confident re-tests graduate', () => {
  let p = updateItemProgress(undefined, { correct: false, score: 0, at: 'x', date: '2026-10-20' });
  assert.equal(p.inMistakes, true);
  assert.equal(p.due, '2026-10-22');
  p = updateItemProgress(p, { correct: true, score: 1, at: 'x', date: '2026-10-21' });
  assert.equal(p.box, 0, 'early retry does not advance');
  p = updateItemProgress(p, { correct: true, score: 1, at: 'x', date: '2026-10-22', confidence: 'unsure' });
  assert.equal(p.box, 0, 'an unsure re-test does not advance');
  assert.equal(p.due, '2026-10-24');
  p = updateItemProgress(p, { correct: true, score: 1, at: 'x', date: '2026-10-24' });
  assert.equal(p.box, 1);
  assert.equal(p.due, '2026-10-28');
  p = updateItemProgress(p, { correct: true, score: 1, at: 'x', date: '2026-10-28' });
  assert.equal(p.inMistakes, false);
  const guess = updateItemProgress(undefined, { correct: true, score: 1, at: 'x', date: '2026-10-20', confidence: 'guess' });
  assert.equal(guess.inMistakes, true);
  const slow = updateItemProgress(undefined, { correct: true, score: 1, at: 'x', date: '2026-10-20', seconds: 300 }, 110);
  assert.equal(slow.slow, true);
  assert.equal(slow.inMistakes, false);
});

test('score estimate ignores repeats, reviews and recall checks', () => {
  const s = fresh();
  const base = estimateAll(s).physics.estimate;
  for (let i = 0; i < 30; i++) {
    s.attempts.push({ id: 'r' + i, itemId: '2019_1-phy-01', subject: 'physics', topic: 'phys.mech.force', at: 'x', date: '2026-10-21', mode: 'review', correct: true, score: 1, response: 0, seconds: 60, firstTry: false });
    s.attempts.push({ id: 'c' + i, itemId: 'recall-phys-0' + i, subject: 'physics', topic: 'phys.mech.force', at: 'x', date: '2026-10-21', mode: 'block', correct: true, score: 1, response: 0, seconds: 20, firstTry: true });
  }
  assert.equal(estimateAll(s).physics.estimate, base);
});

test('japanese mock sections are padded to exam length with originals', () => {
  const s = fresh();
  const items = mockItemsPadded(s, bank, 'ja-reading', '2017_2');
  assert.ok(items.length >= 10);
});

test('block flow: practice answers grade immediately; mock grades at the end', () => {
  const s = fresh();
  const date = '2026-10-28';
  const plan = ensurePlan(s, bank, date);
  const drill = plan.blocks.find((b) => b.kind === 'drill' && b.itemIds.length)!;
  const sess = startBlock(s, bank, drill)!;
  const it = bank.byId.get(sess.itemIds[0])!;
  const g = submitAnswer(s, bank, { sessionId: sess.id, itemId: it.id, response: it.answer ?? { A: '1' }, seconds: 50, date });
  assert.equal(g!.correct, true);
  assert.equal(s.attempts.length, 1);
  finishSession(s, bank, sess.id, date);
  assert.equal(drill.status, 'done');

  const mockBlock = plan.blocks.find((b) => b.kind === 'mock' && b.mock!.kind === 'science')!;
  const ms = startBlock(s, bank, mockBlock)!;
  assert.equal(ms.exam, true);
  assert.equal(ms.timeLimitSec, 4800);
  for (const id of ms.itemIds.slice(0, 10)) {
    const x = bank.byId.get(id)!;
    assert.equal(submitAnswer(s, bank, { sessionId: ms.id, itemId: id, response: x.answer!, seconds: 60, date }), null);
  }
  assert.equal(s.attempts.length, 1, 'mock answers not graded yet');
  const res = finishSession(s, bank, ms.id, date);
  assert.equal(res.correct, 10);
  assert.ok(res.mock && res.mock.total === 39);
  assert.equal(s.attempts.length, 1 + 39);
  assert.ok(s.mocks.length === 1 && s.mocks[0].bySubject!.physics!.total === 19);
  const corr = plan.blocks.find((b) => b.reviewOfMock?.kind === 'science')!;
  const cs = startBlock(s, bank, corr)!;
  assert.equal(cs.itemIds.length, 29, 'correction = wrong or unanswered mock items');
  const sch = mockSchedule(s, bank);
  assert.equal(sch[0].parts.find((p) => p.kind === 'science')!.done, true);
});

test('regenerate keeps finished blocks', () => {
  const s = fresh();
  const date = '2026-10-21';
  const plan = ensurePlan(s, bank, date);
  plan.blocks[1].status = 'done';
  const keep = plan.blocks[1].itemIds.join();
  s.profile.dayMinutes[date] = 180;
  const next = regeneratePlan(s, bank, date);
  assert.ok(next.blocks.some((b) => b.status === 'done' && b.itemIds.join() === keep));
});

test('vocab queue and SRS per skill', () => {
  const s = fresh();
  const q = vocabQueue(s, bank, '2026-10-20', 30);
  assert.equal(q.length, 60);
  recordVocab(s, { vocabId: 'w0', skill: 'read', correct: true, response: 'ご', seconds: 3, date: '2026-10-20' });
  assert.equal(s.vocab.w0.read!.due, '2026-10-21');
});

test('study date rolls over at 04:00', () => {
  assert.equal(studyDate(new Date('2026-10-21T02:30:00')), '2026-10-20');
  assert.equal(studyDate(new Date('2026-10-21T04:30:00')), '2026-10-21');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
});

test('markup parser: math, boxes, emphasis, tables', () => {
  const blocks = parseBlocks('第1段 **太字 $x^2$** と __下線__\n改行\n\n$$\\int_0^1 x\\,dx$$\n\n| a | b |\n|---|---|\n| 1 | $\\bx{A}$ |\n\n- 項目1\n- 項目2');
  assert.equal(blocks.length, 4);
  assert.equal(blocks[1].type, 'math');
  assert.equal(blocks[2].type, 'table');
  assert.equal(blocks[3].type, 'list');
  const inl = parseInline('値は \\bx{AB} で、価格は \\$5');
  assert.ok(inl.some((x) => x.type === 'box' && x.label === 'AB'));
  assert.ok(inl.some((x) => x.type === 'text' && x.text.includes('$5')));
  assert.equal(collectMath('a $x$ b $$y$$').length, 2);
  assert.ok(parseInline('a ** b').some((x) => x.type === 'text' && x.text === '**'));
});

test('v1 migration keeps the learner record', () => {
  const p = '~/Projects/eju-study/data/state.json';
  if (!fs.existsSync(p)) return;
  const v1 = JSON.parse(fs.readFileSync(p, 'utf8'));
  const s = migrateV1(v1, NOW);
  assert.equal(s.version, 2);
  assert.equal(s.vocabAttempts.length, 41);
  assert.equal(s.profile.baseline.math, 121);
  assert.equal(s.profile.targets.japanese, 325);
  assert.equal(s.vocab.vx185.meaning!.box, 0);
  assert.equal(s.vocab.vx290.read!.lastCorrect, false);
  assert.ok(s.journal.some((j) => j.text.includes('听声')));
  assert.equal(s.settings.musicEnabled, false);
  assert.ok(s.legacy);
});

test('regenerate plans only the remaining time and never duplicates vocab', () => {
  const s = fresh();
  const date = '2026-10-21';
  const plan = ensurePlan(s, bank, date);
  const vocab = plan.blocks.find((b) => b.kind === 'vocab')!;
  vocab.status = 'done';
  const drill = plan.blocks.find((b) => b.kind === 'drill')!;
  drill.status = 'done';
  const next = regeneratePlan(s, bank, date);
  assert.equal(next.blocks.filter((b) => b.kind === 'vocab').length, 1);
  const total = next.blocks.reduce((n, b) => n + b.minutes, 0);
  assert.ok(total <= 360 * 1.12, `regenerated total ${total}`);
  const ids = next.blocks.flatMap((b) => b.itemIds);
  assert.equal(new Set(ids).size, ids.length);
});

test('kana-only words skip the reading skill', () => {
  const s = fresh();
  const b2 = { ...bank, bundle: { ...bank.bundle, vocab: [{ id: 'k1', word: 'むしろ', reading: 'むしろ', meaningZh: '与其说…不如说', category: 'reading' as const }] } };
  const q = vocabQueue(s, b2, '2026-10-20', 10);
  assert.deepEqual(q.map((x) => x.skill), ['meaning']);
});
