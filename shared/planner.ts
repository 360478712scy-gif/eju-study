// 19-day sprint planner. Pure and deterministic: same state + bank + date → same plan.
//
// Phases by days left until the exam (2026-11-08):
//   ≥12  foundation  专项突破: topic drills ranked by weakness × exam weight, timed science from day 1,
//                    daily listening, reading, grammar, recall checks and vocabulary
//   5–11 practice    套题实战: full timed mocks on fixed days (each followed by a repair day), timed sets
//   1–4  final       考前调整: one full simulation (D=4), then mistakes, rotating notes, a trap sheet
//   0    exam        exam day: no study blocks
//
// Supply rules: never-seen questions are rationed across the sprint so first tries keep coming;
// due mistakes are mixed into drills; papers reserved for scheduled mocks are held back.
import type { AppState, BlockKind, DayPlan, Item, MockKind, Phase, PlanBlock, Subject } from './types.ts';
import type { BankIndex } from './bank.ts';
import { mockItems, mockTimeLimit, MOCK_LABEL, sessionLabel } from './bank.ts';
import { addDays, daysBetween } from './dates.ts';
import { estimateAll, gapPoints, topicStats, type TopicStat } from './stats.ts';
import { isDue } from './srs.ts';

export const PLANNER_VERSION = 2;

export function daysLeftOn(state: AppState, date: string): number {
  return daysBetween(date, state.profile.examDate);
}

export function phaseFor(daysLeft: number): Phase {
  if (daysLeft <= 0) return 'exam';
  if (daysLeft <= 4) return 'final';
  if (daysLeft <= 11) return 'practice';
  return 'foundation';
}

export const PHASE_INFO: Record<Phase, { name: string; desc: string }> = {
  foundation: { name: '专项突破', desc: '按薄弱度×考频轮换专题，每天理科限时练速度，同时练听力、读解、文型和词汇。' },
  practice: { name: '套题实战', desc: '按真实时长整卷模考，模考后立即订正，第二天专攻模考暴露的弱点。' },
  final: { name: '考前调整', desc: '按考试当天时间表做一次全真模拟，之后以错题、薄弱考点和易错点清单为主，最后一天减量。' },
  exam: { name: '考试日', desc: '日语 9:30–12:00 · 理科 13:30–15:00 · 数学 15:40–17:10。带好受験票、身份证件、HB铅笔、手表。' },
};

export function budgetFor(state: AppState, date: string): number {
  const override = state.profile.dayMinutes[date];
  const base = typeof override === 'number' ? override : state.profile.dailyMinutes;
  const d = daysLeftOn(state, date);
  if (d <= 0) return 0;
  if (d === 1) return Math.min(base, 150);
  if (d <= 3) return Math.round(base * 0.85);
  return base;
}

// ─────────────────────────── Mock schedule ───────────────────────────

interface MockSlot {
  daysLeft: number;
  kinds: MockKind[];
  title: string;
}

/** Each math/science mock is followed by a non-mock day to repair what it exposed. */
export const MOCK_SLOTS: MockSlot[] = [
  { daysLeft: 11, kinds: ['science', 'math'], title: '数理整卷模考 ①' },
  { daysLeft: 10, kinds: ['ja-reading', 'ja-listening'], title: '日语整卷模考 ①' },
  { daysLeft: 8, kinds: ['science', 'math'], title: '数理整卷模考 ②' },
  { daysLeft: 6, kinds: ['science', 'math'], title: '数理整卷模考 ③' },
  { daysLeft: 4, kinds: ['ja-reading', 'ja-listening', 'science', 'math'], title: '全真模拟（按考试日时间表）' },
];

/** Preferred paper order for scheduled mocks (newest papers are kept for the latest mocks). */
const MOCK_PREFERENCE: Record<MockKind, string[]> = {
  science: ['2018_2', '2019_1', '2020_2', '2021_1', '2018_1', '2017_2'],
  math: ['2018_2', '2019_1', '2020_2', '2021_1', '2018_1', '2017_2'],
  'ja-reading': ['2017_2', '2016_1', '2017_1', '2016_2', '2018_1'],
  'ja-listening': ['2017_2', '2016_1', '2017_1', '2016_2', '2018_1'],
};

/** Full-length Japanese sections: real papers are partial, so they are padded with originals. */
export const JA_FULL: Record<'ja-reading' | 'ja-listening', number> = { 'ja-reading': 25, 'ja-listening': 27 };

export interface ScheduledMock {
  date: string;
  daysLeft: number;
  title: string;
  parts: { kind: MockKind; session: string; done: boolean }[];
}

function mockAvailable(bank: BankIndex, kind: MockKind, session: string): boolean {
  const n = mockItems(bank, kind, session).length;
  if (kind === 'math') return n >= 4;
  if (kind === 'science') return n >= 30;
  if (kind === 'ja-reading') return n >= 5;
  return n >= 10;
}

export function mockDone(state: AppState, kind: MockKind, session: string): boolean {
  return state.mocks.some((m) => m.kind === kind && m.session === session);
}

/** Assign papers to the fixed mock slots, skipping papers already used for a mock. */
export function mockSchedule(state: AppState, bank: BankIndex): ScheduledMock[] {
  const used = new Map<MockKind, Set<string>>();
  const out: ScheduledMock[] = [];
  for (const slot of MOCK_SLOTS) {
    const parts: ScheduledMock['parts'] = [];
    for (const kind of slot.kinds) {
      if (!used.has(kind)) used.set(kind, new Set());
      const taken = used.get(kind)!;
      const pref = MOCK_PREFERENCE[kind].filter((s) => mockAvailable(bank, kind, s));
      const session = pref.find((s) => !taken.has(s));
      if (!session) continue;
      taken.add(session);
      parts.push({ kind, session, done: mockDone(state, kind, session) });
    }
    if (parts.length) {
      out.push({ date: addDays(state.profile.examDate, -slot.daysLeft), daysLeft: slot.daysLeft, title: slot.title, parts });
    }
  }
  return out;
}

/** Sessions whose items are held back from drills because a scheduled mock still needs them. */
export function reservedSessions(state: AppState, bank: BankIndex, kinds: MockKind[]): Set<string> {
  const out = new Set<string>();
  for (const m of mockSchedule(state, bank)) for (const p of m.parts) if (!p.done && kinds.includes(p.kind)) out.add(p.session);
  return out;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Items for one mock section. Japanese papers on the JASSO site are partial (copyright), so
 * reading/listening sections are padded with never-seen original items to exam length.
 */
export function mockItemsPadded(state: AppState, bank: BankIndex, kind: MockKind, session: string, exclude?: Set<string>): Item[] {
  const base = mockItems(bank, kind, session);
  if (kind !== 'ja-reading' && kind !== 'ja-listening') return base;
  const want = JA_FULL[kind];
  if (base.length >= want) return base;
  const seen = new Set(state.attempts.map((a) => a.itemId));
  const pool = bank.bySubject.japanese
    .filter((it) => it.source.kind === 'original' && !seen.has(it.id) && !it.id.startsWith('recall-') && !exclude?.has(it.id))
    .filter((it) => (kind === 'ja-reading' ? it.section === 'reading' && it.topic.startsWith('ja.reading') : it.section === 'listening'))
    .sort((a, b) => (hash(session + a.id) % 1000) - (hash(session + b.id) % 1000));
  const out = [...base];
  const ids = new Set(out.map((it) => it.id));
  for (const it of pool) {
    if (out.length >= want) break;
    if (ids.has(it.id)) continue;
    const mates = it.group ? pool.filter((x) => x.group === it.group && !ids.has(x.id)) : [it];
    if (out.length + mates.length > want + 1) continue;
    for (const m of mates) {
      out.push(m);
      ids.add(m.id);
    }
  }
  return out;
}

/** Original items set aside to pad upcoming (not yet taken) Japanese mocks, so drills do not use them up. */
export function reservedPadding(state: AppState, bank: BankIndex): Set<string> {
  const out = new Set<string>();
  for (const m of mockSchedule(state, bank)) {
    for (const p of m.parts) {
      if (p.done || (p.kind !== 'ja-reading' && p.kind !== 'ja-listening')) continue;
      const base = new Set(mockItems(bank, p.kind, p.session).map((it) => it.id));
      for (const it of mockItemsPadded(state, bank, p.kind, p.session, out)) if (!base.has(it.id)) out.add(it.id);
    }
  }
  return out;
}

/** Time limit for a padded mock section (Japanese reading: 40 min for 25 questions). */
export function mockLimitFor(kind: MockKind, items: Item[]): number {
  if (kind === 'ja-reading') return Math.round(Math.min(40 * 60, (40 * 60 * items.length) / JA_FULL['ja-reading']));
  return mockTimeLimit(kind, items);
}

// ─────────────────────────── Pools ───────────────────────────

/** Planned seconds for an item including reading its explanation. */
export function planSeconds(it: Item, mode: 'drill' | 'review' | 'mock' | 'timed' = 'drill'): number {
  if (mode === 'mock') return it.targetSec;
  if (mode === 'timed') return it.targetSec + 30;
  // A math re-test only re-does the box groups that were wrong.
  if (it.subject === 'math') return Math.round(it.targetSec * (mode === 'review' ? 0.5 : 1.35));
  if (it.section === 'listening' || it.section === 'listening-reading') return it.targetSec + 60;
  if (it.subject === 'japanese') return it.targetSec + (it.topic.startsWith('ja.vocab') ? 15 : 45);
  if (it.id.startsWith('recall-')) return it.targetSec + 15;
  return it.targetSec + (mode === 'review' ? 45 : 60);
}

const minutesOf = (items: Item[], mode: 'drill' | 'review' | 'mock' | 'timed' = 'drill') =>
  Math.max(1, Math.round(items.reduce((s, it) => s + planSeconds(it, mode), 0) / 60));

type Pool = 'math' | 'physics' | 'chemistry' | 'ja-reading' | 'ja-listening' | 'ja-grammar' | 'recall';

const MAIN_POOLS: Pool[] = ['math', 'physics', 'chemistry', 'ja-reading', 'ja-listening'];

const POOL_SUBJECT: Record<Pool, Subject | 'mixed'> = {
  math: 'math',
  physics: 'physics',
  chemistry: 'chemistry',
  'ja-reading': 'japanese',
  'ja-listening': 'japanese',
  'ja-grammar': 'japanese',
  recall: 'mixed',
};

const POOL_KIND: Record<Pool, BlockKind> = {
  math: 'drill',
  physics: 'drill',
  chemistry: 'drill',
  'ja-reading': 'reading',
  'ja-listening': 'listening',
  'ja-grammar': 'reading',
  recall: 'drill',
};

const POOL_MOCK_KINDS: Record<Pool, MockKind[]> = {
  math: ['math'],
  physics: ['science'],
  chemistry: ['science'],
  'ja-reading': ['ja-reading'],
  'ja-listening': ['ja-listening'],
  'ja-grammar': [],
  recall: [],
};

export function inPool(it: Item, pool: Pool): boolean {
  const recall = it.id.startsWith('recall-');
  if (pool === 'recall') return recall;
  if (recall) return false;
  if (pool === 'ja-reading') return it.subject === 'japanese' && it.section === 'reading' && it.topic.startsWith('ja.reading');
  if (pool === 'ja-grammar') return it.subject === 'japanese' && it.topic.startsWith('ja.vocab');
  if (pool === 'ja-listening') return it.subject === 'japanese' && (it.section === 'listening' || it.section === 'listening-reading');
  return it.subject === pool;
}

function poolItems(bank: BankIndex, pool: Pool): Item[] {
  const s = POOL_SUBJECT[pool];
  const list = s === 'mixed' ? bank.bundle.items : bank.bySubject[s];
  return list.filter((it) => inPool(it, pool));
}

const BASE_WEIGHTS: Record<string, number> = {
  math: 0.28,
  physics: 0.19,
  chemistry: 0.17,
  'ja-reading': 0.17,
  'ja-listening': 0.19,
};

interface Ctx {
  state: AppState;
  bank: BankIndex;
  date: string;
  left: number;
  stats: Map<string, TopicStat>;
  seen: Map<string, string>;
  used: Set<string>;
  /** Originals held back to pad upcoming Japanese mocks. */
  padding: Set<string>;
  /** Never-seen items allowed per pool today (soft cap). */
  quota: Partial<Record<Pool, number>>;
  freshUsed: Partial<Record<Pool, number>>;
  topicsToday: Set<string>;
  topicsYesterday: Set<string>;
  blocks: PlanBlock[];
}

function weakBoost(state: AppState, topic: string): number {
  return state.profile.weakTopics.some((w) => topic === w || topic.startsWith(w + '.')) ? 1.35 : 1;
}

function lastSeen(state: AppState): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of state.attempts) m.set(a.itemId, a.date);
  return m;
}

function newBlock(ctx: Ctx, b: Omit<PlanBlock, 'id' | 'status'>): PlanBlock {
  const block: PlanBlock = { id: `${ctx.date}:${ctx.blocks.length + 1}`, status: 'todo', ...b };
  ctx.blocks.push(block);
  for (const id of b.itemIds) ctx.used.add(id);
  return block;
}

function topicName(bank: BankIndex, topic: string): string {
  return bank.topics.get(topic)?.name || topic;
}

/** "二次函数（最值·平移·不等式）" → "二次函数", "电场·电势·库仑定律" → "电场". */
export function shortTopic(bank: BankIndex, topic: string): string {
  return topicName(bank, topic).replace(/（[^）]*）/g, '').split('·')[0].trim();
}

/** Never-seen, non-reserved items left per main pool. */
export function freshRemaining(state: AppState, bank: BankIndex): Record<string, number> {
  const seen = lastSeen(state);
  const out: Record<string, number> = {};
  for (const pool of [...MAIN_POOLS, 'ja-grammar', 'recall'] as Pool[]) {
    const reserved = reservedSessions(state, bank, POOL_MOCK_KINDS[pool]);
    out[pool] = poolItems(bank, pool).filter((it) => !seen.has(it.id) && !(it.source.session && reserved.has(it.source.session)) && it.verified.status !== 'disputed').length;
  }
  return out;
}

/**
 * Supply tiers, best first:
 *   0 never seen (within today's ration)   1 due mistake   2 slow but correct (≥2 d)
 *   3 seen ≥4 d (weak first)               4 never seen beyond the ration   5 seen ≥2 d
 */
function tierOf(ctx: Ctx, it: Item, pool: Pool, reserved: Set<string>): number | null {
  if (ctx.used.has(it.id) || ctx.padding.has(it.id) || it.verified.status === 'disputed') return null;
  if (it.source.session && reserved.has(it.source.session)) return null;
  const last = ctx.seen.get(it.id);
  if (!last) return (ctx.freshUsed[pool] ?? 0) < (ctx.quota[pool] ?? Infinity) ? 0 : 4;
  const p = ctx.state.progress[it.id];
  const gap = daysBetween(last, ctx.date);
  if (p && isDue(p, ctx.date)) return 1;
  if (p?.inMistakes) return null;
  if (p?.slow && gap >= 2) return 2;
  if (gap >= (pool === 'ja-listening' ? 3 : 4)) return 3;
  if (gap >= 2) return 5;
  return null;
}

function itemsOfTopic(bank: BankIndex, topic: string, pool: Pool): Item[] {
  const primary = bank.byTopic.get(topic) || [];
  // Items tagged with the topic count too (e.g. a calculus 大問 that leans on trig identities).
  const tagged = bank.bySubject[bank.topics.get(topic)?.subject || 'math'].filter((it) => it.topic !== topic && it.tags?.includes(topic));
  return [...primary, ...tagged].filter((it) => inPool(it, pool));
}

function rankTopics(ctx: Ctx, pool: Pool, reserved: Set<string>): string[] {
  const subject = POOL_SUBJECT[pool];
  const out: { topic: string; score: number }[] = [];
  for (const [id, info] of ctx.bank.topics) {
    if (info.subject !== subject || ctx.topicsToday.has(id)) continue;
    const avail = itemsOfTopic(ctx.bank, id, pool).filter((it) => tierOf(ctx, it, pool, reserved) !== null);
    if (!avail.length) continue;
    const st = ctx.stats.get(id);
    const mastery = st ? st.mastery : 0.6;
    let score = (info.weight / 5) * (1.15 - mastery) * weakBoost(ctx.state, id);
    if (ctx.topicsYesterday.has(id)) score *= 0.55;
    if (avail.some((it) => ctx.state.progress[it.id] && isDue(ctx.state.progress[it.id], ctx.date))) score *= 1.15;
    score *= 1 + (hash(ctx.date + id) % 100) / 2000;
    out.push({ topic: id, score });
  }
  return out.sort((a, b) => b.score - a.score).map((x) => x.topic);
}

interface DrillOpts {
  timed?: boolean;
  titlePrefix?: string;
  maxTier?: number;
  /** Cap for a topic-free pool (grammar/recall). */
  maxItems?: number;
}

/** Fill one block of about `minutes` from a pool, best supply tier first. */
function drillBlock(ctx: Ctx, pool: Pool, minutes: number, opts: DrillOpts = {}): PlanBlock | null {
  if (minutes < 6) return null;
  const reserved = reservedSessions(ctx.state, ctx.bank, POOL_MOCK_KINDS[pool]);
  const mode = opts.timed ? 'timed' : 'drill';
  const limit = minutes * 60;
  const picked: Item[] = [];
  const pickedIds = new Set<string>();
  const topics: string[] = [];
  let total = 0;
  const topicFree = pool === 'ja-reading' || pool === 'ja-listening' || pool === 'ja-grammar' || pool === 'recall';
  const maxTier = opts.maxTier ?? 5;
  const take = (it: Item, cands: Item[]) => {
    const mates = it.group ? cands.filter((x) => x.group === it.group && x.id !== it.id && !pickedIds.has(x.id)) : [];
    for (const x of [it, ...mates]) {
      picked.push(x);
      pickedIds.add(x.id);
      total += planSeconds(x, mode);
      if (!ctx.seen.has(x.id)) ctx.freshUsed[pool] = (ctx.freshUsed[pool] ?? 0) + 1;
    }
    return 1 + mates.length;
  };
  const full = () => total >= limit * 0.92 || (opts.maxItems !== undefined && picked.length >= opts.maxItems);
  const rationSpent = (tier: number) => tier === 0 && (ctx.freshUsed[pool] ?? 0) >= (ctx.quota[pool] ?? Infinity);
  const order = (cands: Item[], tier: number) =>
    cands
      .filter((it) => !pickedIds.has(it.id) && tierOf(ctx, it, pool, reserved) === tier)
      .sort((a, b) => {
        if (tier === 0 || tier === 4) {
          // Official first; recall/grammar by difficulty; deterministic shuffle.
          const k = (it: Item) => (it.source.kind === 'official' ? 0 : 10) + it.difficulty + (hash(ctx.date + it.id) % 1000) / 1000;
          return k(a) - k(b);
        }
        if (tier === 3) {
          const k = (it: Item) => (ctx.state.progress[it.id]?.lastScore ?? 1) < 1 ? 0 : 1;
          return k(a) - k(b) || (ctx.seen.get(a.id)! < ctx.seen.get(b.id)! ? -1 : 1);
        }
        return (ctx.state.progress[a.id]?.due || '').localeCompare(ctx.state.progress[b.id]?.due || '');
      });

  for (let tier = 0; tier <= maxTier && !full(); tier++) {
    if (topicFree) {
      const cands = poolItems(ctx.bank, pool);
      for (const it of order(cands, tier)) {
        if (full() || rationSpent(tier)) break;
        if (pickedIds.has(it.id)) continue;
        const sec = planSeconds(it, mode);
        if (picked.length && total + sec > limit * 1.08) continue;
        take(it, cands);
      }
      continue;
    }
    for (const topic of rankTopics(ctx, pool, reserved)) {
      if (full()) break;
      if (!topics.includes(topic) && topics.length >= 4) continue;
      const cands = itemsOfTopic(ctx.bank, topic, pool);
      let took = 0;
      for (const it of order(cands, tier)) {
        if (full() || rationSpent(tier)) break;
        if (pickedIds.has(it.id)) continue;
        const sec = planSeconds(it, mode);
        if (picked.length && total + sec > limit * 1.08) continue;
        took += take(it, cands);
        if (took >= (pool === 'math' ? 3 : 6)) break;
      }
      if (took && !topics.includes(topic)) topics.push(topic);
    }
  }
  if (!picked.length) return null;
  for (const t of topics) ctx.topicsToday.add(t);

  const subject = POOL_SUBJECT[pool];
  const fresh = picked.filter((it) => !ctx.seen.has(it.id)).length;
  const mistakes = picked.filter((it) => isDue(ctx.state.progress[it.id], ctx.date)).length;
  const mix = [fresh ? `新题 ${fresh}` : '', mistakes ? `错题 ${mistakes}` : '', picked.length - fresh - mistakes > 0 ? `回炉 ${picked.length - fresh - mistakes}` : '']
    .filter(Boolean)
    .join(' · ');
  const prefix = opts.titlePrefix ?? '';
  let title: string;
  let reason: string;
  if (pool === 'ja-reading') {
    title = `${prefix}日语读解 · ${picked.length} 题`;
    reason = opts.timed ? '按考试节奏限时：每题约 1.5 分钟，先找依据句再选。' : '找原文依据再选；做完看每题的依据句和干扰项分析。';
  } else if (pool === 'ja-listening') {
    title = `${prefix}日语听解 · ${picked.length} 题`;
    reason = '每题只听一遍作答，答完对照原文精听一遍，标出没听出来的词。';
  } else if (pool === 'ja-grammar') {
    title = `${prefix}文型·接续 · ${picked.length} 题`;
    reason = '读解里常见的文型和接续词，快速过一遍，错的看解析。';
  } else if (pool === 'recall') {
    title = `${prefix}考点速测 · ${picked.length} 题`;
    reason = '公式、反应、术语一题 30 秒，忘了的立刻看解析补上。';
  } else {
    const subjectName = { math: '数学', physics: '物理', chemistry: '化学', japanese: '日语', mixed: '综合' }[subject];
    const names = topics.slice(0, 3).map((t) => shortTopic(ctx.bank, t)).join(' / ') + (topics.length > 3 ? ' 等' : '');
    title = `${prefix}${subjectName} · ${names}`;
    const weak = topics.some((t) => weakBoost(ctx.state, t) > 1);
    const st = topics.map((t) => ctx.stats.get(t)).filter(Boolean) as TopicStat[];
    const tried = st.reduce((s, x) => s + x.attempts, 0);
    reason = opts.timed
      ? `按 EJU 节奏限时（每题约 2 分钟），卡住就先跳过，交卷后统一看解析。`
      : tried === 0
        ? `${weak ? '你标记的薄弱方向，' : ''}高频考点，还没练过——先把知识唤醒。`
        : `掌握度 ${Math.round((st.reduce((s, x) => s + x.mastery, 0) / Math.max(1, st.length)) * 100)}%，${weak ? '薄弱方向，' : ''}继续巩固。`;
  }
  if (mix && (fresh < picked.length || mistakes)) reason += `（${mix}）`;
  return newBlock(ctx, {
    kind: POOL_KIND[pool],
    subject,
    title,
    reason,
    minutes: minutesOf(picked, mode),
    topic: topics[0],
    itemIds: picked.map((it) => it.id),
    timed: opts.timed || undefined,
  });
}

function reviewBlock(ctx: Ctx, maxMinutes: number): PlanBlock | null {
  if (maxMinutes < 8) return null;
  const due: Item[] = [];
  for (const [id, p] of Object.entries(ctx.state.progress)) {
    if (!isDue(p, ctx.date) || ctx.used.has(id)) continue;
    const it = ctx.bank.byId.get(id);
    if (it) due.push(it);
  }
  if (!due.length) return null;
  due.sort((a, b) => {
    const pa = ctx.state.progress[a.id];
    const pb = ctx.state.progress[b.id];
    return (pa.due || '').localeCompare(pb.due || '') || pa.box - pb.box || (hash(a.id) % 97) - (hash(b.id) % 97);
  });
  const picked: Item[] = [];
  let total = 0;
  for (const it of due) {
    const sec = planSeconds(it, 'review');
    if (picked.length && total + sec > maxMinutes * 60) continue;
    picked.push(it);
    total += sec;
  }
  const rest = due.length - picked.length;
  return newBlock(ctx, {
    kind: 'review',
    subject: 'mixed',
    title: `错题重做 · ${picked.length} 题`,
    reason: `到期的错题和没把握的题。隔两天重做、间隔答对 2 次就移出错题本${rest > 0 ? `；其余 ${rest} 题会混进今天的专项练习` : ''}。`,
    minutes: minutesOf(picked, 'review'),
    itemIds: picked.map((it) => it.id),
  });
}

// ─────────────────────────── Vocabulary ───────────────────────────

const KANA_ONLY = /^[぀-ヿー・ ]+$/;

/**
 * Which skills a word trains. Kana-only words have no reading to produce; transparent
 * science/math terms are read, not spoken, in EJU, so only their meaning is checked.
 */
export function vocabSkills(word: string | { word: string; category?: string; trapZh?: string }): ('read' | 'meaning')[] {
  const w = typeof word === 'string' ? { word } : word;
  if (KANA_ONLY.test(w.word)) return ['meaning'];
  if ((w.category === 'science' || w.category === 'math') && !w.trapZh) return ['meaning'];
  return ['read', 'meaning'];
}

export function vocabDueCount(state: AppState, bank: BankIndex, date: string): number {
  let due = 0;
  for (const v of bank.bundle.vocab) {
    const p = state.vocab[v.id];
    if (!p) continue;
    for (const k of vocabSkills(v)) if (p[k] && p[k]!.due <= date) due++;
  }
  return due;
}

/** New words today: none in the final phase; otherwise limited so the review pile stays manageable. */
export function vocabNewLimit(state: AppState, bank: BankIndex, date: string): number {
  const phase = phaseFor(daysLeftOn(state, date));
  if (phase === 'final' || phase === 'exam') return 0;
  const cap = phase === 'foundation' ? 30 : 20;
  return Math.max(0, Math.min(cap, Math.round((120 - vocabDueCount(state, bank, date)) / 4)));
}

function vocabBlock(ctx: Ctx, minutes: number): PlanBlock | null {
  const dueCards = vocabDueCount(ctx.state, ctx.bank, ctx.date);
  let unseen = 0;
  for (const v of ctx.bank.bundle.vocab) {
    const p = ctx.state.vocab[v.id];
    if (!p || vocabSkills(v).every((k) => !p[k])) unseen++;
  }
  const newCount = Math.min(unseen, vocabNewLimit(ctx.state, ctx.bank, ctx.date));
  const dueCount = Math.min(dueCards, 80);
  if (newCount + dueCount === 0) return null;
  const est = Math.round(((dueCount + newCount * 2) * 9) / 60);
  const parts = [dueCount ? `复习 ${dueCount}` : '', newCount ? `新词 ${newCount}` : ''].filter(Boolean).join(' + ');
  return newBlock(ctx, {
    kind: 'vocab',
    subject: 'japanese',
    title: `词汇 · ${parts}`,
    reason: '先看字写读音（不放音频），再选意思；读音和词义分开记录。睡前做记得更牢。',
    minutes: Math.max(5, Math.min(minutes, est || 5)),
    itemIds: [],
    vocabCount: dueCount + newCount,
  });
}

// ─────────────────────────── Mocks, notes, traps ───────────────────────────

function mockBlocks(ctx: Ctx, slot: ScheduledMock): number {
  let minutes = 0;
  const order: MockKind[] = ['ja-reading', 'ja-listening', 'science', 'math'];
  const parts = [...slot.parts].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  for (const part of parts) {
    if (part.done) continue;
    const items = mockItemsPadded(ctx.state, ctx.bank, part.kind, part.session);
    if (!items.length) continue;
    const mins = Math.round(mockLimitFor(part.kind, items) / 60);
    const padded = items.length - mockItems(ctx.bank, part.kind, part.session).length;
    newBlock(ctx, {
      kind: 'mock',
      subject: part.kind === 'science' ? 'mixed' : part.kind === 'math' ? 'math' : 'japanese',
      title: `${slot.title} · ${MOCK_LABEL[part.kind]}`,
      reason: `${sessionLabel(part.session)}真题${padded > 0 ? `（公开题不全，补 ${padded} 道原创题到考试题量）` : ''}，${mins} 分钟限时，中途不看解析，交卷后估分。${slot.daysLeft === 4 ? '尽量明早 9:30 按考试时间开始。' : ''}`,
      minutes: mins,
      itemIds: items.map((it) => it.id),
      mock: { kind: part.kind, session: part.session },
    });
    minutes += mins;
  }
  for (const part of parts) {
    if (part.done) continue;
    // The full simulation day is already long: keep its corrections short (the mistake book picks up the rest).
    const full = slot.parts.length >= 4;
    const reviewMins = part.kind === 'math' || part.kind === 'science' ? (full ? 25 : 40) : full ? 10 : 15;
    newBlock(ctx, {
      kind: 'review',
      subject: part.kind === 'science' ? 'mixed' : part.kind === 'math' ? 'math' : 'japanese',
      title: `模考订正 · ${MOCK_LABEL[part.kind]}`,
      reason: '只看做错和没把握的题：先自己重做，再看解析。错题会自动进错题本，明天专项练习会优先补这些考点。',
      minutes: reviewMins,
      itemIds: [],
      reviewOfMock: { kind: part.kind, session: part.session },
    });
    minutes += reviewMins;
  }
  return minutes;
}

function notesTopics(ctx: Ctx, count: number): string[] {
  const shownYesterday = new Set((ctx.state.plans[addDays(ctx.date, -1)]?.blocks || []).flatMap((b) => b.noteTopics || []));
  const ranked = [...ctx.bank.topics.values()]
    .filter((t) => t.subject !== 'japanese')
    .map((t) => {
      const st = ctx.stats.get(t.id);
      const mastery = st ? st.mastery : 0.6;
      let score = (1.1 - mastery) * (t.weight / 5) * weakBoost(ctx.state, t.id);
      if (shownYesterday.has(t.id)) score *= 0.3;
      return { id: t.id, subject: t.subject, score };
    })
    .sort((a, b) => b.score - a.score);
  const out: string[] = [];
  // At least one math topic, then the rest by need.
  const math = ranked.find((t) => t.subject === 'math');
  if (math) out.push(math.id);
  for (const t of ranked) {
    if (out.length >= count) break;
    if (!out.includes(t.id)) out.push(t.id);
  }
  return out;
}

// ─────────────────────────── Allocation ───────────────────────────

function tiltedWeights(state: AppState, bank: BankIndex): Record<string, number> {
  const est = estimateAll(state, bank);
  const gaps: Record<Subject, number> = {
    math: gapPoints(est.math),
    physics: gapPoints(est.physics),
    chemistry: gapPoints(est.chemistry),
    japanese: gapPoints(est.japanese),
  };
  const total = Object.values(gaps).reduce((a, b) => a + b, 0) || 1;
  // Every point counts the same toward 630: tilt by each subject's share of the remaining gap.
  const tilt = (s: Subject) => Math.min(1.4, Math.max(0.75, 0.75 + 1.5 * (gaps[s] / total)));
  const listenWeak = state.profile.weakTopics.some((t) => t.startsWith('ja.listening'));
  const w: Record<string, number> = {
    math: BASE_WEIGHTS.math * tilt('math'),
    physics: BASE_WEIGHTS.physics * tilt('physics'),
    chemistry: BASE_WEIGHTS.chemistry * tilt('chemistry'),
    'ja-reading': BASE_WEIGHTS['ja-reading'] * tilt('japanese') * (listenWeak ? 0.9 : 1),
    'ja-listening': BASE_WEIGHTS['ja-listening'] * tilt('japanese') * (listenWeak ? 1.15 : 1),
  };
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(w)) w[k] /= sum;
  return w;
}

function yesterdayTopics(state: AppState, date: string): Set<string> {
  const y = state.plans[addDays(date, -1)];
  return new Set((y?.blocks || []).map((b) => b.topic).filter(Boolean) as string[]);
}

function rations(state: AppState, bank: BankIndex, left: number): Partial<Record<Pool, number>> {
  const remaining = freshRemaining(state, bank);
  const days = Math.max(1, left - 4);
  const out: Partial<Record<Pool, number>> = {};
  for (const pool of [...MAIN_POOLS, 'ja-grammar', 'recall'] as Pool[]) {
    out[pool] = left <= 4 ? Infinity : Math.max(pool === 'math' ? 2 : 4, Math.ceil((remaining[pool] / days) * 1.25));
  }
  return out;
}

/** Split a pool's minutes into blocks of roughly 30–50 minutes (optionally starting with a timed set). */
function poolBlocks(ctx: Ctx, pool: Pool, minutes: number, timedShare = 0) {
  if (minutes < 10) return;
  let remaining = minutes;
  if (timedShare > 0 && pool !== 'ja-listening') {
    const t = Math.round(minutes * timedShare);
    if (t >= 12) {
      const b = drillBlock(ctx, pool, t, { timed: true, titlePrefix: '限时 · ' });
      if (b) remaining -= b.minutes;
    }
  }
  const parts = remaining > 70 ? 2 : 1;
  for (let i = 0; i < parts && remaining >= 10; i++) {
    const target = Math.round(remaining / (parts - i));
    const b = drillBlock(ctx, pool, target);
    if (!b) break;
    remaining -= b.minutes;
  }
}

export interface BuildOptions {
  /** Blocks already started/finished today: their items, topics, minutes and kinds are respected. */
  keep?: PlanBlock[];
}

function makeCtx(state: AppState, bank: BankIndex, date: string, keep: PlanBlock[]): Ctx {
  const left = daysLeftOn(state, date);
  return {
    state,
    bank,
    date,
    left,
    stats: topicStats(state, bank),
    seen: lastSeen(state),
    used: new Set(keep.flatMap((b) => b.itemIds)),
    padding: reservedPadding(state, bank),
    quota: rations(state, bank, left),
    freshUsed: {},
    topicsToday: new Set(keep.map((b) => b.topic).filter(Boolean) as string[]),
    topicsYesterday: yesterdayTopics(state, date),
    blocks: [],
  };
}

export function buildDayPlan(state: AppState, bank: BankIndex, date: string, opts: BuildOptions = {}): DayPlan {
  const keep = opts.keep || [];
  const ctx = makeCtx(state, bank, date, keep);
  const left = ctx.left;
  const phase = phaseFor(left);
  const budget = budgetFor(state, date);
  const kept = (f: (b: PlanBlock) => boolean) => keep.some(f);
  const plan: DayPlan = { date, phase, budgetMinutes: budget, generatedAt: new Date().toISOString(), plannerVersion: PLANNER_VERSION, blocks: ctx.blocks };
  if (phase === 'exam' || budget <= 0) return plan;

  let remaining = budget - keep.reduce((n, b) => n + b.minutes, 0);
  const take = (b: PlanBlock | null) => {
    if (b) remaining -= b.minutes;
  };

  // 1) Scheduled mock (due today, or yesterday's if it was missed).
  const schedule = mockSchedule(state, bank);
  const slot = schedule.find((m) => m.daysLeft >= left && m.parts.some((p) => !p.done) && m.daysLeft - left <= 1);
  const mockToday = !!slot && phase !== 'foundation';
  if (mockToday && !kept((b) => !!b.mock && slot!.parts.some((p) => p.kind === b.mock!.kind && p.session === b.mock!.session))) {
    remaining -= mockBlocks(ctx, slot!);
  }

  // 2) Mistakes: sized from the backlog (the rest is mixed into drills).
  if (!kept((b) => b.kind === 'review' && !b.reviewOfMock)) {
    const cap = phase === 'final' ? Math.min(100, Math.max(40, Math.round(remaining * 0.45))) : Math.min(75, Math.max(30, Math.round(remaining * 0.22)));
    take(reviewBlock(ctx, cap));
  }

  // 3) Small daily blocks: vocabulary, recall checks, grammar; notes and trap sheet near the end.
  if (!kept((b) => b.kind === 'vocab')) take(vocabBlock(ctx, Math.max(10, Math.min(25, Math.round(budget * 0.06)))));
  if (!kept((b) => b.title.includes('考点速测'))) take(drillBlock(ctx, 'recall', phase === 'final' ? 15 : 10, { maxItems: phase === 'final' ? 20 : 15 }));
  if (phase !== 'final' && !mockToday && !kept((b) => b.title.includes('文型'))) take(drillBlock(ctx, 'ja-grammar', 8, { maxItems: 12, maxTier: 3 }));
  if (phase === 'final' && remaining > 20 && !kept((b) => b.kind === 'notes')) {
    const m = Math.min(35, Math.round(remaining * 0.25));
    newBlock(ctx, {
      kind: 'notes',
      subject: 'mixed',
      title: '考点速记 · 薄弱考点公式与易错点',
      reason: '只看笔记里的公式、结论和易错点，不做新难题。',
      minutes: m,
      itemIds: [],
      noteTopics: notesTopics(ctx, 6),
    });
    remaining -= m;
  }
  if (left <= 2 && !kept((b) => b.kind === 'traps')) {
    newBlock(ctx, {
      kind: 'traps',
      subject: 'mixed',
      title: '考前一页纸 · 我的易错点',
      reason: '从你做错过的题里汇总的易错点和考点，按科目排好，考前看这一页就够了。',
      minutes: 15,
      itemIds: [],
    });
    remaining -= 15;
  }

  // 4) Main drills for the rest of the budget.
  const w = tiltedWeights(state, bank);
  if (remaining >= 10) {
    const shares: Record<string, number> = { ...w };
    if (mockToday) {
      for (const p of MAIN_POOLS) if (slot!.parts.some((x) => !x.done && POOL_MOCK_KINDS[p].includes(x.kind))) shares[p] *= 0.25;
    }
    const sum = MAIN_POOLS.reduce((s, p) => s + shares[p], 0);
    const pot = remaining;
    for (const p of MAIN_POOLS) {
      const mins = Math.round((pot * shares[p]) / sum);
      // Science speed is trained every day (the learner finishes ~28 of 39 in 80 min).
      const timed =
        phase === 'foundation' ? (p === 'physics' || p === 'chemistry' ? 0.3 : 0) : phase === 'practice' ? (mockToday ? 0 : 0.4) : 0.5;
      poolBlocks(ctx, p, mins, timed);
    }
  }

  // 5) Top up: leftover time goes to the pools furthest from target.
  const planned = () => ctx.blocks.reduce((n, b) => n + b.minutes, 0) + keep.reduce((n, b) => n + b.minutes, 0);
  const order = [...MAIN_POOLS].sort((a, b) => w[b] - w[a]);
  for (let guard = 0; guard < 8 && budget - planned() >= 15; guard++) {
    let added = false;
    for (const p of order) {
      const gap = budget - planned();
      if (gap < 15) break;
      if (drillBlock(ctx, p, Math.min(45, gap), { titlePrefix: '加练 · ' })) added = true;
    }
    if (!added) break;
  }

  // 6) Order. Mock days follow the exam (Japanese → science → math). Other days interleave
  //    subjects so the hardest math is not left for 1 a.m., and vocabulary comes last before sleep.
  const rank = (b: PlanBlock): number => {
    if (b.kind === 'mock') return 1 + ['japanese', 'mixed', 'math'].indexOf(b.subject) * 0.1;
    if (b.kind === 'review' && b.reviewOfMock) return 2;
    if (b.kind === 'review') return 3;
    if (b.kind === 'vocab') return 99;
    if (b.kind === 'traps') return 98;
    if (b.kind === 'notes') return 4;
    if (b.title.includes('考点速测')) return 4.5;
    if (b.title.includes('文型')) return 97;
    if (mockToday) {
      const s: Record<string, number> = { japanese: 5, physics: 6, chemistry: 7, math: 8, mixed: 9 };
      return s[b.subject] + (b.kind === 'listening' ? 0.5 : 0);
    }
    return 10;
  };
  const head = ctx.blocks.filter((b) => rank(b) < 10).sort((a, b) => rank(a) - rank(b));
  const tail = ctx.blocks.filter((b) => rank(b) >= 90).sort((a, b) => rank(a) - rank(b));
  const middle = ctx.blocks.filter((b) => rank(b) === 10);
  // Interleave: math, listening, physics, reading, math, chemistry, … (timed sets before untimed).
  const lanes: Record<string, PlanBlock[]> = {};
  for (const b of middle) {
    const key = b.kind === 'listening' ? 'listening' : b.kind === 'reading' ? 'reading' : b.subject;
    (lanes[key] ||= []).push(b);
  }
  for (const l of Object.values(lanes)) l.sort((a, b) => Number(!!b.timed) - Number(!!a.timed));
  const pattern = ['math', 'listening', 'physics', 'reading', 'math', 'chemistry', 'physics', 'listening', 'chemistry', 'reading', 'math'];
  const ordered: PlanBlock[] = [];
  let guard = 0;
  while (Object.values(lanes).some((l) => l.length) && guard++ < 50) {
    for (const k of pattern) {
      const l = lanes[k];
      if (l && l.length) ordered.push(l.shift()!);
    }
    for (const [k, l] of Object.entries(lanes)) if (!pattern.includes(k) && l.length) ordered.push(l.shift()!);
  }
  ctx.blocks.splice(0, ctx.blocks.length, ...head, ...ordered, ...tail);
  ctx.blocks.forEach((b, i) => (b.id = `${date}:${i + 1}`));
  return plan;
}

/** One more drill block after the day's plan is done ("加练"). */
export function extraBlock(state: AppState, bank: BankIndex, date: string, pool: Pool, minutes = 30): PlanBlock | null {
  const plan = state.plans[date];
  const ctx = makeCtx(state, bank, date, plan?.blocks || []);
  const b = drillBlock(ctx, pool, minutes);
  if (!b) return null;
  b.id = `${date}:x${(plan?.blocks.length || 0) + 1}`;
  b.extra = true;
  return b;
}

export type { Pool };
export const POOLS: { id: Pool; name: string }[] = [
  { id: 'math', name: '数学' },
  { id: 'physics', name: '物理' },
  { id: 'chemistry', name: '化学' },
  { id: 'ja-reading', name: '日语读解' },
  { id: 'ja-listening', name: '日语听解' },
  { id: 'recall', name: '考点速测' },
];

export interface DaySkeleton {
  date: string;
  daysLeft: number;
  phase: Phase;
  budget: number;
  mocks: ScheduledMock | null;
}

export function calendar(state: AppState, bank: BankIndex, from: string): DaySkeleton[] {
  const schedule = mockSchedule(state, bank);
  const out: DaySkeleton[] = [];
  for (let d = from; d <= state.profile.examDate; d = addDays(d, 1)) {
    const left = daysLeftOn(state, d);
    out.push({ date: d, daysLeft: left, phase: phaseFor(left), budget: budgetFor(state, d), mocks: schedule.find((m) => m.date === d) || null });
  }
  return out;
}
