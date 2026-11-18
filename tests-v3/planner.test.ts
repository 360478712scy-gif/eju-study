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
