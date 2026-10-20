// Plan-block helpers shared by the Today and Plan pages: presentation (icon, tone, labels)
// and the actions behind "开始 / 继续 / 再练 / 跳过". The UI calls a block 项 / 任务, never 块.
import type { AppState, PlanBlock, PracticeSession } from '@shared/types.ts';
import type { BankIndex } from '@shared/bank.ts';
import { blockItems, findBlock, markBlock, regeneratePlan, startBlock, startSession } from '@shared/actions.ts';
import { mockDone } from '@shared/planner.ts';
import { update } from '../../lib/store.ts';
import { navigate } from '../../lib/router.ts';
import { toast, type Tone } from '../../components/ui.tsx';
import { SUBJECT_ICON, type IconName } from '../../components/Icon.tsx';
import { extraQueue, getRun, MORE_COUNT, readNewWords, vocabDay } from '../vocab/run.ts';

/** Status as the learner sees it: a correction block stays locked until its mock is done. */
export type BlockView = 'todo' | 'active' | 'done' | 'skipped' | 'locked';

export function blockView(state: AppState, b: PlanBlock): BlockView {
  if (b.status === 'todo' && b.reviewOfMock && !mockDone(state, b.reviewOfMock.kind, b.reviewOfMock.session)) return 'locked';
  return b.status;
}

export function blockIcon(b: PlanBlock): IconName {
  switch (b.kind) {
    case 'vocab':
      return 'kana';
    case 'review':
      return b.reviewOfMock ? 'pen' : 'refresh';
    case 'mock':
      return 'target';
    case 'reading':
      return b.title.includes('文型') ? 'languages' : 'book';
    case 'listening':
      return 'headphones';
    case 'notes':
      return 'notebook';
    case 'traps':
      return 'file';
    default:
      return b.title.includes('考点速测') ? 'zap' : SUBJECT_ICON[b.subject];
  }
}

/** Identity colour of a block: its subject; mixed sets (错题重做, 考前一页纸) stay neutral slate. Never amber. */
export function blockTone(b: PlanBlock): Tone {
  if (b.kind === 'mock') return 'primary';
  // Due mistakes are review work: amber (DESIGN §8), not the grey of a mixed set.
  if (b.kind === 'review') return 'warning';
  if (b.subject !== 'mixed') return b.subject;
  return 'mixed';
}

export function blockKindLabel(b: PlanBlock): string {
  if (b.reviewOfMock) return '模考订正';
  switch (b.kind) {
    case 'drill':
      return b.title.includes('考点速测') ? '考点速测' : b.timed ? '限时小测' : '专项练习';
    case 'review':
      return '错题重做';
    case 'vocab':
      return '词汇';
    case 'mock':
      return '整卷模考';
    case 'reading':
      return b.title.includes('文型') ? '文型' : b.timed ? '限时读解' : '读解';
    case 'listening':
      return '听解';
    case 'notes':
      return '考点速记';
    case 'traps':
      return '考前一页纸';
  }
}

// ─── Vocabulary block, live ───

/**
 * What 开始 on today's vocab block will practise right now: the round in progress, else the
 * vocab page's round (before any practice today that is vocabToday's queue, the planned count),
 * else the 加练 round the vocab page starts when today's cards are all done.
 */
export interface VocabNow {
  cards: number;
  /** All due cards (vocabDueCount); one round reviews at most 80 of them. */
  due: number;
  review: number;
  fill: number;
  newWords: number;
  /** A round is open on the vocab page. */
  running: boolean;
  /** Today's cards are done; the block would start a 加练 round. */
  extra: boolean;
}

const vocabCache = new WeakMap<AppState, { key: string; value: VocabNow }>();

export function vocabNow(state: AppState, bank: BankIndex, date: string): VocabNow {
  const override = readNewWords();
  const r = getRun();
  const run = r && !r.finished && r.date === date ? r : null;
  const key = `${date}|${override}|${run?.id ?? ''}`;
  const hit = vocabCache.get(state);
  if (hit && hit.key === key) return hit.value;
  let value: VocabNow;
  if (run) {
    value = { cards: run.cards.filter((c) => !c.retry).length, due: 0, review: 0, fill: 0, newWords: 0, running: true, extra: false };
  } else {
    const day = vocabDay(state, bank, date, override);
    value = day.queue.length
      ? { cards: day.queue.length, due: day.due, ...day.split, running: false, extra: false }
      : { cards: extraQueue(state, bank, MORE_COUNT).length, due: day.due, review: 0, fill: 0, newWords: 0, running: false, extra: true };
  }
  vocabCache.set(state, { key, value });
  return value;
}

const VOCAB_HOW = '先看字写读音（不放音频），再选意思。睡前做记得更牢。';

/** Title shown for a block; an open vocab block shows its live card count. */
export function blockTitle(state: AppState, bank: BankIndex, b: PlanBlock, date: string): string {
  if (b.kind !== 'vocab' || b.status === 'done') return b.title;
  const v = vocabNow(state, bank, date);
  return v.extra ? `词汇 · 加练 ${v.cards} 张卡` : `词汇 · ${v.cards} 张卡`;
}

/** "数理整卷模考 ①" → "数理整卷模考 1": circled digits read as an (i) icon at UI sizes. */
export function plainNumbers(s: string): string {
  return s.replace(/\s*([\u2460-\u2473])/g, (_, c: string) => ` ${c.charCodeAt(0) - 0x2460 + 1}`);
}

/**
 * Short title for lists and the hero: the count and the "限时 / 加练" prefixes live in the meta
 * line instead ("错题重做 · 17 题" → "错题重做", "限时 · 物理 · 电场" → "物理 · 电场").
 */
export function displayTitle(state: AppState, bank: BankIndex, b: PlanBlock, date: string): string {
  const t = plainNumbers(blockTitle(state, bank, b, date))
    .replace(/^(加练|限时)\s*·\s*/, '')
    .replace(/^(加练|限时)\s*·\s*/, '')
    .replace(/\s*·\s*(复习|加练)?\s*\d+\s*(题|张卡)?(\s*\+\s*新词\s*\d+)?$/, '');
  return t.trim() || blockKindLabel(b);
}

/** Reason shown for a block; an open vocab block explains its live numbers. */
export function blockReason(state: AppState, bank: BankIndex, b: PlanBlock, date: string): string {
  if (b.kind !== 'vocab' || b.status === 'done') return b.reason;
  const v = vocabNow(state, bank, date);
  if (v.running) return `这一轮 ${v.cards} 张卡正在进行，接着做完就好。`;
  if (v.extra) return v.cards ? `今天该练的卡都练完了，这一项练 ${v.cards} 张最容易错的卡。` : '还没有学过的词，先去词汇页学几个新词。';
  const parts = [!v.review ? '没有到期的卡' : v.due > v.review ? `到期 ${v.due} 张，这一轮先复习最该复习的 ${v.review} 张` : `到期复习 ${v.review} 张`];
  if (v.fill) parts.push(`补另一项 ${v.fill} 张`);
  // 补另一项 cards come out of the new-word allowance, so "no new words" is only said when neither is there.
  if (v.newWords) parts.push(`新词 ${v.newWords} 个`);
  else if (!v.fill) parts.push('今天不加新词');
  return `${parts.join('，')}。${VOCAB_HOW}`;
}

/** Seconds on the clock of a timed (non-mock) set: the sum of its questions' target times, as startBlock sets it. */
export function timedLimitSec(bank: BankIndex, b: PlanBlock): number | null {
  if (!b.timed || b.kind === 'mock' || b.reviewOfMock) return null;
  let sec = 0;
  for (const id of b.itemIds) sec += bank.byId.get(id)?.targetSec ?? 0;
  return sec > 0 ? sec : null;
}

/** "11 分钟" / "10 分 30 秒". */
export function fmtLimit(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s ? `${m} 分 ${s} 秒` : `${m} 分钟`;
}

/** Number of things in the block, or null when it is only known after a mock. */
export function blockCount(state: AppState, bank: BankIndex, b: PlanBlock, date: string): number | null {
  if (b.kind === 'vocab') return b.status !== 'done' ? vocabNow(state, bank, date).cards : (b.vocabCount ?? null);
  if (b.kind === 'notes') return b.noteTopics?.length ?? null;
  if (b.kind === 'traps') return null;
  if (b.reviewOfMock) return mockDone(state, b.reviewOfMock.kind, b.reviewOfMock.session) ? blockItems(state, bank, b).length : null;
  return b.itemIds.length;
}

export function countLabel(b: PlanBlock, n: number): string {
  if (b.kind === 'vocab') return `${n} 张卡`;
  if (b.kind === 'notes') return `${n} 个考点`;
  return `${n} 题`;
}

/** Latest unfinished practice session that belongs to a block. */
export function openSessionFor(state: AppState, blockId: string): PracticeSession | undefined {
  let best: PracticeSession | undefined;
  for (const s of Object.values(state.sessions)) {
    if (s.blockId !== blockId || s.finishedAt) continue;
    if (!best || s.startedAt > best.startedAt) best = s;
  }
  return best;
}

/** The session the learner left mid-way (if any). */
export function resumableSession(state: AppState): PracticeSession | undefined {
  const id = state.activeSessionId;
  const s = id ? state.sessions[id] : undefined;
  return s && !s.finishedAt ? s : undefined;
}

export function sessionAnswered(s: PracticeSession): number {
  let n = 0;
  for (const id of s.itemIds) {
    const a = s.answers[id];
    if (a && (a.submitted || (a.response !== null && a.response !== undefined))) n++;
  }
  return n;
}

function markActive(blockId: string) {
  update((d) => {
    const b = findBlock(d, blockId);
    if (b && b.status === 'todo') {
      b.status = 'active';
      b.startedAt = new Date().toISOString();
    }
  });
}

export function notesPath(b: PlanBlock): string {
  const t = b.noteTopics?.[0];
  return t ? `/notes/${encodeURIComponent(t)}?block=${encodeURIComponent(b.id)}` : '/notes';
}

/** Start or resume a block: practice blocks open the player, vocab/notes open their pages. */
export function runBlock(state: AppState, bank: BankIndex, block: PlanBlock) {
  if (block.kind === 'vocab') {
    markActive(block.id);
    navigate('/vocab?start=1');
    return;
  }
  if (block.kind === 'notes') {
    markActive(block.id);
    navigate(notesPath(block));
    return;
  }
  if (block.kind === 'traps') {
    markActive(block.id);
    navigate('/traps?block=' + encodeURIComponent(block.id));
    return;
  }
  const open = openSessionFor(state, block.id);
  if (open) {
    if (state.activeSessionId !== open.id) update((d) => void (d.activeSessionId = open.id));
    navigate('/session/' + open.id);
    return;
  }
  if (block.reviewOfMock && !blockItems(state, bank, block).length) {
    update((d) => markBlock(d, block.id, 'done'));
    toast('这次模考没有错题和没把握的题，订正直接完成', 'success');
    return;
  }
  const s = update((d, b) => {
    const draft = findBlock(d, block.id);
    return draft ? startBlock(d, b, draft) : null;
  });
  if (s) navigate('/session/' + s.id);
  else toast('这一项暂时没有可做的题，可以先做下一项', 'warning');
}

/** The latest finished practice session of a block (its result page). */
export function finishedSessionFor(state: AppState, blockId: string): PracticeSession | undefined {
  let best: PracticeSession | undefined;
  for (const s of Object.values(state.sessions)) {
    if (s.blockId !== blockId || !s.finishedAt) continue;
    if (!best || s.startedAt > best.startedAt) best = s;
  }
  return best;
}

/** Practise a finished block's items again without touching the plan. */
export function redoBlock(state: AppState, block: PlanBlock) {
  if (block.kind === 'vocab' || block.kind === 'notes' || block.kind === 'traps') {
    navigate(block.kind === 'vocab' ? '/vocab' : block.kind === 'traps' ? '/traps' : notesPath(block));
    return;
  }
  let ids = block.itemIds;
  if (!ids.length) {
    const last = Object.values(state.sessions)
      .filter((s) => s.blockId === block.id)
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
    ids = last?.itemIds ?? [];
  }
  if (!ids.length) {
    toast('这一项没有可以再练的题', 'warning');
    return;
  }
  const s = update((d) => startSession(d, { kind: 'drill', title: `再练 · ${block.title}`, subject: block.subject, itemIds: [...ids] }));
  navigate('/session/' + s.id);
}

export function skipBlock(blockId: string) {
  update((d) => markBlock(d, blockId, 'skipped'));
}

export function restoreBlock(blockId: string) {
  update((d) => markBlock(d, blockId, 'todo'));
}

export function finishBlockManually(blockId: string) {
  update((d) => markBlock(d, blockId, 'done'));
  toast('已完成这一项', 'success');
}

/**
 * Rebuild a day's plan keeping finished/started blocks, without duplicating the
 * kinds that carry no item ids (vocab, notes, trap sheet, mock corrections) when one is already kept.
 */
export function regenerateDay(d: AppState, bank: BankIndex, date: string) {
  const plan = regeneratePlan(d, bank, date);
  const kept = plan.blocks.filter((b) => b.status !== 'todo');
  const dup = (b: PlanBlock) =>
    b.status === 'todo' &&
    kept.some(
      (k) =>
        (b.kind === 'vocab' && k.kind === 'vocab') ||
        (b.kind === 'notes' && k.kind === 'notes') ||
        (b.kind === 'traps' && k.kind === 'traps') ||
        (!!b.reviewOfMock && k.reviewOfMock?.kind === b.reviewOfMock.kind && k.reviewOfMock.session === b.reviewOfMock.session),
    );
  plan.blocks = plan.blocks.filter((b) => !dup(b));
  return plan;
}
