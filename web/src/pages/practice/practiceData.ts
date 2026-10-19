// Pure helpers for the practice bank browser and the mock pages (no React).
import type { AppState, Item, ItemProgress, MockKind, Subject } from '@shared/types.ts';
import type { BankIndex } from '@shared/bank.ts';
import { mockItemsPadded, mockSchedule, reservedPadding, shortTopic, type ScheduledMock } from '@shared/planner.ts';

// ───────────────────────── Item status ─────────────────────────

export type ItemStatus = 'new' | 'right' | 'wrong';

export function itemStatus(p: ItemProgress | undefined): ItemStatus {
  if (!p || p.attempts === 0) return 'new';
  return p.lastCorrect ? 'right' : 'wrong';
}

/** "做错": in the mistake book, or the last attempt was wrong. */
export function isWrong(p: ItemProgress | undefined): boolean {
  return !!p && p.attempts > 0 && (p.inMistakes || !p.lastCorrect);
}

// ───────────────────────── Paper sections ─────────────────────────

export type SectionKey = 'math' | 'physics' | 'chemistry' | 'ja-reading' | 'ja-listening';

export interface SectionDef {
  key: SectionKey;
  name: string;
  short: string;
  subject: Subject;
  mock: MockKind;
}

export const SECTIONS: SectionDef[] = [
  { key: 'math', name: '数学', short: '数学', subject: 'math', mock: 'math' },
  { key: 'physics', name: '物理', short: '物理', subject: 'physics', mock: 'science' },
  { key: 'chemistry', name: '化学', short: '化学', subject: 'chemistry', mock: 'science' },
  { key: 'ja-reading', name: '日语读解', short: '读解', subject: 'japanese', mock: 'ja-reading' },
  { key: 'ja-listening', name: '日语听解', short: '听解', subject: 'japanese', mock: 'ja-listening' },
];

export function sectionOf(it: Item): SectionKey {
  if (it.subject !== 'japanese') return it.subject;
  return it.section === 'reading' ? 'ja-reading' : 'ja-listening';
}

/** Mock kind whose papers an item belongs to (used for "reserved for a scheduled mock"). */
export function mockKindOf(it: Item): MockKind {
  if (it.subject === 'math') return 'math';
  if (it.subject === 'physics' || it.subject === 'chemistry') return 'science';
  return it.section === 'reading' ? 'ja-reading' : 'ja-listening';
}

export function sectionItems(bank: BankIndex, key: SectionKey, session: string): Item[] {
  return (bank.bySession.get(session) || []).filter((it) => sectionOf(it) === key).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** "2016年第1回 物理 問1（解答番号1）" → "物理 問1". */
export function shortLabel(it: Item): string {
  let s = it.source.label;
  const sp = s.indexOf(' ');
  if (it.source.session && sp > 0) s = s.slice(sp + 1);
  return s.replace(/（[^）]*）/g, '').replace('数学コース2 ', '数学 ').replace('日本語 ', '').trim();
}

// ───────────────────────── Scheduled mocks ─────────────────────────

/** What upcoming scheduled mocks still need, so drills and the browser can keep it fresh. */
export interface ReservedMap {
  /** `${kind}:${session}` → the scheduled mock that still needs that paper. */
  papers: Map<string, ScheduledMock>;
  /** Original item id → the scheduled Japanese mock it pads to exam length. */
  padding: Map<string, ScheduledMock>;
}

const isJa = (kind: MockKind): kind is 'ja-reading' | 'ja-listening' => kind === 'ja-reading' || kind === 'ja-listening';

export function reservedMap(state: AppState, bank: BankIndex): ReservedMap {
  const schedule = mockSchedule(state, bank);
  const papers = new Map<string, ScheduledMock>();
  for (const sm of schedule) for (const p of sm.parts) if (!p.done && !papers.has(`${p.kind}:${p.session}`)) papers.set(`${p.kind}:${p.session}`, sm);
  // reservedPadding is the source of truth for which originals are held; walk the schedule in the
  // same order it fills them in only to say which mock each one pads.
  const held = reservedPadding(state, bank);
  const padding = new Map<string, ScheduledMock>();
  if (held.size) {
    const taken = new Set<string>();
    for (const sm of schedule) {
      for (const p of sm.parts) {
        if (p.done || !isJa(p.kind)) continue;
        for (const it of mockItemsPadded(state, bank, p.kind, p.session, taken)) {
          if (!held.has(it.id) || padding.has(it.id)) continue;
          padding.set(it.id, sm);
          taken.add(it.id);
        }
      }
    }
    const first = schedule.find((sm) => sm.parts.some((p) => !p.done && isJa(p.kind)));
    if (first) for (const id of held) if (!padding.has(id)) padding.set(id, first);
  }
  return { papers, padding };
}

/** The scheduled mock that still needs this item (its paper, or as Japanese padding). */
export function reservedFor(map: ReservedMap, it: Item): ScheduledMock | undefined {
  return (it.source.session ? map.papers.get(`${mockKindOf(it)}:${it.source.session}`) : undefined) ?? map.padding.get(it.id);
}

/** Held only as padding for a Japanese mock (an original, not a paper question). */
export function isPadding(map: ReservedMap, it: Item): boolean {
  return map.padding.has(it.id) && !(it.source.session && map.papers.has(`${mockKindOf(it)}:${it.source.session}`));
}

// ───────────────────────── Drill picking ─────────────────────────

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface DrillPick {
  ids: string[];
  /** Had to fall back to items held for a scheduled mock (its paper or its Japanese padding). */
  usesReserved: boolean;
}

/**
 * Pick about `n` items: never-seen first (official, easier first), then mistakes,
 * then the longest-unseen ones. Papers held for a scheduled mock, and the originals held to
 * pad Japanese mocks, are skipped unless nothing else is left. Passages (group) stay together.
 */
export function pickDrill(state: AppState, items: Item[], n: number, reserved: ReservedMap, seed: string): DrillPick {
  const usable = items.filter((it) => it.verified.status !== 'disputed');
  const open = usable.filter((it) => !reservedFor(reserved, it));
  const pool = open.length ? open : usable;
  const tier = (it: Item) => {
    const p = state.progress[it.id];
    if (!p || p.attempts === 0) return 0;
    if (p.inMistakes || !p.lastCorrect) return 1;
    return 2;
  };
  const key = (it: Item) => {
    const p = state.progress[it.id];
    const t = tier(it);
    if (t === 0) return [0, it.source.kind === 'official' ? 0 : 1, it.difficulty, hash(seed + it.id) % 1000] as const;
    if (t === 1) return [1, 0, 0, Date.parse(p?.due || p?.lastAt || '') || 0] as const;
    return [2, 0, 0, Date.parse(p?.lastAt || '') || 0] as const;
  };
  const sorted = [...pool].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return 0;
  });
  const picked: Item[] = [];
  const seen = new Set<string>();
  for (const it of sorted) {
    if (picked.length >= n) break;
    if (seen.has(it.id)) continue;
    const mates = it.group ? pool.filter((x) => x.group === it.group).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : [it];
    for (const x of mates) {
      if (!seen.has(x.id)) {
        seen.add(x.id);
        picked.push(x);
      }
    }
  }
  return { ids: picked.map((it) => it.id), usesReserved: !open.length && picked.length > 0 };
}

export function drillTitle(bank: BankIndex, topic: string, count: number): string {
  return `${shortTopic(bank, topic)} · 专项 ${count} 题`;
}

export function isWeakTopic(weak: string[], id: string): boolean {
  return weak.some((w) => id === w || id.startsWith(w + '.'));
}

// ───────────────────────── Search ─────────────────────────

export function norm(s: string): string {
  return s.normalize('NFKC').toLowerCase();
}

interface Field {
  label: string;
  text: string;
}

function fields(bank: BankIndex, it: Item): Field[] {
  const t = bank.topics.get(it.topic);
  const ex = it.explanation;
  return [
    { label: '题干', text: it.stem },
    { label: '中文对照', text: it.stemZh || '' },
    { label: '选项', text: (it.options || []).join(' ／ ') },
    { label: '解析', text: ex.zh },
    { label: '考点', text: [...(ex.keyPoints || []), ...(ex.traps || []), ex.shortcut || ''].join(' ／ ') },
    { label: '术语', text: (ex.terms || []).map((x) => `${x.ja} ${x.kana || ''} ${x.zh}`).join(' ／ ') },
    { label: '听力原文', text: it.transcript || '' },
    { label: '考点', text: `${t?.name || ''} ${t?.ja || ''} ${t?.unitName || ''}` },
    { label: '出处', text: it.source.label },
  ];
}

export interface SearchIndex {
  get(id: string): string | undefined;
}

export function buildSearchIndex(bank: BankIndex): Map<string, string> {
  const m = new Map<string, string>();
  for (const it of bank.bundle.items) m.set(it.id, norm(fields(bank, it).map((f) => f.text).join('\n')));
  return m;
}

export function queryTerms(q: string): string[] {
  return norm(q)
    .split(/[\s　]+/)
    .filter(Boolean);
}

export function matches(index: SearchIndex, id: string, terms: string[]): boolean {
  if (!terms.length) return true;
  const doc = index.get(id);
  return !!doc && terms.every((t) => doc.includes(t));
}

/** Plain text without math / markup, for excerpts. */
export function plain(s: string): string {
  return s
    .replace(/\$\$[\s\S]*?\$\$/g, ' ⋯ ')
    .replace(/\$[^$\n]*\$/g, '⋯')
    .replace(/\\bx\{[A-Z]+\}/g, '□')
    .replace(/\*\*|__/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface Excerpt {
  label: string;
  before: string;
  hit: string;
  after: string;
}

/** Where the first search term matched, with a little context. */
export function excerpt(bank: BankIndex, it: Item, terms: string[]): Excerpt | null {
  if (!terms.length) return null;
  const term = terms[0];
  for (const f of fields(bank, it)) {
    if (!f.text || f.label === '出处') continue;
    const text = plain(f.text);
    const n = text.normalize('NFKC');
    const src = n.length === text.length ? text : n;
    const at = n.toLowerCase().indexOf(term);
    if (at < 0) continue;
    const from = Math.max(0, at - 26);
    const to = Math.min(src.length, at + term.length + 40);
    return {
      label: f.label,
      before: (from > 0 ? '…' : '') + src.slice(from, at),
      hit: src.slice(at, at + term.length),
      after: src.slice(at + term.length, to) + (to < src.length ? '…' : ''),
    };
  }
  return null;
}

/** A short markup snippet that tells items apart in a list (rendered inline, clamped). */
export function snippet(it: Item): string {
  if (it.section === 'listening' && it.options?.length) return it.options.join(' ／ ');
  const paras = it.stem
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p && !/^\$\$[\s\S]*\$\$$/.test(p) && !/^（.*）$/.test(p) && p !== '…（略）…')
    // Paper-level instructions shared by a whole 大問 ("次の問い A（問1）… に答えなさい").
    .filter((p) => !/次の問い[\s\S]*答えなさい/.test(p) && !/^（大問/.test(p));
  if (it.section === 'reading' || it.section === 'listening-reading') {
    const q = paras[paras.length - 1] || '';
    return q.replace(/\$\$/g, '$').replace(/\n/g, ' ');
  }
  let out = '';
  for (const p of paras) {
    if (/^注）/.test(p)) continue;
    out += (out ? ' ' : '') + p;
    if (out.length >= 70) break;
  }
  return out.replace(/\$\$/g, '$').replace(/\n/g, ' ');
}

// ───────────────────────── Misc ─────────────────────────

export function lastAttemptOf(state: AppState, itemId: string) {
  for (let i = state.attempts.length - 1; i >= 0; i--) if (state.attempts[i].itemId === itemId) return state.attempts[i];
  return undefined;
}

export function sessionRank(session: string | undefined): number {
  if (!session) return 0;
  const [y, n] = session.split('_').map(Number);
  return y * 10 + n;
}
