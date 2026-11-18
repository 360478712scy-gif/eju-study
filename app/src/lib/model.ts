import type { BankIndex } from '@shared/bank.ts';
import type { AppState, Item, PlanBlock, PracticeSession } from '@shared/types.ts';
import { addDays, parseDate } from '@shared/dates.ts';
import { t } from '../copy/index.ts';

export const schoolNames = {
  waseda: t.practice.schoolWaseda, meiji: t.practice.schoolMeiji, aoyama: t.practice.schoolAoyama,
  rikkyo: t.practice.schoolRikkyo, chuo: t.practice.schoolChuo, hosei: t.practice.schoolHosei,
};
const shortSchoolNames = {
  waseda: t.plan.schoolShortWaseda, meiji: t.plan.schoolShortMeiji, aoyama: t.plan.schoolShortAoyama,
  rikkyo: t.plan.schoolShortRikkyo, chuo: t.plan.schoolShortChuo, hosei: t.plan.schoolShortHosei,
};

export function blockSchoolName(block: PlanBlock) {
  const school = block.school ?? block.why.school;
  return school && shortSchoolNames[school];
}

export const percent = (value: number) => Math.round(value * 100);
export function shortDate(date: string) {
  const d = parseDate(date);
  return t.time.monthDay(d.getMonth() + 1, d.getDate());
}
export const weekday = (date: string) => t.time.weekdayLabel(parseDate(date).getDay());
export const topicName = (bank: BankIndex, id?: string) => id ? bank.topics.get(id)?.name ?? id : '';
export const findItem = (bank: BankIndex, state: AppState, id: string) => bank.byId.get(id) ?? state.variants[id];
export const itemMinutes = (items: Item[]) => Math.round(items.reduce((sum, it) => sum + it.targetSec, 0) / 60);
export const practiced = (items: Item[], state: AppState) => items.filter(it => state.progress[it.id]?.attempts > 0).length;
export const blockStatus = {
  todo: t.today.queueStatePending, active: t.today.queueStateActive, done: t.today.queueStateDone, skipped: t.today.queueStateSkipped,
};
export const phaseNames = {
  foundation: t.plan.phase1Name, reinforce: t.plan.phase2Name, integrate: t.plan.phase3Name,
  sprint: t.plan.phase4Name, taper: t.plan.taperWeekBadge, off: t.plan.dayTagRest,
};

export function blockTitle(block: PlanBlock, bank: BankIndex) {
  const topic = topicName(bank, block.topic);
  if (block.why.code === 'mock_correction') return t.today.correctPaper;
  switch (block.kind) {
    case 'learn': return (block.why.code === 'weak_focus' ? t.today.taskWeakFocus : t.today.focus)(topic);
    case 'interleave': return t.today.taskInterleave;
    case 'review': return t.today.taskWarmupReview;
    case 'quiz': return t.today.taskWeeklyQuiz;
    case 'school': {
      const school = blockSchoolName(block);
      const purpose = block.schoolPurpose ?? block.why.schoolPurpose;
      if (!school) return t.mock.schoolRowTitle;
      if (!purpose) return school;
      return t.plan.schoolTaskTitle(school, purpose === 'exam_style' ? t.plan.schoolExamStyle : t.plan.schoolExtension);
    }
    case 'mock': return t.today.timedPaper(block.mock?.kind === 'math' ? t.common.mathFull : t.common.science);
    case 'break': return block.minutes === 5 ? t.today.taskShortBreak : t.today.breakFor(block.minutes);
    case 'notes': return t.today.consolidate;
  }
}
export function blockReason(block: PlanBlock, bank: BankIndex) {
  const topic = topicName(bank, block.why.topic ?? block.topic);
  switch (block.why.code) {
    case 'rest': return block.minutes === 5 ? t.today.whyBreak : t.today.breakReason;
    case 'weak_focus': return t.today.whyWeakHighWeight(topic);
    case 'spaced': return t.today.whySpacedDue(block.itemIds.length);
    case 'school_practice': return t.today.whySchoolTaste;
    case 'maintenance': return t.today.whyStrongMaintain(topic);
    default: return blockTitle(block, bank);
  }
}

export function pendingScripts(session: PracticeSession, bank: BankIndex) {
  if (!session.sealedAt || session.finishedAt) return [];
  return session.itemIds.filter(id => {
    const response = session.answers[id]?.response;
    return bank.byId.get(id)?.format === 'written' && typeof response === 'object' && response &&
      'text' in response && response.text?.trim() && !('marks' in response);
  });
}

export function recentDays(date: string, count: number) {
  return Array.from({ length: count }, (_, i) => addDays(date, i - count + 1));
}
