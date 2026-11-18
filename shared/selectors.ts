import type { AppState } from './types.ts';
import type { BankIndex } from './bank.ts';
import { budgetFor, phaseFor, weekDates } from './calendar.ts';
import { addDays, dateRange, monday } from './dates.ts';
import { buildDayPlan, mockSchedule } from './planner.ts';
import { mastery, predictions, reviewQueue } from './stats.ts';

export function todayView(s: AppState, bank: BankIndex, date: string) {
  const plan = buildDayPlan(s, bank, date, date);
  const sessionId = s.activeSessionId;
  if (sessionId) return { plan, next: { code: 'resume_session', sessionId } };
  const block = plan.blocks.find((b) => b.status === 'active') ?? plan.blocks.find((b) => b.status === 'todo');
  if (block)
    return {
      plan,
      next: { code: block.status === 'active' ? 'continue_block' : 'start_block', blockId: block.id, why: block.why },
    };
  const from = date < s.profile.startDate ? s.profile.startDate : addDays(date, 1);
  const nextDate = dateRange(from, s.profile.examDate).find((d) => budgetFor(s, d, date) > 0) ?? null;
  return { plan, next: { code: plan.blocks.length ? 'day_complete' : 'rest', nextDate } };
}
export function planView(s: AppState, bank: BankIndex, date: string, asOf: string) {
  const schedule = mockSchedule(s, bank, asOf);
  const roadmap = dateRange(s.profile.startDate, s.profile.examDate).map((d) => ({
    date: d,
    phase: phaseFor(s, d),
    minutes: s.plans[d]?.budgetMinutes ?? budgetFor(s, d, d < asOf ? s.profile.startDate : asOf),
  }));
  const week = dateRange(monday(date), addDays(monday(date), 6)).map((d) =>
    buildDayPlan(s, bank, d, d < asOf ? s.profile.startDate : asOf, schedule),
  );
  return {
    roadmap,
    week,
    milestones: s.profile.milestones,
    mocks: schedule.map(({ date, anchor, paper, done }) => ({
      date,
      anchor,
      kind: paper.kind,
      session: paper.session,
      done,
    })),
  };
}
export function weeklyReview(s: AppState, bank: BankIndex, date: string) {
  const start = monday(date),
    end = addDays(start, 6);
  const dates = dateRange(start, date);
  const plannedDates = weekDates(s, start, start);
  const seconds = dates.reduce((sum, d) => sum + (s.days[d]?.seconds ?? 0), 0);
  const plannedMinutes = plannedDates.reduce(
    (sum, d) => sum + (s.plans[d]?.budgetMinutes ?? budgetFor(s, d, start)),
    0,
  );
  const schedule = mockSchedule(s, bank, start);
  const plannedFocusMinutes = plannedDates.reduce((sum, d) => {
    const plan = buildDayPlan(s, bank, d, start, schedule);
    return sum + plan.blocks.filter((b) => b.kind !== 'break').reduce((n, b) => n + b.minutes, 0);
  }, 0);
  const blocks = dates.flatMap((d) => s.plans[d]?.blocks ?? []).filter((b) => b.kind !== 'break');
  const attempts = s.attempts.filter((a) => a.date >= start && a.date <= date);
  const before = new Map(mastery(s, bank, addDays(start, -1)).map((r) => [r.topic, r.value]));
  const current = mastery(s, bank, date);
  const studied = new Set(attempts.map((a) => a.topic));
  const gains = current
    .filter((r) => studied.has(r.topic))
    .map((r) => ({ topic: r.topic, delta: r.value - before.get(r.topic)! }))
    .filter((r) => r.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3);
  const focus = current
    .slice()
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3)
    .map((r) => ({ topic: r.topic, mastery: r.value, weight: r.weight }));
  const due = reviewQueue(s, bank, date).filter((r) => r.due).length;
  return {
    start,
    end,
    through: date,
    seconds,
    plannedMinutes,
    plannedDays: plannedDates.length,
    activeDays: dates.filter(
      (d) => s.days[d]?.seconds || s.days[d]?.answered || s.plans[d]?.blocks.some((b) => b.status === 'done'),
    ).length,
    plannedFocusMinutes,
    timeCompletion: plannedFocusMinutes ? Math.min(1, seconds / (60 * plannedFocusMinutes)) : null,
    blocksDone: blocks.filter((b) => b.status === 'done').length,
    blocksOpenedPlan: blocks.length,
    attempts: attempts.length,
    correct: attempts.filter((a) => a.correct).length,
    gains,
    focus,
    due,
    adjustments: [
      ...focus.map((r) => ({ code: 'focus_topic', topic: r.topic })),
      ...(due ? [{ code: 'review_due', count: due }] : []),
    ],
  };
}
export function statsView(s: AppState, bank: BankIndex, date: string) {
  return {
    mastery: mastery(s, bank, date),
    predictions: predictions(s, bank, date),
    days: Object.fromEntries(Object.entries(s.days).filter(([d]) => d <= date)),
    weekly: weeklyReview(s, bank, date),
  };
}
export function practiceView(
  bank: BankIndex,
  filter: { subject?: string; topic?: string; q?: string; school?: string; session?: string; format?: string },
) {
  const q = filter.q?.trim().toLowerCase();
  return {
    items: bank.bundle.items.filter(
      (it) =>
        (!filter.subject || it.subject === filter.subject) &&
        (!filter.topic || it.topic === filter.topic || it.topic.startsWith(filter.topic + '.')) &&
        (!filter.school || it.source.school === filter.school) &&
        (!filter.session || it.source.session === filter.session) &&
        (!filter.format || it.format === filter.format) &&
        (!q ||
          [it.stem, it.stemZh, it.id, it.source.label, it.topic, bank.topics.get(it.topic)?.name, ...(it.tags ?? [])]
            .join(' ')
            .toLowerCase()
            .includes(q)),
    ),
  };
}
