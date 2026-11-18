import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StateStore } from '../server/store.ts';
import { bank, fresh, now, written } from './fixtures.ts';
import { gradeItem, writtenPoints } from '../shared/grading.ts';
import { applyAction } from '../shared/actions.ts';
import { migrateV2 } from '../shared/migrate.ts';
import { buildDayPlan } from '../shared/planner.ts';
import { todayView } from '../shared/selectors.ts';
import { parseBlocks, parseInline, collectMath } from '../shared/markup.ts';
import type { Item, PracticeSession } from '../shared/types.ts';

test('coach defaults migrate once on disk, preserving custom models and effort', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eju-coach-settings-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state-v3.json');
  assert.equal(fresh().settings.coachModel, 'gpt-6.2-sol');
  assert.equal(fresh().settings.coachEffort, 'medium');
  for (const model of ['gpt-6.2-astra', 'custom-model']) {
    const state = fresh();
    delete state.coachDefaultsVersion;
    state.settings.coachModel = model;
    state.settings.coachEffort = 'high';
    fs.writeFileSync(file, JSON.stringify(state));
    const store = new StateStore(dir, bank);
    assert.equal(store.get().settings.coachModel, model === 'custom-model' ? model : 'gpt-6.2-sol');
    assert.equal(store.get().settings.coachEffort, 'high');
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), store.get());
    assert.ok(store.transact(0, { type: 'settings', patch: { coachModel: 'gpt-6.2-astra' } }, bank).ok);
    assert.equal(new StateStore(dir, bank).get().settings.coachModel, 'gpt-6.2-astra');
  }
});

test('migrate a copy of the actual v2 file, verify every STEM row, preserve archive, reload v3 and CAS', (t) => {
  const original = new URL('../data/state-v2.json', import.meta.url);
  if (!fs.existsSync(original)) {
    t.skip('private learner file unavailable in this checkout');
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eju-migrate-copy-'));
  try {
    const copy = path.join(dir, 'state-v2.json');
    fs.copyFileSync(original, copy);
    const bytes = fs.readFileSync(copy);
    fs.chmodSync(copy, 0o400);
    const old = JSON.parse(bytes.toString());
    const store = new StateStore(dir, bank);
    const s = store.get();
    const keep = old.attempts.filter((a: Item) => ['math', 'physics', 'chemistry'].includes(a.subject));
    assert.deepEqual(s.attempts, keep);
    for (const a of keep) assert.deepEqual(s.progress[a.itemId], old.progress[a.itemId]);
    assert.equal(
      Object.keys(s.progress).some((k) => /-ja-|recall-terms/.test(k)),
      false,
    );
    assert.deepEqual(s.legacy?.v2, old);
    assert.equal(s.activeSessionId, undefined);
    assert.equal(s.profile.onboarded, false);
    assert.deepEqual(s.profile.baseline, { math: 132, physics: 54, chemistry: 66 });
    assert.equal(s.profile.dailyMinutes, 120);
    assert.equal(s.version, 3);
    assert.deepEqual(new StateStore(dir, bank).get(), s);
    const a = { type: 'settings', patch: { fontScale: 1.25 } } as const;
    assert.equal(store.transact(0, a, bank, now).ok, true);
    assert.equal(store.transact(0, a, bank, now).ok, false);
    assert.equal(store.transact(1, { type: 'profile', patch: { weekdays: [9] } }, bank, now).ok, false);
    assert.equal(new StateStore(dir, bank).get().revision, 1);
    assert.ok(store.listBackups().length);
    assert.deepEqual(fs.readFileSync(copy), bytes);
    assert.deepEqual(fs.readFileSync(original), bytes);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('removed STEM items keep evidence and progress; vocabulary, mixed time and old goals stay archived', () => {
  const a = {
    id: 'a',
    itemId: 'retired',
    subject: 'math',
    topic: 'math.seq.seq',
    date: '2026-10-20',
    seconds: 15,
    correct: true,
  };
  const p = { attempts: 2, correct: 1, starred: true, note: '公式' };
  const old = {
    version: 2,
    attempts: [a, { ...a, subject: 'japanese', itemId: 'recall-terms-1' }],
    progress: { retired: p, 'recall-terms-1': p, '2017_1-math-I2': p },
    mocks: [],
    vocab: { x: 1 },
    days: { '2026-10-20': { seconds: 800 } },
    journal: [{ text: '旧笔记' }],
  };
  const s = migrateV2(old, bank, now);
  assert.deepEqual(s.attempts, [a]);
  assert.deepEqual(s.days[a.date], { answered: 1, correct: 1, seconds: 15 });
  assert.deepEqual(s.progress.retired, p);
  assert.deepEqual(s.progress['2017_1-math-I2'], p);
  assert.deepEqual(s.legacy?.v2, old);
  assert.equal('vocab' in s, false);
  assert.throws(() => migrateV2({ version: 1 }, bank, now));
});
test('self rubric grading, blank groups, attempts counted once and session resumes', () => {
  const s = fresh(),
    sample = { method: 'self' as const, marks: { '1': [4, 0] }, text: '磁束' };
  assert.deepEqual(writtenPoints(written, sample), { earned: 4, possible: 10 });
  assert.throws(() => writtenPoints(written, { ...sample, marks: { '1': [5, 0] } }));
  assert.throws(() => writtenPoints(written, { ...sample, marks: { '1': [2, 0] } }));
  assert.throws(() => writtenPoints(written, { ...sample, marks: { '1': [4] } }));
  const session = applyAction(s, bank, { type: 'startPractice', itemIds: [written.id] }, now) as PracticeSession;
  applyAction(
    s,
    bank,
    { type: 'draft', sessionId: session.id, itemId: written.id, response: { text: '磁束' }, seconds: 32 },
    now,
  );
  assert.equal(todayView(s, bank, '2026-11-19').next.code, 'resume_session');
  const action = { type: 'answer' as const, sessionId: session.id, itemId: written.id, response: sample, seconds: 35 };
  assert.deepEqual(applyAction(s, bank, action, now), { correct: false, score: 0.4 });
  assert.throws(() => applyAction(s, bank, action, now));
  assert.equal(s.attempts.length, 1);
  applyAction(s, bank, { type: 'tick', sessionId: session.id, seconds: 35 }, now);
  applyAction(s, bank, { type: 'finish', sessionId: session.id }, now);
  assert.equal(s.days['2026-11-19'].seconds, 35);
  assert.throws(() => applyAction(s, bank, action, now));
  const blank = {
    ...written,
    format: 'blanks',
    stem: String.raw`口 \\bx{AB} と \\bx{C}`,
    blanks: { A: '-', B: '2', C: '1' },
  } as Item;
  assert.equal(gradeItem(blank, { A: '－', B: '２', C: '9' }).score, 0.5);
});
test('school paper seal, offline rubric marking and EJU blanks/timeout', () => {
  const s = fresh(),
    p = bank.papers.find((p) => p.kind === 'school')!;
  const session = applyAction(s, bank, { type: 'startMock', kind: p.kind, session: p.session }, now) as PracticeSession;
  const draft = {
    type: 'answer' as const,
    itemId: written.id,
    sessionId: session.id,
    response: { text: 'V=BLv' },
    seconds: 20,
  };
  applyAction(s, bank, draft, now);
  assert.equal(s.attempts.length, 0);
  const finish = { type: 'finish' as const, sessionId: session.id };
  assert.deepEqual(applyAction(s, bank, finish, now), { pendingWritten: [written.id] });
  const marked = { method: 'ai' as const, marks: { '1': [2, 6] }, text: 'V=BLv' };
  assert.throws(() => applyAction(s, bank, { ...draft, response: { ...marked, text: 'changed' } }, now));
  applyAction(s, bank, { ...draft, response: marked }, now);
  applyAction(s, bank, finish, now);
  assert.equal(s.mocks[0].raw, 0.8);
  assert.equal(s.mocks[0].estimate, null);
  assert.equal(s.attempts.length, 1);
  const paper = bank.papers.find((p) => p.kind === 'science')!;
  const timed = applyAction(
    s,
    bank,
    { type: 'startMock', kind: paper.kind, session: paper.session },
    now,
  ) as PracticeSession;
  const answer = { type: 'answer' as const, sessionId: timed.id, itemId: timed.itemIds[0], response: 1, seconds: 30 };
  assert.throws(() => applyAction(s, bank, answer, new Date(now.getTime() + 4801e3)));
  applyAction(s, bank, answer, now);
  applyAction(s, bank, { type: 'finish', sessionId: timed.id }, now);
  assert.equal(s.mocks[1].answered, 1);
  assert.equal(s.mocks[1].correct, 1);
  assert.equal(s.mocks[1].total, paper.itemIds.length);
  assert.ok(s.mocks[1].estimate! > 0 && s.mocks[1].estimate! < 200);
  assert.equal(s.attempts.length, 1 + paper.itemIds.length);
});
test('walk an entire guided day including breaks, reloadable status and recommendation', () => {
  const s = fresh(),
    d = '2026-11-19';
  const plan = buildDayPlan(s, bank, d);
  for (const b of plan.blocks) {
    const next = todayView(s, bank, d).next;
    assert.equal(next.blockId, b.id);
    const result = applyAction(s, bank, { type: 'startBlock', date: d, blockId: b.id }, now) as PracticeSession;
    if (b.itemIds.length) {
      const item = bank.byId.get(b.itemIds[0])!;
      applyAction(
        s,
        bank,
        { type: 'answer', sessionId: result.id, itemId: item.id, response: item.answer!, seconds: 75 },
        now,
      );
      applyAction(s, bank, { type: 'finish', sessionId: result.id }, now);
    } else {
      assert.equal(todayView(s, bank, d).next.code, 'continue_block');
      applyAction(s, bank, { type: 'completeBlock', date: d, blockId: b.id }, now);
    }
  }
  assert.equal(todayView(s, bank, d).next.code, 'day_complete');
});
test('rich content still preserves printed boxes, math and tables', () => {
  const stem = String.raw`式 $x^2$，填 \\bx{AB}。`;
  assert.ok(parseInline(stem).some((n) => n.type === 'box' && n.label === 'AB'));
  assert.equal(collectMath(stem).length, 1);
  assert.ok(parseBlocks('| a | b |\n|---|---|\n| 1 | 2 |').some((b) => b.type === 'table'));
});

test('a scheduled full-paper finish wires correction to the same paper and separates it from the next day', () => {
  const s = fresh();
  const d = '2026-11-26',
    morning = new Date(d + 'T10:00:00');
  const block = buildDayPlan(s, bank, d, d).blocks.find((b) => b.kind === 'mock')!;
  const session = applyAction(s, bank, { type: 'startBlock', date: d, blockId: block.id }, morning) as PracticeSession;
  applyAction(s, bank, { type: 'finish', sessionId: session.id }, morning);
  const correction = s.plans[d].blocks.find((b) => b.why.code === 'mock_correction')!;
  assert.equal(correction.kind, 'review');
  assert.ok(correction.itemIds.length && correction.itemIds.every((id) => session.itemIds.includes(id)));
  assert.equal(buildDayPlan(s, bank, '2026-11-27', '2026-11-27').blocks.find((b) => b.mock)?.mock?.kind, 'science');
});
