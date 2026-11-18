import test from 'node:test';
import assert from 'node:assert/strict';
import { bank, fresh, now, written } from './fixtures.ts';
import { buildDayPlan, mockSchedule } from '../shared/planner.ts';
import { addDays, dateRange, daysBetween, monday, studyDate } from '../shared/dates.ts';
import { weekDates } from '../shared/calendar.ts';
import { applyAction } from '../shared/actions.ts';
import { mastery, matchesTopic, predictions, reviewQueue } from '../shared/stats.ts';
import { todayView, weeklyReview } from '../shared/selectors.ts';
import type { Attempt } from '../shared/types.ts';

test('entire 214-day route: five days, exact budgets, distinct papers, progressive school work and weekly retrieval', () => {
  const s = fresh(),
    start = s.profile.startDate,
    exam = s.profile.examDate;
  const dates = dateRange(start, exam),
    schedule = mockSchedule(s, bank, start);
  const plans = dates.map((d) => buildDayPlan(s, bank, d, start, schedule));
  const active = plans.filter((p) => p.budgetMinutes);
  assert.equal(active.length, 153);
  const weekCounts = new Map<string, number>();
  let weak = 0,
    strong = 0,
    earlySchool = 0,
    springSchool = 0;
  for (const plan of active) {
    const { date, blocks, budgetMinutes } = plan;
    assert.equal(
      blocks.reduce((sum, b) => sum + b.minutes, 0),
      budgetMinutes,
    );
    assert.equal(budgetMinutes, daysBetween(date, exam) <= 7 ? 60 : 120);
    assert.ok(blocks.some((b) => b.kind === 'break'));
    const ids = blocks.flatMap((b) => b.itemIds);
    assert.equal(ids.length, new Set(ids).size);
    for (const b of blocks) {
      assert.ok(b.why.code);
      for (const id of b.itemIds) assert.ok(['math', 'physics', 'chemistry'].includes(bank.byId.get(id)!.subject));
      if (b.topic && matchesTopic(s.profile.weakTopics, b.topic)) weak += b.minutes;
      if (b.topic && matchesTopic(s.profile.strongTopics, b.topic)) strong += b.minutes;
      if (b.kind === 'school') {
        if (date < '2027-01-01') earlySchool += b.minutes;
        if (date.slice(0, 7) === '2027-04') springSchool += b.minutes;
      }
    }
    weekCounts.set(monday(date), (weekCounts.get(monday(date)) ?? 0) + 1);
  }
  assert.equal(weekCounts.get(monday(start)), 3);
  for (const [week, n] of weekCounts)
    if (week !== monday(start)) {
      assert.equal(n, 5, week);
      if (week < '2027-06-13')
        assert.ok(
          plans.some((p) => monday(p.date) === week && p.blocks.some((b) => b.kind === 'quiz')),
          week,
        );
    }
  assert.ok(earlySchool > 0 && springSchool > earlySchool);
  assert.ok(strong > 0 && weak > 3 * strong, `weak ${weak}, strong ${strong}`);
  assert.equal(plans.at(-1)!.blocks.length, 0);
  const maths = schedule.filter((e) => e.paper.kind === 'math');
  assert.equal(maths.length, 8);
  assert.equal(new Set(maths.map((m) => m.date!.slice(0, 7))).size, 8);
  for (let i = 1; i < maths.length; i++)
    assert.ok(
      daysBetween(maths[i - 1].date!, maths[i].date!) >= 26 && daysBetween(maths[i - 1].date!, maths[i].date!) <= 30,
    );
  assert.equal(new Set(schedule.map((m) => m.paper.kind + m.paper.session)).size, 16);
  for (const event of schedule)
    assert.ok(
      plans
        .find((p) => p.date === event.date)
        ?.blocks.some((b) => b.kind === 'mock' && b.itemIds.length === event.paper.itemIds.length),
    );
  assert.deepEqual(buildDayPlan(s, bank, start), buildDayPlan(s, bank, start));
});
test('moves, missed study days, rest weeks, and displaced monthly exams', () => {
  const s = fresh();
  const start = s.profile.startDate;
  applyAction(s, bank, { type: 'move', from: '2026-11-23', to: '2026-11-25' }, now);
  assert.deepEqual(weekDates(s, '2026-11-23', start), [
    '2026-11-24',
    '2026-11-25',
    '2026-11-26',
    '2026-11-27',
    '2026-11-28',
  ]);
  applyAction(s, bank, { type: 'move', from: '2026-11-30', to: '2026-12-09' }, now);
  assert.equal(weekDates(s, '2026-11-30', start).length, 4);
  assert.equal(weekDates(s, '2026-12-09', start).length, 6);
  const missed = fresh();
  const dates = weekDates(missed, '2026-11-23', '2026-11-24');
  assert.equal(dates.length, 5);
  assert.ok(dates.includes('2026-11-25') && !dates.includes('2026-11-23'));
  const first = mockSchedule(missed, bank, start)[0];
  const caught = mockSchedule(missed, bank, addDays(first.date!, 1))[0];
  assert.ok(caught.date! > first.date!);
  applyAction(missed, bank, { type: 'restWeek', date: first.date!, paused: true }, now);
  assert.equal(weekDates(missed, first.date!, start).length, 0);
  assert.ok(mockSchedule(missed, bank, start)[0].date! > addDays(monday(first.date!), 6));
  applyAction(missed, bank, { type: 'restWeek', date: first.date!, paused: false }, now);
  assert.equal(mockSchedule(missed, bank, start)[0].date, first.date);
});
test('results change difficulty, weak-topic priority, spaced retrieval, speed and uncertainty', () => {
  const s = fresh(),
    it = bank.byId.get('phys.em.induction1')!,
    d = studyDate(now);
  const row = () => mastery(s, bank, d).find((r) => r.topic === it.topic)!;
  const base = row();
  const estimate = predictions(s, bank, d);
  const start = applyAction(s, bank, { type: 'startPractice', itemIds: [it.id] }, now) as { id: string };
  assert.equal(todayView(s, bank, d).next.code, 'resume_session');
  applyAction(
    s,
    bank,
    { type: 'answer', sessionId: start.id, itemId: it.id, seconds: 500, confidence: 'guess', response: 1 },
    now,
  );
  assert.equal(s.progress[it.id].slow, true);
  assert.equal(s.progress[it.id].due, addDays(d, 1));
  const queued = reviewQueue(s, bank, addDays(d, 1)).find((r) => r.itemId === it.id)!;
  assert.ok(['mistake', 'guess', 'slow', 'spaced'].every((k) => queued.reasons.includes(k)));
  assert.deepEqual(predictions(s, bank, d), estimate);
  for (let i = 0; i < 18; i++)
    s.attempts.push({ ...s.attempts[0], firstTry: true, seconds: 170, confidence: 'sure' } as Attempt);
  assert.ok(row().value > base.value && row().difficulty > base.difficulty);
  assert.ok(mastery(s, bank, addDays(d, 90)).find((r) => r.topic === it.topic)!.value < row().value);
  const weekly = weeklyReview(s, bank, d);
  assert.ok(weekly.gains.some((r) => r.topic === it.topic));
  assert.ok(weekly.focus.length && weekly.adjustments.length);
  assert.ok(estimate.every((p) => p.evidence === 'sparse' && p.range[0] < p.estimate && p.range[1] > p.estimate));
  assert.ok(reviewQueue(s, bank, d).some((r) => r.reasons.includes('card')));
  assert.ok(bank.papers.some((p) => p.kind === 'school' && p.itemIds.includes(written.id)));
});

test('published STEM bank supports the full route and allocates more actual question time per weak topic', async (t) => {
  const fs = await import('node:fs');
  const { indexBank } = await import('../shared/bank.ts');
  const file = new URL('../content/dist/bank.json', import.meta.url);
  if (!fs.existsSync(file)) {
    t.skip('build:content creates the local distribution');
    return;
  }
  const actual = indexBank(JSON.parse(fs.readFileSync(file, 'utf8'))),
    s = fresh(),
    start = s.profile.startDate;
  const schedule = mockSchedule(s, actual, start);
  assert.equal(schedule.length, 16);
  let weak = 0,
    strong = 0,
    days = 0,
    taper = 0,
    early = 0,
    late = 0;
  for (const d of dateRange(start, s.profile.examDate)) {
    const plan = buildDayPlan(s, actual, d, start, schedule);
    if (!plan.budgetMinutes) continue;
    days++;
    if (plan.phase === 'taper') taper++;
    assert.equal(
      plan.blocks.reduce((n, b) => n + b.minutes, 0),
      plan.phase === 'taper' ? 60 : 120,
    );
    for (const block of plan.blocks) {
      if (block.kind === 'school') {
        if (d < '2027-01') early += block.minutes;
        if (d.slice(0, 7) === '2027-04') late += block.minutes;
      }
      if (block.kind === 'mock') continue;
      for (const id of block.itemIds) {
        const it = actual.byId.get(id)!;
        assert.ok(['math', 'physics', 'chemistry'].includes(it.subject));
        if (matchesTopic(s.profile.weakTopics, it.topic)) weak += it.targetSec;
        if (matchesTopic(s.profile.strongTopics, it.topic)) strong += it.targetSec;
      }
    }
  }
  const count = (list: string[]) => [...actual.topics.keys()].filter((topic) => matchesTopic(list, topic)).length;
  assert.equal(days, 153);
  assert.equal(taper, 5);
  assert.ok(weak / count(s.profile.weakTopics) > (1.5 * strong) / count(s.profile.strongTopics));
  if (actual.bundle.items.some((it) => it.source.kind === 'school' && it.targetSec <= 1320))
    assert.ok(early > 0 && late > early);
});

test('long due math items get a retrieval slot even when their original paper is reserved', () => {
  const s = fresh(),
    it = { ...bank.byId.get('paper10math0')!, targetSec: 1200 };
  const longBank = { ...bank, byId: new Map(bank.byId).set(it.id, it) };
  s.progress[it.id] = {
    attempts: 1,
    correct: 0,
    lastCorrect: false,
    lastAt: '2026-11-17T05:00:00Z',
    lastScore: 0,
    due: '2026-11-18',
    inMistakes: true,
    box: 0,
  };
  const plan = buildDayPlan(s, longBank, '2026-11-19');
  assert.ok(plan.blocks.some((b) => b.kind === 'review' && b.itemIds.includes(it.id) && b.minutes >= 20));
});

test('resetting or reversing a cross-week move restores both weeks', () => {
  for (const undo of ['day', 'reverse']) {
    const s = fresh(),
      from = '2026-11-30',
      to = '2026-12-09';
    applyAction(s, bank, { type: 'move', from, to }, now);
    if (undo === 'day') applyAction(s, bank, { type: 'day', date: to, value: 'default' }, now);
    else applyAction(s, bank, { type: 'move', from: to, to: from }, now);
    assert.deepEqual(s.calendar, { moves: [], overrides: {}, restWeeks: [] });
  }
});

test('the first 11 specialist days cover all declared weak areas before adaptive focus', () => {
  const s = fresh();
  const start = s.profile.startDate;
  const schedule = mockSchedule(s, bank, start);
  const focus = dateRange(start, '2026-12-07').flatMap((date) =>
    buildDayPlan(s, bank, date, start, schedule).blocks.filter((block) => block.kind === 'learn'),
  );
  const expected = new Set([
    'phys.em.induction',
    'phys.em.capacitor',
    'phys.mech.spring',
    'phys.mech.pendulum',
    'chem.inorg',
    'chem.org',
    'chem.react.enthalpy',
    'math.seq.seq',
    'math.prob.count',
    'math.explog.func',
    'math.calc.int',
  ]);
  const firstRound = focus.slice(0, 11);
  assert.ok(firstRound.every((block) => block.why.code === 'weak_focus'));
  assert.deepEqual(
    new Set(
      firstRound.map((block) =>
        block.topic!.startsWith('chem.org.')
          ? 'chem.org'
          : block.topic!.startsWith('chem.inorg.')
            ? 'chem.inorg'
            : block.topic,
      ),
    ),
    expected,
  );
  for (const [i, block] of firstRound.entries()) {
    const priority = (item: typeof block) => item.why.weight! * (1 - item.why.mastery!);
    if (i) assert.ok(priority(firstRound[i - 1]) >= priority(block));
    assert.ok(block.itemIds.every((id) => bank.byId.get(id)?.topic === block.topic));
  }
  assert.equal(focus[11]?.why.code, 'topic_focus');

  const tomorrow = addDays(start, 1);
  assert.equal(todayView(s, bank, tomorrow).plan.blocks.find((b) => b.kind === 'learn')?.topic, firstRound[0].topic);
  s.plans[start] = buildDayPlan(s, bank, start);
  s.plans[start].blocks.find((b) => b.kind === 'learn')!.status = 'done';
  assert.equal(todayView(s, bank, tomorrow).plan.blocks.find((b) => b.kind === 'learn')?.topic, firstRound[1].topic);
});

test('school tasks expose the selected item school and purpose in new and saved plans', async () => {
  const { indexBank } = await import('../shared/bank.ts');
  for (const [school, purpose] of [
    ['aoyama', 'exam_style'],
    ['waseda', 'extension'],
  ] as const) {
    const s = fresh();
    const schoolBank = indexBank({
      ...bank.bundle,
      items: bank.bundle.items.map((it) => (it.id === written.id ? { ...it, source: { ...it.source, school } } : it)),
    });
    const date = '2026-12-01';
    const plan = buildDayPlan(s, schoolBank, date, s.profile.startDate);
    const block = plan.blocks.find((b) => b.kind === 'school')!;
    assert.deepEqual(block.itemIds, [written.id]);
    assert.equal(block.school, school);
    assert.equal(block.schoolPurpose, purpose);

    s.plans[date] = plan;
    delete block.school;
    delete block.schoolPurpose;
    delete block.why.school;
    delete block.why.schoolPurpose;
    const restored = todayView(s, schoolBank, date).plan.blocks.find((b) => b.kind === 'school')!;
    assert.equal(restored.school, school);
    assert.equal(restored.schoolPurpose, purpose);
    assert.equal(restored.why.school, school);
    assert.equal(restored.why.schoolPurpose, purpose);
  }
});
