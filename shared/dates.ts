// Local-date helpers. A study day starts at 04:00 local time, so a late-night
// session at 02:00 still counts toward the previous day.

export const DAY_START_HOUR = 4;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Study date for a moment in time (local), honoring the 04:00 boundary. */
export function studyDate(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() - DAY_START_HOUR * 3600 * 1000);
  return formatDate(shifted);
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function weekdayZh(s: string): string {
  return `周${WEEKDAYS[parseDate(s).getDay()]}`;
}

export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return formatDate(parseDate(s)) === s;
}
