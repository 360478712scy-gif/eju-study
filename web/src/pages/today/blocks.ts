// Plan-block helpers shared by the Today and Plan pages: presentation (icon, tone, labels)
// and the actions behind "开始 / 继续 / 再练 / 跳过".
import type { AppState, Phase, PlanBlock, PracticeSession } from '@shared/types.ts';
import type { BankIndex } from '@shared/bank.ts';
import { blockItems, findBlock, markBlock, regeneratePlan, startBlock, startSession } from '@shared/actions.ts';
import { mockDone } from '@shared/planner.ts';
import { update } from '../../lib/store.ts';
import { navigate } from '../../lib/router.ts';
import { toast, type Tone } from '../../components/ui.tsx';
import { SUBJECT_ICON, type IconName } from '../../components/Icon.tsx';

/** Colour of each sprint phase (calendar bands, Today header). */
export const PHASE_TONE: Record<Phase, Tone> = { foundation: 'primary', practice: 'warning', final: 'success', exam: 'danger' };

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
      return 'book';
    case 'listening':
      return 'headphones';
    case 'notes':
      return 'notebook';
    default:
      return SUBJECT_ICON[b.subject];
  }
}

export function blockTone(b: PlanBlock): Tone {
  if (b.kind === 'mock') return 'primary';
  if (b.subject !== 'mixed') return b.subject;
  if (b.kind === 'review') return 'warning';
  if (b.kind === 'notes') return 'success';
  return 'primary';
}

export function blockKindLabel(b: PlanBlock): string {
  if (b.reviewOfMock) return '模考订正';
  switch (b.kind) {
    case 'drill':
      return b.timed ? '限时小测' : '专项练习';
    case 'review':
      return '错题重做';
    case 'vocab':
      return '词汇';
    case 'mock':
      return '整卷模考';
    case 'reading':
      return b.timed ? '限时读解' : '读解';
    case 'listening':
      return '听解';
    case 'notes':
      return '考点速记';
  }
}

/** Number of things in the block, or null when it is only known after a mock. */
export function blockCount(state: AppState, bank: BankIndex, b: PlanBlock): number | null {
  if (b.kind === 'vocab') return b.vocabCount ?? null;
  if (b.kind === 'notes') return b.noteTopics?.length ?? null;
  if (b.reviewOfMock) return mockDone(state, b.reviewOfMock.kind, b.reviewOfMock.session) ? blockItems(state, bank, b).length : null;
  return b.itemIds.length;
}

export function countLabel(b: PlanBlock, n: number): string {
  if (b.kind === 'vocab') return `${n} 个词`;
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
  return t ? '/notes/' + encodeURIComponent(t) : '/notes';
}

/** Start or resume a block: practice blocks open the player, vocab/notes open their pages. */
export function runBlock(state: AppState, bank: BankIndex, block: PlanBlock) {
  if (block.kind === 'vocab') {
    markActive(block.id);
    navigate('/vocab');
    return;
  }
  if (block.kind === 'notes') {
    markActive(block.id);
    navigate(notesPath(block));
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
  else toast('这一块暂时没有可做的题，可以先做下一块', 'warning');
}

/** Practise a finished block's items again without touching the plan. */
export function redoBlock(state: AppState, block: PlanBlock) {
  if (block.kind === 'vocab') return navigate('/vocab');
  if (block.kind === 'notes') return navigate(notesPath(block));
  let ids = block.itemIds;
  if (!ids.length) {
    const last = Object.values(state.sessions)
      .filter((s) => s.blockId === block.id)
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
    ids = last?.itemIds ?? [];
  }
  if (!ids.length) {
    toast('这一块没有可以再练的题', 'warning');
    return;
  }
  const s = update((d) => startSession(d, { kind: 'drill', title: `再练 · ${block.title}`, subject: block.subject, itemIds: [...ids] }));
  navigate('/session/' + s.id);
}

export function skipBlock(blockId: string) {
  update((d) => markBlock(d, blockId, 'skipped'));
  toast('已跳过，随时可以恢复');
}

export function restoreBlock(blockId: string) {
  update((d) => markBlock(d, blockId, 'todo'));
}

export function finishBlockManually(blockId: string) {
  update((d) => markBlock(d, blockId, 'done'));
  toast('已完成这一块', 'success');
}

/**
 * Rebuild a day's plan keeping finished/started blocks, without duplicating the
 * kinds that carry no item ids (vocab, notes, mock corrections) when one is already kept.
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
        (!!b.reviewOfMock && k.reviewOfMock?.kind === b.reviewOfMock.kind && k.reviewOfMock.session === b.reviewOfMock.session),
    );
  plan.blocks = plan.blocks.filter((b) => !dup(b));
  return plan;
}
