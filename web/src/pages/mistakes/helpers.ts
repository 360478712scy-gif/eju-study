// Shared helpers for the mistake book, notes and stats pages (item previews, labels, sessions).
import type { AppState, Attempt, AttemptMode, Item, Subject } from '@shared/types.ts';
import type { BankIndex } from '@shared/bank.ts';
import { parseBlocks, type Inline } from '@shared/markup.ts';
import { daysBetween } from '@shared/dates.ts';
import { startSession } from '@shared/actions.ts';
import { update } from '../../lib/store.ts';
import { navigate } from '../../lib/router.ts';

export const SUBJECT_ORDER: Subject[] = ['math', 'physics', 'chemistry', 'japanese'];

export const MODE_LABEL: Record<AttemptMode, string> = {
  block: '计划',
  drill: '专项',
  review: '错题',
  mock: '模考',
  free: '练习',
};

/** Every attempt of every item, oldest first. */
export function attemptsByItem(attempts: Attempt[]): Map<string, Attempt[]> {
  const map = new Map<string, Attempt[]>();
  for (const a of attempts) {
    const list = map.get(a.itemId);
    if (list) list.push(a);
    else map.set(a.itemId, [a]);
  }
  return map;
}

export interface DueInfo {
  text: string;
  tone: 'warning' | 'primary' | 'neutral';
  days: number;
}

export function dueInfo(due: string | undefined, today: string): DueInfo | null {
  if (!due) return null;
  const n = daysBetween(today, due);
  if (n <= 0) return { text: '今天', tone: 'warning', days: n };
  if (n === 1) return { text: '明天', tone: 'primary', days: n };
  return { text: `${n} 天后`, tone: 'neutral', days: n };
}

export type ResultKind = 'right' | 'wrong' | 'guess' | 'gaveup' | 'partial' | 'none';

export function resultOf(a: Attempt | undefined): ResultKind {
  if (!a) return 'none';
  if (a.gaveUp) return 'gaveup';
  if (a.correct) return a.confidence === 'guess' ? 'guess' : 'right';
  if (a.score > 0) return 'partial';
  return 'wrong';
}

export const RESULT_TEXT: Record<ResultKind, string> = {
  right: '答对',
  wrong: '答错',
  guess: '猜对',
  gaveup: '没作答',
  partial: '部分对',
  none: '未做',
};

/** Short plain label of an item's source, e.g. "2016年第1回 物理 問7". */
export function sourceLabel(it: Item): string {
  return it.source.label.replace(/（解答番号\d+）/, '').trim();
}

function serialize(xs: Inline[], budget: { left: number }): string {
  let out = '';
  for (const x of xs) {
    if (budget.left <= 0) break;
    switch (x.type) {
      case 'text': {
        const t = x.text.replace(/\s+/g, ' ');
        const cut = t.length > budget.left ? t.slice(0, budget.left) + '…' : t;
        budget.left -= t.length;
        out += cut.replace(/\$/g, '\\$');
        break;
      }
      case 'math':
        if (x.display || x.tex.length > 60) {
          out += ' … ';
          budget.left -= 4;
        } else {
          out += `$${x.tex}$`;
          budget.left -= Math.min(12, Math.ceil(x.tex.length / 3));
        }
        break;
      case 'box':
        out += ` \\bx{${x.label}} `;
        budget.left -= 2;
        break;
      case 'br':
        out += ' ';
        break;
      case 'strong':
      case 'u':
        out += serialize(x.children, budget);
        break;
    }
  }
  return out;
}

const snippetCache = new Map<string, string>();

/** First ~70 characters of the stem as single-line markup (math kept intact). */
export function stemSnippet(it: Item, max = 70): string {
  const hit = snippetCache.get(it.id);
  if (hit !== undefined) return hit;
  const budget = { left: max };
  // Listening items only carry a generic instruction; their options identify them better.
  if (it.audio && it.options?.length && it.stem.length < 60) {
    const s = it.options.map((o) => serialize([{ type: 'text', text: o.replace(/\$[^$]*\$/g, '…') }], { left: 24 })).join(' / ');
    snippetCache.set(it.id, s);
    return s;
  }
  const parts: string[] = [];
  for (const b of parseBlocks(it.stem)) {
    if (budget.left <= 0) break;
    if (b.type === 'p') parts.push(serialize(b.children, budget));
    else if (b.type === 'list') for (const li of b.items) parts.push(serialize(li, budget));
    else if (parts.length) {
      parts.push('…');
      budget.left -= 2;
    }
  }
  const s = parts.join(' ').replace(/\s+/g, ' ').trim();
  snippetCache.set(it.id, s);
  return s;
}

export function sessionSubject(items: Item[]): Subject | 'mixed' {
  const set = new Set(items.map((it) => it.subject));
  return set.size === 1 ? items[0].subject : 'mixed';
}

/** Start a practice session and open the player. */
export function launch(opts: { kind: 'review' | 'drill'; title: string; items: Item[]; exam?: boolean }) {
  if (!opts.items.length) return;
  const timed = !!opts.exam;
  const s = update((d) =>
    startSession(d, {
      kind: opts.kind,
      title: opts.title,
      subject: sessionSubject(opts.items),
      itemIds: opts.items.map((it) => it.id),
      exam: timed,
      timeLimitSec: timed ? opts.items.reduce((sum, it) => sum + it.targetSec, 0) : undefined,
    }),
  );
  navigate('/session/' + s.id);
}

/**
 * Drill order for a topic: unseen items first, then last-wrong, then the rest (least recent first).
 * Items sharing a passage stay together and in paper order.
 */
export function drillOrder(state: AppState, bank: BankIndex, topic: string, limit = 12): Item[] {
  const items = bank.byTopic.get(topic) || [];
  const units = new Map<string, Item[]>();
  for (const it of items) {
    const key = it.group || it.id;
    const list = units.get(key);
    if (list) list.push(it);
    else units.set(key, [it]);
  }
  const rank = (it: Item) => {
    const p = state.progress[it.id];
    if (!p || p.attempts === 0) return 0;
    if (!p.lastCorrect) return 1;
    return 2;
  };
  const ordered = [...units.values()]
    .map((list) => {
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const r = Math.min(...list.map(rank));
      const last = list.reduce((m, it) => {
        const at = state.progress[it.id]?.lastAt || '';
        return at > m ? at : m;
      }, '');
      return { list, r, last, key: list[0].id };
    })
    .sort((a, b) => a.r - b.r || a.last.localeCompare(b.last) || a.key.localeCompare(b.key));
  const out: Item[] = [];
  for (const u of ordered) {
    if (out.length && out.length + u.list.length > limit) break;
    out.push(...u.list);
  }
  return out;
}

export function fmtSec(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}分${String(r).padStart(2, '0')}秒` : `${m} 分钟`;
}

export function fmtMD(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}`;
}
