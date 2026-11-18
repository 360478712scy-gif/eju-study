// Mutate only a transaction draft. The server commits the draft after the whole action succeeds.
import { buildDayPlan } from './planner.ts';
import { gradeItem, isAnswered, writtenPoints } from './grading.ts';
import { updateItemProgress } from './srs.ts';
import { daysBetween, isValidDate, isoWeekday, monday, studyDate } from './dates.ts';
import { hasActivity, weekDates } from './calendar.ts';
import {
  MAX_SCORE,
  DEFAULT_NEW_CARDS_PER_DAY,
  SCHOOLS,
  SUBJECTS,
  type AppState,
  type Confidence,
  type Item,
  type MockKind,
  type PracticeSession,
  type Profile,
  type Response,
  type Settings,
  type WrittenResponse,
  type MockResult,
} from './types.ts';
import type { BankIndex } from './bank.ts';

export type Action =
  | { type: 'profile'; patch: Partial<Profile> }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'move'; from: string; to: string }
  | { type: 'day'; date: string; value: 'off' | 'study' | 'default' }
  | { type: 'restWeek'; date: string; paused: boolean }
  | { type: 'startBlock' | 'skipBlock' | 'completeBlock'; blockId: string; date: string }
  | { type: 'startPractice'; itemIds: string[]; kind?: 'free' | 'review' | 'drill' }
  | { type: 'startVariant'; jobId: string }
  | { type: 'startMock'; kind: MockKind; session: string }
  | {
      type: 'draft' | 'answer';
      sessionId: string;
      itemId: string;
      response: Response;
      seconds: number;
      confidence?: Confidence;
      gaveUp?: boolean;
    }
  | { type: 'tick'; sessionId?: string; seconds: number }
  | { type: 'finish' | 'abandon'; sessionId: string }
  | { type: 'topicNote'; topic: string; text: string }
  | { type: 'itemNote'; itemId: string; text: string }
  | { type: 'star'; itemId: string; value: boolean };
export function check(value: unknown, error: string): asserts value {
  if (!value) throw new Error(error);
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const integer = (n: unknown, min: number, max: number) => Number.isInteger(n) && Number(n) >= min && Number(n) <= max;
function keys(p: object, allowed: object) {
  check(record(p) && Object.keys(p).every((k) => Object.hasOwn(allowed, k)), 'invalid fields');
}
function text(v: unknown, max: number) {
  check(typeof v === 'string' && v.length <= max, 'invalid text');
}
function validateProfile(p: Profile) {
  check(
    isValidDate(p.startDate) &&
      isValidDate(p.examDate) &&
      daysBetween(p.startDate, p.examDate) > 0 &&
      daysBetween(p.startDate, p.examDate) <= 730,
    'invalid dates',
  );
  check(
    integer(p.dailyMinutes, 30, 360) &&
      p.mathCourse === 2 &&
      typeof p.onboarded === 'boolean' &&
      typeof p.strongEarlyChemistry === 'boolean',
    'invalid profile',
  );
  check(
    Array.isArray(p.weekdays) &&
      p.weekdays.length > 0 &&
      new Set(p.weekdays).size === p.weekdays.length &&
      p.weekdays.every((d) => integer(d, 1, 7)),
    'invalid weekdays',
  );
  check(Array.isArray(p.schools) && p.schools.every((v) => SCHOOLS.includes(v)), 'invalid school');
  check(
    [p.weakTopics, p.strongTopics].every(
      (list) =>
        Array.isArray(list) && list.every((t) => typeof t === 'string' && /^(math|chem|phys)(\.[a-z0-9_-]+)+$/.test(t)),
    ),
    'invalid topics',
  );
  const validScores = (map: Profile['targets']) =>
    record(map) && Object.keys(map).length === 3 && SUBJECTS.every((k) => integer(map[k], 0, MAX_SCORE[k]));
  check(validScores(p.targets) && validScores(p.baseline), 'invalid scores');
  check(
    Array.isArray(p.milestones) &&
      p.milestones.length === 4 &&
      p.milestones.every(
        (m, i) =>
          isValidDate(m.date) &&
          m.date >= p.startDate &&
          m.date <= p.examDate &&
          (!i || m.date > p.milestones[i - 1].date) &&
          validScores(m.targets),
      ),
    'invalid milestones',
  );
}
function checkResponse(it: Item, r: Response, draft: boolean) {
  if (r === null) return;
  if (it.format === 'choice') check(integer(r, 0, (it.options?.length ?? 0) - 1), 'invalid choice');
  if (it.format === 'blanks')
    check(
      record(r) &&
        Object.entries(r).every(
          ([k, v]) => Object.hasOwn(it.blanks ?? {}, k) && typeof v === 'string' && v.length <= 1,
        ),
      'invalid marksheet',
    );
  if (it.format === 'written') {
    check(record(r), 'written response required');
    if (r.text !== undefined) text(r.text, 16000);
    if ('marks' in r) writtenPoints(it, r);
    else
      check(draft && typeof r.text === 'string' && Object.keys(r).every((k) => k === 'text'), 'written marks required');
  }
}
function recordAttempt(s: AppState, session: PracticeSession, it: Item, now: Date) {
  const ans = session.answers[it.id];
  const g = ans.gaveUp ? { correct: false, score: 0 } : gradeItem(it, ans.response);
  const date = studyDate(now);
  const a = {
    id: crypto.randomUUID(),
    itemId: it.id,
    subject: it.subject,
    topic: it.topic,
    at: now.toISOString(),
    date,
    mode: session.kind,
    sessionId: session.id,
    blockId: session.blockId,
    ...g,
    response: ans.response,
    seconds: ans.seconds,
    confidence: ans.confidence,
    firstTry: !s.attempts.some((a) => a.itemId === it.id),
    gaveUp: ans.gaveUp,
  };
  s.attempts.push(a);
  s.progress[it.id] = updateItemProgress(s.progress[it.id], a, it.targetSec, it.format === 'choice');
  const day = (s.days[date] ??= { seconds: 0, answered: 0, correct: 0 });
  day.answered++;
  day.correct += Number(g.correct);
  Object.assign(ans, { submitted: true, correct: g.correct, score: g.score });
  return g;
}
function mockResult(session: PracticeSession, bank: BankIndex, now: Date): MockResult {
  const subjects: MockResult['bySubject'] = {};
  let earned = 0,
    total = 0,
    answered = 0,
    correct = 0;
  for (const id of session.itemIds) {
    const it = bank.byId.get(id)!;
    const a = session.answers[id];
    const w =
      it.written?.parts.reduce((sum, p) => sum + p.points, 0) ?? (it.subject === 'math' ? it.targetSec / 660 : 1);
    total += w;
    earned += w * (a.score ?? 0);
    correct += Number(!!a.correct);
    answered += Number(!a.gaveUp);
    const sub = (subjects[it.subject] ??= { total: 0, correct: 0, raw: 0, estimate: 0 });
    sub.total++;
    sub.correct += Number(!!a.correct);
    sub.raw += w * (a.score ?? 0);
    sub.estimate += w;
  }
  for (const sub of SUBJECTS) {
    const row = subjects[sub];
    if (row) {
      row.raw /= row.estimate;
      row.estimate = Math.round(row.raw * MAX_SCORE[sub]);
    }
  }
  const kind = session.mock!.kind;
  return {
    id: session.id,
    ...session.mock!,
    date: studyDate(now),
    startedAt: session.startedAt,
    finishedAt: now.toISOString(),
    seconds: session.elapsedSec,
    itemIds: session.itemIds,
    answered,
    correct,
    total: session.itemIds.length,
    raw: earned / total,
    estimate:
      kind === 'school'
        ? null
        : kind === 'science'
          ? (subjects.physics?.estimate ?? 0) + (subjects.chemistry?.estimate ?? 0)
          : subjects.math!.estimate,
    bySubject: kind === 'school' ? undefined : subjects,
  };
}

export function applyAction(
  s: AppState,
  bank: BankIndex,
  action: Action,
  now = new Date(),
  verifiedVariant?: Item,
): unknown {
  const today = studyDate(now);
  const a = action;
  check(a && typeof a.type === 'string', 'action required');
  function mutableDay(date: string) {
    check(isValidDate(date) && date >= s.profile.startDate && date < s.profile.examDate, 'date outside plan');
    check(!hasActivity(s, date), 'study already started');
    delete s.plans[date];
  }
  function start(
    kind: PracticeSession['kind'],
    ids: string[],
    blockId?: string,
    mock?: PracticeSession['mock'],
    timeLimitSec?: number,
  ) {
    check(!s.activeSessionId, 'session already active');
    check(
      Array.isArray(ids) &&
        ids.length > 0 &&
        ids.length <= 500 &&
        new Set(ids).size === ids.length &&
        ids.every((id) => bank.byId.has(id) || Object.hasOwn(s.variants, id)),
      'invalid itemIds',
    );
    const subjectOf = (id: string) => (bank.byId.get(id) ?? s.variants[id]).subject;
    const subject = subjectOf(ids[0]);
    const session: PracticeSession = {
      id: crypto.randomUUID(),
      kind,
      title: kind,
      subject: ids.every((id) => subjectOf(id) === subject) ? subject : 'mixed',
      blockId,
      mock,
      itemIds: [...ids],
      index: 0,
      answers: {},
      startedAt: now.toISOString(),
      exam: !!timeLimitSec,
      timeLimitSec,
      elapsedSec: 0,
    };
    s.sessions[session.id] = session;
    s.activeSessionId = session.id;
    return session;
  }
  switch (a.type) {
    case 'profile': {
      keys(a.patch, s.profile);
      const p = { ...s.profile, ...a.patch };
      if (a.patch.targets && !a.patch.milestones)
        p.milestones = p.milestones.map((m, i) => (i === 3 ? { ...m, targets: p.targets } : m));
      validateProfile(p);
      s.profile = p;
      return p;
    }
    case 'settings': {
      const current = { ...s.settings, newCardsPerDay: s.settings.newCardsPerDay ?? DEFAULT_NEW_CARDS_PER_DAY };
      keys(a.patch, current);
      const p = { ...current, ...a.patch };
      check(integer(p.newCardsPerDay, 0, 500), 'invalid newCardsPerDay');
      check(
        ['system', 'dark', 'light'].includes(p.theme) &&
          typeof p.musicEnabled === 'boolean' &&
          typeof p.coachEnabled === 'boolean' &&
          Number.isFinite(p.fontScale) &&
          p.fontScale >= 0.6 &&
          p.fontScale <= 3 &&
          Number.isFinite(p.musicVolume) &&
          p.musicVolume >= 0 &&
          p.musicVolume <= 1,
        'invalid settings',
      );
      check(
        typeof p.coachModel === 'string' &&
          /^[a-zA-Z0-9._-]{1,80}$/.test(p.coachModel) &&
          ['low', 'medium', 'high'].includes(p.coachEffort),
        'invalid coach settings',
      );
      text(p.musicTrack, 150);
      s.settings = p;
      return p;
    }
    case 'move': {
      check(a.from !== a.to, 'same day');
      mutableDay(a.from);
      mutableDay(a.to);
      check(!s.calendar.restWeeks.includes(monday(a.to)), 'destination in rest week');
      const sourceWeek = weekDates(s, a.from, a.from < today ? monday(a.from) : today);
      const destWeek = weekDates(s, a.to, today);
      check(
        sourceWeek.includes(a.from) &&
          (!destWeek.includes(a.to) ||
            (!s.profile.weekdays.includes(isoWeekday(a.to)) &&
              s.calendar.overrides[a.to] !== 'study' &&
              !hasActivity(s, a.to))),
        'move from study day to free day',
      );
      const existing = s.calendar.moves.find((m) => m.to === a.from);
      const origin = existing?.from ?? a.from;
      if (existing) {
        s.calendar.moves = s.calendar.moves.filter((m) => m !== existing);
        delete s.calendar.overrides[a.from];
      }
      if (origin === a.to) {
        delete s.calendar.overrides[origin];
        return s.calendar;
      }
      check(!s.calendar.moves.some((m) => m.from === a.to), 'destination already transferred');
      s.calendar.moves.push({ from: origin, to: a.to });
      s.calendar.overrides[origin] = 'off';
      s.calendar.overrides[a.to] = 'study';
      return s.calendar;
    }
    case 'day': {
      check(['off', 'study', 'default'].includes(a.value), 'invalid day');
      mutableDay(a.date);
      const transfer = s.calendar.moves.find((m) => m.from === a.date || m.to === a.date);
      if (transfer) {
        s.calendar.moves = s.calendar.moves.filter((m) => m !== transfer);
        delete s.calendar.overrides[transfer.from];
        delete s.calendar.overrides[transfer.to];
      }
      if (a.value === 'default') delete s.calendar.overrides[a.date];
      else s.calendar.overrides[a.date] = a.value;
      return s.calendar;
    }
    case 'restWeek': {
      check(isValidDate(a.date) && typeof a.paused === 'boolean', 'invalid week');
      const week = monday(a.date);
      s.calendar.restWeeks = s.calendar.restWeeks.filter((d) => d !== week);
      if (a.paused) s.calendar.restWeeks.push(week);
      return s.calendar;
    }
    case 'startVariant': {
      const item = verifiedVariant ?? s.variants['variant-' + a.jobId];
      check(item && item.id === 'variant-' + a.jobId, 'verified variant missing');
      s.variants[item.id] = item;
      return start('free', [item.id]);
    }
    case 'startPractice':
      check(!a.kind || ['free', 'review', 'drill'].includes(a.kind), 'invalid kind');
      return start(a.kind ?? 'free', a.itemIds);
    case 'startMock': {
      const paper = bank.papers.find((p) => p.session === a.session && p.kind === a.kind);
      check(paper, 'paper missing');
      return start('mock', paper.itemIds, undefined, { kind: a.kind, session: a.session }, paper.timeLimitSec);
    }
    case 'startBlock':
    case 'skipBlock':
    case 'completeBlock': {
      check(isValidDate(a.date) && a.date === today, 'block requires current study date');
      const plan = (s.plans[a.date] = buildDayPlan(s, bank, a.date, today));
      const block = plan.blocks.find((b) => b.id === a.blockId);
      check(block, 'block missing');
      const manual = !block.itemIds.length;
      if (a.type === 'completeBlock') {
        check(manual && ['active', 'todo'].includes(block.status), 'finish session instead');
        block.status = 'done';
        block.doneAt = now.toISOString();
        return block;
      }
      check(block.status === 'todo', 'block already started');
      if (a.type === 'skipBlock') {
        block.status = 'skipped';
        return block;
      }
      check(!s.activeSessionId && !plan.blocks.some((b) => b.status === 'active'), 'block already active');
      block.status = 'active';
      block.startedAt = now.toISOString();
      if (manual) return block;
      const paper =
        block.mock && bank.papers.find((p) => p.kind === block.mock!.kind && p.session === block.mock!.session);
      return start(
        block.mock ? 'mock' : block.kind === 'review' ? 'review' : 'block',
        block.itemIds,
        block.id,
        block.mock,
        paper?.timeLimitSec ?? (block.kind === 'quiz' ? block.minutes * 60 : undefined),
      );
    }
    case 'topicNote':
      text(a.text, 16000);
      check(bank.topics.has(a.topic), 'unknown topic');
      s.notes[a.topic] = a.text;
      return a.text;
    case 'star':
    case 'itemNote': {
      check(bank.byId.has(a.itemId), 'unknown item');
      const p = (s.progress[a.itemId] ??= {
        attempts: 0,
        correct: 0,
        lastAt: now.toISOString(),
        lastCorrect: false,
        lastScore: 0,
        inMistakes: false,
        box: 0,
      });
      if (a.type === 'star') {
        check(typeof a.value === 'boolean', 'invalid star');
        p.starred = a.value;
      } else {
        text(a.text, 2000);
        p.note = a.text;
      }
      return p;
    }
    case 'tick': {
      check(integer(a.seconds, 0, 3600), 'invalid time');
      if (a.sessionId) {
        const session = s.sessions[a.sessionId];
        check(
          session && s.activeSessionId === a.sessionId && !session.finishedAt && !session.sealedAt,
          'session closed',
        );
        session.elapsedSec += a.seconds;
      }
      (s.days[today] ??= { seconds: 0, answered: 0, correct: 0 }).seconds += a.seconds;
      return s.days[today];
    }
    case 'draft':
    case 'answer':
    case 'finish':
    case 'abandon':
      break;
    default:
      throw new Error('unknown action');
  }
  const session = s.sessions[a.sessionId];
  check(session && !session.finishedAt && s.activeSessionId === session.id, 'session closed');
  const block = session.blockId
    ? s.plans[session.blockId.split(':')[0]]?.blocks.find((b) => b.id === session.blockId)
    : undefined;
  if (a.type === 'abandon') {
    session.finishedAt = now.toISOString();
    delete s.activeSessionId;
    if (block) block.status = 'todo';
    return { abandoned: true };
  }
  if (a.type === 'answer' || a.type === 'draft') {
    const it = bank.byId.get(a.itemId);
    check(it && session.itemIds.includes(it.id), 'item not in session');
    check(
      integer(a.seconds, 0, 86400) &&
        (a.confidence === undefined || ['sure', 'guess', 'unsure'].includes(a.confidence)) &&
        (a.gaveUp === undefined || typeof a.gaveUp === 'boolean'),
      'invalid answer',
    );
    const old = session.answers[it.id];
    check(!old?.submitted, 'already submitted');
    if (session.sealedAt) {
      check(it.format === 'written' && old?.response && a.type === 'answer' && !a.gaveUp, 'script sealed');
      writtenPoints(it, a.response);
      const textBefore = (old.response as WrittenResponse).text;
      check(textBefore === (a.response as WrittenResponse).text, 'script changed');
      old.response = a.response;
      return null;
    }
    if (session.exam) {
      check(now.getTime() - Date.parse(session.startedAt) <= session.timeLimitSec! * 1000, 'time expired: finish');
      if (it.format === 'written')
        check(a.response === null || (record(a.response) && !('marks' in a.response)), 'mark after seal');
    }
    const draft = a.type === 'draft' || session.exam;
    checkResponse(it, a.response, draft);
    if (!draft && !a.gaveUp) check(isAnswered(it, a.response), 'empty answer');
    session.answers[it.id] = {
      response: a.response,
      seconds: a.seconds,
      confidence: a.confidence,
      gaveUp: a.gaveUp,
      submitted: false,
    };
    session.index = session.itemIds.indexOf(it.id);
    return draft ? null : recordAttempt(s, session, it, now);
  }
  if (!session.exam)
    check(
      Object.values(session.answers).some((ans) => ans.submitted),
      'empty session: abandon',
    );
  if (session.exam) {
    session.sealedAt ??= now.toISOString();
    const pending = session.itemIds.filter((id) => {
      const ans = session.answers[id];
      const it = bank.byId.get(id)!;
      return (
        it.format === 'written' &&
        !ans?.gaveUp &&
        !!(ans?.response as WrittenResponse)?.text?.trim() &&
        !(ans.response as WrittenResponse).marks
      );
    });
    if (pending.length) return { pendingWritten: pending };
    for (const id of session.itemIds) {
      const it = bank.byId.get(id)!;
      const ans = (session.answers[id] ??= { response: null, seconds: 0, submitted: false });
      const blank =
        ans.gaveUp ||
        (it.format === 'written' && !(ans.response as WrittenResponse)?.marks) ||
        !isAnswered(it, ans.response);
      if (blank) {
        ans.gaveUp = true;
        ans.response = null;
      }
      if (!blank || session.kind === 'mock') recordAttempt(s, session, it, new Date(session.sealedAt));
    }
  }
  if (session.kind === 'mock') {
    s.mocks.push(mockResult(session, bank, now));
    const followUp =
      session.blockId &&
      s.plans[session.blockId.split(':')[0]]?.blocks.find(
        (b) => b.why.code === 'mock_correction' && b.status === 'todo',
      );
    if (followUp) {
      let remaining = followUp.minutes * 60;
      for (const id of session.itemIds) {
        if (!s.progress[id]?.inMistakes) continue;
        const it = bank.byId.get(id)!;
        if (it.targetSec > remaining) continue;
        followUp.itemIds.push(id);
        remaining -= it.targetSec;
      }
      if (followUp.itemIds.length) {
        followUp.kind = 'review';
        followUp.topic = bank.byId.get(followUp.itemIds[0])!.topic;
      }
    }
  }
  session.finishedAt = now.toISOString();
  delete s.activeSessionId;
  if (block) {
    block.status = 'done';
    block.doneAt = session.finishedAt;
  }
  return session;
}
