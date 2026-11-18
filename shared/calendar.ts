import type { AppState, Phase } from './types.ts';
import { addDays, dateRange, daysBetween, isoWeekday, monday } from './dates.ts';

export function phaseFor(s: AppState, date: string): Phase {
  if (date < s.profile.startDate || date >= s.profile.examDate) return 'off';
  if (daysBetween(date, s.profile.examDate) <= 7) return 'taper';
  if (date > (s.profile.milestones[2]?.date ?? '2027-04-30')) return 'sprint';
  if (date > (s.profile.milestones[1]?.date ?? '2027-02-28')) return 'integrate';
  if (date > (s.profile.milestones[0]?.date ?? '2026-12-31')) return 'reinforce';
  return 'foundation';
}
export function hasActivity(s: AppState, date: string) {
  return !!(
    s.days[date]?.answered ||
    s.days[date]?.seconds ||
    s.plans[date]?.blocks.some((b) => b.status === 'done' || b.status === 'active')
  );
}
// Explicit off dates and past misses are replaced by available days in the SAME week.
// Partial first/last weeks retain only the number of regular dates inside the window.
export function weekDates(s: AppState, date: string, asOf: string): string[] {
  const start = monday(date);
  const week = dateRange(start, addDays(start, 6)).filter((d) => d >= s.profile.startDate && d < s.profile.examDate);
  const regular = week.filter((d) => s.profile.weekdays.includes(isoWeekday(d)));
  const transfers = s.calendar.moves.filter((m) => monday(m.from) !== monday(m.to));
  const target =
    regular.length +
    transfers.filter((m) => monday(m.to) === start).length -
    transfers.filter((m) => monday(m.from) === start).length;
  const chosen = new Set(week.filter((d) => hasActivity(s, d)));
  if (s.calendar.restWeeks.includes(start)) return [...chosen].sort();
  const available = week.filter((d) => d >= asOf && s.calendar.overrides[d] !== 'off');
  for (const d of available) if (s.calendar.overrides[d] === 'study') chosen.add(d);
  for (const d of [...regular, ...available]) if (chosen.size < target && available.includes(d)) chosen.add(d);
  return [...chosen].sort();
}
export function budgetFor(s: AppState, date: string, asOf: string) {
  if (!weekDates(s, date, asOf).includes(date)) return 0;
  return Math.round(s.profile.dailyMinutes * (phaseFor(s, date) === 'taper' ? 0.5 : 1));
}
