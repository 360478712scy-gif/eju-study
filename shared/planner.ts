// 19-day sprint planner. Pure and deterministic: same state + bank + date → same plan.
//
// Phases by days left until the exam (2026-11-08):
//   ≥12  foundation  专项突破: topic drills ranked by weakness × exam weight, daily vocab/listening/reading
//   5–11 practice    套题实战: full timed mocks on fixed days, corrections, timed sets on other days
//   1–4  final       考前调整: one full simulation (D=4), then mistakes + weak-topic notes, light last day
//   0    exam        exam day: no study blocks
import type { AppState, BlockKind, DayPlan, Item, MockKind, Phase, PlanBlock, Subject } from './types.ts';
import type { BankIndex } from './bank.ts';
import { mockItems, mockTimeLimit, MOCK_LABEL, sessionLabel } from './bank.ts';
import { addDays, daysBetween } from './dates.ts';
import { estimateAll, gapRatio, topicStats, type TopicStat } from './stats.ts';
import { isDue } from './srs.ts';

export const PLANNER_VERSION = 1;

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
  foundation: { name: '专项突破', desc: '按薄弱度×考频轮换专题，补齐遗忘的知识点，同时每天练听力、读解和词汇。' },
  practice: { name: '套题实战', desc: '按真实时长整卷模考，模考后立即订正；非模考日做限时小测和错题。' },
  final: { name: '考前调整', desc: '按考试当天时间表做一次全真模拟，之后以错题、薄弱考点和速记为主，最后一天减量。' },
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

export const MOCK_SLOTS: MockSlot[] = [
  { daysLeft: 11, kinds: ['science', 'math'], title: '数理整卷模考 ①' },
  { daysLeft: 10, kinds: ['ja-reading', 'ja-listening'], title: '日语整卷模考 ①' },
  { daysLeft: 9, kinds: ['science', 'math'], title: '数理整卷模考 ②' },
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
      // A slot keeps the paper it already used (done) — find done paper with matching order first.
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

// ─────────────────────────── Helpers ───────────────────────────

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Planned seconds for an item including reading its explanation. */
export function planSeconds(it: Item, mode: 'drill' | 'review' | 'mock' = 'drill'): number {
  if (mode === 'mock') return it.targetSec;
  if (it.subject === 'math') return Math.round(it.targetSec * (mode === 'review' ? 0.9 : 1.35));
  if (it.section === 'listening' || it.section === 'listening-reading') return it.targetSec + 60;
  if (it.subject === 'japanese') return it.targetSec + 45;
  return it.targetSec + (mode === 'review' ? 45 : 60);
}

const minutesOf = (items: Item[], mode: 'drill' | 'review' | 'mock' = 'drill') =>
  Math.max(1, Math.round(items.reduce((s, it) => s + planSeconds(it, mode), 0) / 60));

type Pool = 'math' | 'physics' | 'chemistry' | 'ja-reading' | 'ja-listening';

const POOL_SUBJECT: Record<Pool, Subject> = {
  math: 'math',
  physics: 'physics',
  chemistry: 'chemistry',
  'ja-reading': 'japanese',
  'ja-listening': 'japanese',
};

const POOL_KIND: Record<Pool, BlockKind> = {
  math: 'drill',
  physics: 'drill',
  chemistry: 'drill',
  'ja-reading': 'reading',
  'ja-listening': 'listening',
};

const POOL_MOCK_KINDS: Record<Pool, MockKind[]> = {
  math: ['math'],
  physics: ['science'],
  chemistry: ['science'],
  'ja-reading': ['ja-reading'],
  'ja-listening': ['ja-listening'],
};

function inPool(it: Item, pool: Pool): boolean {
  if (pool === 'ja-reading') return it.subject === 'japanese' && it.section === 'reading';
  if (pool === 'ja-listening') return it.subject === 'japanese' && (it.section === 'listening' || it.section === 'listening-reading');
  return it.subject === pool;
}

const BASE_WEIGHTS: Record<Pool, number> = {
  math: 0.29,
  physics: 0.2,
  chemistry: 0.18,
  'ja-reading': 0.15,
  'ja-listening': 0.18,
};

interface Ctx {
  state: AppState;
  bank: BankIndex;
  date: string;
  stats: Map<string, TopicStat>;
  used: Set<string>;
  /** Topics already given a block today. */
  topicsToday: Set<string>;
  /** Topics drilled yesterday (rotated down). */
  topicsYesterday: Set<string>;
  blocks: PlanBlock[];
}

function weakBoost(state: AppState, topic: string): number {
  return state.profile.weakTopics.some((w) => topic === w || topic.startsWith(w + '.')) ? 1.35 : 1;
}

function attemptedIds(state: AppState): Map<string, string> {
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

/** Candidate items of a pool, best first. */
function candidates(ctx: Ctx, pool: Pool, topic: string | null, seenBefore: Map<string, string>, reserved: Set<string>): Item[] {
  const list = (topic ? ctx.bank.byTopic.get(topic) || [] : ctx.bank.bySubject[POOL_SUBJECT[pool]]).filter((it) => inPool(it, pool));
  const fresh: Item[] = [];
  const stale: Item[] = [];
  for (const it of list) {
    if (ctx.used.has(it.id)) continue;
    if (it.source.session && reserved.has(it.source.session)) continue;
    if (it.verified.status === 'disputed') continue;
    const last = seenBefore.get(it.id);
    if (!last) fresh.push(it);
    else if (daysBetween(last, ctx.date) >= 4 && !ctx.state.progress[it.id]?.inMistakes) stale.push(it);
  }
  const key = (it: Item) => (it.source.kind === 'official' ? 0 : 1) * 10 + it.difficulty + (hash(ctx.date + it.id) % 1000) / 1000;
  fresh.sort((a, b) => key(a) - key(b));
  stale.sort((a, b) => (seenBefore.get(a.id)! < seenBefore.get(b.id)! ? -1 : 1));
  return [...fresh, ...stale];
}

function rankTopics(ctx: Ctx, pool: Pool, seenBefore: Map<string, string>, reserved: Set<string>): { topic: string; score: number }[] {
  const subject = POOL_SUBJECT[pool];
  const out: { topic: string; score: number }[] = [];
  for (const [id, info] of ctx.bank.topics) {
    if (info.subject !== subject) continue;
    if (ctx.topicsToday.has(id)) continue;
    const avail = candidates(ctx, pool, id, seenBefore, reserved);
    if (!avail.length) continue;
    const st = ctx.stats.get(id);
    const mastery = st ? st.mastery : 0.6;
    let score = (info.weight / 5) * (1.15 - mastery) * weakBoost(ctx.state, id);
    if (ctx.topicsYesterday.has(id)) score *= 0.55;
    if (avail.length < 2) score *= 0.7;
    score *= 1 + (hash(ctx.date + id) % 100) / 2000; // stable tie-break
    out.push({ topic: id, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Fill one drill block of about `minutes` from the best topics of a pool. */
function drillBlock(ctx: Ctx, pool: Pool, minutes: number, opts: { timed?: boolean; titlePrefix?: string } = {}): PlanBlock | null {
  if (minutes < 8) return null;
  const seenBefore = attemptedIds(ctx.state);
  const reserved = reservedSessions(ctx.state, ctx.bank, POOL_MOCK_KINDS[pool]);
  const picked: Item[] = [];
  const pickedIds = new Set<string>();
  const topics: string[] = [];
  const limit = minutes * 60;
  let total = 0;
  const isJa = pool === 'ja-reading' || pool === 'ja-listening';
  // Japanese pools are small and not topic-driven: take best candidates directly, keeping passages together.
  const ranked = isJa ? [{ topic: null as string | null, score: 1 }] : rankTopics(ctx, pool, seenBefore, reserved);
  for (const { topic } of ranked) {
    if (total >= limit * 0.9) break;
    const cands = candidates(ctx, pool, topic, seenBefore, reserved);
    let took = 0;
    for (const it of cands) {
      if (pickedIds.has(it.id)) continue;
      const sec = planSeconds(it);
      if (picked.length && total + sec > limit * 1.08) continue;
      const groupMates = it.group ? cands.filter((x) => x.group === it.group && x.id !== it.id && !pickedIds.has(x.id)) : [];
      picked.push(it, ...groupMates);
      pickedIds.add(it.id);
      for (const x of groupMates) pickedIds.add(x.id);
      total += sec + groupMates.reduce((s, x) => s + planSeconds(x), 0);
      took += 1 + groupMates.length;
      if (!isJa && took >= (pool === 'math' ? 3 : 6)) break;
      if (total >= limit * 0.95) break;
    }
    if (took && topic) topics.push(topic);
    if (!isJa && topics.length >= 4) break;
  }
  if (!picked.length) return null;
  for (const t of topics) ctx.topicsToday.add(t);
  const subject = POOL_SUBJECT[pool];
  const subjectName = { math: '数学', physics: '物理', chemistry: '化学', japanese: '日语' }[subject];
  let title: string;
  let reason: string;
  if (pool === 'ja-reading') {
    title = `${opts.titlePrefix ?? ''}日语读解 · ${picked.length} 题`;
    reason = '找原文依据再选；做完看每题的依据句和干扰项分析。';
  } else if (pool === 'ja-listening') {
    title = `${opts.titlePrefix ?? ''}日语听解 · ${picked.length} 题`;
    reason = '每题只听一遍作答，答完对照原文精听一遍，标出没听出来的词。';
  } else {
    const names = topics.slice(0, 3).map((t) => shortTopic(ctx.bank, t)).join(' / ') + (topics.length > 3 ? ' 等' : '');
    title = `${opts.titlePrefix ?? ''}${subjectName} · ${names}`;
    const weak = topics.some((t) => weakBoost(ctx.state, t) > 1);
    const st = topics.map((t) => ctx.stats.get(t)).filter(Boolean) as TopicStat[];
    const tried = st.reduce((s, x) => s + x.attempts, 0);
    reason = opts.timed
      ? `按 EJU 节奏限时完成，交卷后统一看解析。`
      : tried === 0
        ? `${weak ? '你标记的薄弱方向，' : ''}高频考点，还没练过——先把知识唤醒。`
        : `掌握度 ${Math.round((st.reduce((s, x) => s + x.mastery, 0) / Math.max(1, st.length)) * 100)}%，${weak ? '薄弱方向，' : ''}继续巩固。`;
  }
  const minutesPlanned = opts.timed ? Math.max(1, Math.round(picked.reduce((s, it) => s + it.targetSec, 0) / 60)) : minutesOf(picked);
  return newBlock(ctx, {
    kind: POOL_KIND[pool],
    subject,
    title,
    reason,
    minutes: minutesPlanned,
    topic: topics[0],
    itemIds: picked.map((it) => it.id),
    timed: opts.timed || undefined,
  });
}

function reviewBlock(ctx: Ctx, maxMinutes: number): PlanBlock | null {
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
  return newBlock(ctx, {
    kind: 'review',
    subject: 'mixed',
    title: `错题重做 · ${picked.length} 题`,
    reason: `到期的错题和没把握的题。隔天重做答对才算过关，连续 3 次间隔答对就移出错题本。`,
    minutes: minutesOf(picked, 'review'),
    itemIds: picked.map((it) => it.id),
  });
}

function vocabBlock(ctx: Ctx, phase: Phase, minutes: number): PlanBlock | null {
  const date = ctx.date;
  let due = 0;
  let unseen = 0;
  for (const v of ctx.bank.bundle.vocab) {
    const p = ctx.state.vocab[v.id];
    if (!p || (!p.read && !p.meaning)) unseen++;
    else if ((p.read && p.read.due <= date) || (p.meaning && p.meaning.due <= date)) due++;
  }
  const newCount = phase === 'final' ? 0 : Math.min(unseen, phase === 'foundation' ? 30 : 20);
  const dueCount = Math.min(due, 80);
  if (newCount + dueCount === 0) return null;
  const est = Math.round(((dueCount + newCount * 2) * 9) / 60);
  return newBlock(ctx, {
    kind: 'vocab',
    subject: 'japanese',
    title: `词汇 · 复习 ${dueCount} + 新词 ${newCount}`,
    reason: '先看字写读音（不放音频），再选意思；读音和词义分开记录。',
    minutes: Math.max(5, Math.min(minutes, est || 5)),
    itemIds: [],
    vocabCount: dueCount + newCount,
  });
}

function mockBlocks(ctx: Ctx, slot: ScheduledMock): number {
  let minutes = 0;
  // Exam-day order: Japanese → science → math.
  const order: MockKind[] = ['ja-reading', 'ja-listening', 'science', 'math'];
  const parts = [...slot.parts].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  for (const part of parts) {
    if (part.done) continue;
    const items = mockItems(ctx.bank, part.kind, part.session);
    if (!items.length) continue;
    const mins = Math.round(mockTimeLimit(part.kind, items) / 60);
    newBlock(ctx, {
      kind: 'mock',
      subject: part.kind === 'science' ? 'mixed' : part.kind === 'math' ? 'math' : 'japanese',
      title: `${slot.title} · ${MOCK_LABEL[part.kind]}`,
      reason: `${sessionLabel(part.session)}真题，${mins} 分钟限时，中途不看解析，交卷后估分。`,
      minutes: mins,
      itemIds: items.map((it) => it.id),
      mock: { kind: part.kind, session: part.session },
    });
    minutes += mins;
  }
  for (const part of parts) {
    if (part.done) continue;
    const reviewMins = part.kind === 'math' ? 35 : part.kind === 'science' ? 35 : 15;
    newBlock(ctx, {
      kind: 'review',
      subject: part.kind === 'science' ? 'mixed' : part.kind === 'math' ? 'math' : 'japanese',
      title: `模考订正 · ${MOCK_LABEL[part.kind]}`,
      reason: '只看做错和没把握的题：先自己重做，再看解析，写下错因。',
      minutes: reviewMins,
      itemIds: [],
      reviewOfMock: { kind: part.kind, session: part.session },
    });
    minutes += reviewMins;
  }
  return minutes;
}

function tiltedWeights(state: AppState): Record<Pool, number> {
  const est = estimateAll(state);
  const tilt = (s: Subject) => Math.min(1.35, Math.max(0.75, 0.75 + 2.5 * gapRatio(est[s])));
  const w: Record<Pool, number> = {
    math: BASE_WEIGHTS.math * tilt('math'),
    physics: BASE_WEIGHTS.physics * tilt('physics'),
    chemistry: BASE_WEIGHTS.chemistry * tilt('chemistry'),
    'ja-reading': BASE_WEIGHTS['ja-reading'] * tilt('japanese'),
    'ja-listening': BASE_WEIGHTS['ja-listening'] * tilt('japanese'),
  };
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(w) as Pool[]) w[k] /= sum;
  return w;
}

function yesterdayTopics(state: AppState, date: string): Set<string> {
  const y = state.plans[addDays(date, -1)];
  return new Set((y?.blocks || []).map((b) => b.topic).filter(Boolean) as string[]);
}

/** Split a pool's minutes into blocks of roughly 30–50 minutes. */
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

export function buildDayPlan(state: AppState, bank: BankIndex, date: string): DayPlan {
  const left = daysLeftOn(state, date);
  const phase = phaseFor(left);
  const budget = budgetFor(state, date);
  const ctx: Ctx = {
    state,
    bank,
    date,
    stats: topicStats(state, bank),
    used: new Set(),
    topicsToday: new Set(),
    topicsYesterday: yesterdayTopics(state, date),
    blocks: [],
  };
  const plan: DayPlan = { date, phase, budgetMinutes: budget, generatedAt: new Date().toISOString(), plannerVersion: PLANNER_VERSION, blocks: ctx.blocks };
  if (phase === 'exam' || budget <= 0) return plan;

  let remaining = budget;
  const take = (b: PlanBlock | null) => {
    if (b) remaining -= b.minutes;
  };

  // 1) Scheduled mock (due today or overdue and not yet done).
  const schedule = mockSchedule(state, bank);
  const slot = schedule.find((m) => m.daysLeft >= left && m.parts.some((p) => !p.done) && (m.daysLeft === left || m.daysLeft - left <= 1));
  if (slot && phase !== 'foundation') remaining -= mockBlocks(ctx, slot);

  // 2) Vocabulary and mistakes.
  take(vocabBlock(ctx, phase, Math.max(10, Math.min(25, Math.round(budget * 0.06)))));
  take(reviewBlock(ctx, phase === 'final' ? Math.min(90, Math.round(remaining * 0.45)) : Math.min(35, Math.round(remaining * 0.12))));

  // 3) Final phase: weak-topic notes.
  if (phase === 'final' && remaining > 20) {
    const weakest = [...ctx.stats.values()]
      .filter((t) => bank.topics.has(t.topic) && bank.topics.get(t.topic)!.subject !== 'japanese')
      .sort((a, b) => a.mastery * (1 / weakBoost(state, a.topic)) - b.mastery * (1 / weakBoost(state, b.topic)))
      .slice(0, 6)
      .map((t) => t.topic);
    const m = Math.min(40, Math.round(remaining * 0.3));
    newBlock(ctx, {
      kind: 'notes',
      subject: 'mixed',
      title: '考点速记 · 薄弱考点公式与易错点',
      reason: '只看笔记里的公式、结论和易错点，不做新难题。',
      minutes: m,
      itemIds: [],
      noteTopics: weakest,
    });
    remaining -= m;
  }

  // 4) Drills for the rest of the budget.
  if (remaining >= 10) {
    const w = tiltedWeights(state);
    const pools: Pool[] = ['ja-reading', 'ja-listening', 'physics', 'chemistry', 'math'];
    const shares = { ...w };
    if (slot && phase !== 'foundation') {
      // Mock days: the mocked subjects already got their time.
      for (const p of pools) if (slot.parts.some((x) => !x.done && POOL_MOCK_KINDS[p].includes(x.kind))) shares[p] *= 0.25;
    }
    const sum = pools.reduce((s, p) => s + shares[p], 0);
    const pot = remaining;
    for (const p of pools) {
      const mins = Math.round((pot * shares[p]) / sum);
      poolBlocks(ctx, p, mins, phase === 'practice' && !slot ? 0.4 : phase === 'final' ? 0.5 : 0);
    }
  }

  // Exam-day order: Japanese → science → math, reviews and vocab first.
  const rank = (b: PlanBlock) => {
    if (b.kind === 'vocab') return 0;
    if (b.kind === 'mock') return 1 + ['japanese', 'mixed', 'math'].indexOf(b.subject) * 0.1;
    if (b.kind === 'review' && b.reviewOfMock) return 2;
    if (b.kind === 'review') return 3;
    if (b.kind === 'notes') return 3.5;
    const s: Record<string, number> = { japanese: 4, physics: 5, chemistry: 6, math: 7, mixed: 8 };
    return s[b.subject] + (b.kind === 'listening' ? 0.5 : 0);
  };
  ctx.blocks.sort((a, b) => rank(a) - rank(b));
  ctx.blocks.forEach((b, i) => (b.id = `${date}:${i + 1}`));
  return plan;
}

/** One more drill block after the day's plan is done ("加练"). */
export function extraBlock(state: AppState, bank: BankIndex, date: string, pool: Pool, minutes = 30): PlanBlock | null {
  const plan = state.plans[date];
  const ctx: Ctx = {
    state,
    bank,
    date,
    stats: topicStats(state, bank),
    used: new Set((plan?.blocks || []).flatMap((b) => b.itemIds)),
    topicsToday: new Set((plan?.blocks || []).map((b) => b.topic).filter(Boolean) as string[]),
    topicsYesterday: yesterdayTopics(state, date),
    blocks: [],
  };
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
