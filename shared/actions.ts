// Pure state transitions. Each function mutates the draft state passed in
// (the client store clones before calling) and returns useful results.
import type {
  AppState,
  Attempt,
  AttemptMode,
  Confidence,
  Item,
  MockKind,
  MockResult,
  PlanBlock,
  PracticeSession,
  Subject,
  VocabSkill,
} from './types.ts';
import type { BankIndex } from './bank.ts';
import { mockItems } from './bank.ts';
import { gradeItem, type GradeResult } from './grading.ts';
import { updateItemProgress, updateVocabSkill } from './srs.ts';
import { buildDayPlan, PLANNER_VERSION, vocabSkills, mockLimitFor } from './planner.ts';
import { mockEstimate } from './stats.ts';

export function uid(prefix = ''): string {
  const c = globalThis.crypto;
  const raw = c && 'randomUUID' in c ? c.randomUUID() : `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  return prefix ? `${prefix}-${raw}` : raw;
}

export function ensureDay(state: AppState, date: string) {
  if (!state.days[date]) state.days[date] = { seconds: 0, answered: 0, correct: 0, vocab: 0 };
  return state.days[date];
}

/** Today's plan, generating it on first access (or when the planner changed and nothing started). */
export function ensurePlan(state: AppState, bank: BankIndex, date: string) {
  const cur = state.plans[date];
  const started = cur?.blocks.some((b) => b.status !== 'todo');
  if (!cur || (cur.plannerVersion !== PLANNER_VERSION && !started)) {
    state.plans[date] = buildDayPlan(state, bank, date);
  }
  return state.plans[date];
}

/** Rebuild today's plan keeping finished/started blocks; only the remaining time is re-planned. */
export function regeneratePlan(state: AppState, bank: BankIndex, date: string) {
  const old = state.plans[date];
  const keep = (old?.blocks || []).filter((b) => b.status !== 'todo');
  const fresh = buildDayPlan(state, bank, date, { keep });
  fresh.blocks = [...keep, ...fresh.blocks];
  fresh.blocks.forEach((b, i) => {
    if (b.status === 'todo') b.id = `${date}:r${Date.now().toString(36)}${i}`;
  });
  state.plans[date] = fresh;
  return fresh;
}

export interface StartOptions {
  kind: PracticeSession['kind'];
  title: string;
  subject: Subject | 'mixed';
  itemIds: string[];
  blockId?: string;
  mock?: { kind: MockKind; session: string };
  exam?: boolean;
  timeLimitSec?: number;
}

export function startSession(state: AppState, opts: StartOptions, now = new Date()): PracticeSession {
  const s: PracticeSession = {
    id: uid('s'),
    kind: opts.kind,
    title: opts.title,
    subject: opts.subject,
    blockId: opts.blockId,
    mock: opts.mock,
    itemIds: opts.itemIds,
    index: 0,
    answers: {},
    startedAt: now.toISOString(),
    exam: !!opts.exam,
    timeLimitSec: opts.timeLimitSec,
    elapsedSec: 0,
  };
  state.sessions[s.id] = s;
  state.activeSessionId = s.id;
  if (opts.blockId) {
    const b = findBlock(state, opts.blockId);
    if (b && b.status === 'todo') {
      b.status = 'active';
      b.startedAt = now.toISOString();
    }
  }
  return s;
}

export function findBlock(state: AppState, blockId: string): PlanBlock | undefined {
  const date = blockId.split(':')[0];
  return state.plans[date]?.blocks.find((b) => b.id === blockId);
}

/** Items for a block, resolving mock-correction blocks at start time. */
export function blockItems(state: AppState, bank: BankIndex, block: PlanBlock): Item[] {
  if (block.reviewOfMock) {
    const { kind, session } = block.reviewOfMock;
    const res = [...state.mocks].reverse().find((m) => m.kind === kind && m.session === session);
    if (!res) return [];
    return res.itemIds
      .filter((id) => {
        const a = [...state.attempts].reverse().find((x) => x.itemId === id && x.mode === 'mock');
        return !a || !a.correct || a.confidence === 'guess';
      })
      .map((id) => bank.byId.get(id))
      .filter(Boolean) as Item[];
  }
  if (block.mock && !block.itemIds.length) return mockItems(bank, block.mock.kind, block.mock.session);
  return block.itemIds.map((id) => bank.byId.get(id)).filter(Boolean) as Item[];
}

export function startBlock(state: AppState, bank: BankIndex, block: PlanBlock, now = new Date()): PracticeSession | null {
  const items = blockItems(state, bank, block);
  if (!items.length) return null;
  const isMock = block.kind === 'mock' && !!block.mock;
  const timed = isMock || !!block.timed;
  return startSession(
    state,
    {
      kind: isMock ? 'mock' : block.kind === 'review' ? 'review' : 'block',
      title: block.title,
      subject: block.subject,
      itemIds: items.map((it) => it.id),
      blockId: block.id,
      mock: block.mock,
      exam: timed,
      timeLimitSec: isMock ? mockLimitFor(block.mock!.kind, items) : timed ? items.reduce((s, it) => s + it.targetSec, 0) : undefined,
    },
    now,
  );
}

export interface AnswerInput {
  sessionId: string;
  itemId: string;
  response: number | Record<string, string> | null;
  seconds: number;
  confidence?: Confidence;
  gaveUp?: boolean;
  date: string;
  now?: Date;
}

function attemptMode(s: PracticeSession): AttemptMode {
  if (s.kind === 'mock') return 'mock';
  if (s.kind === 'review') return 'review';
  if (s.kind === 'block') return 'block';
  if (s.kind === 'drill') return 'drill';
  return 'free';
}

/**
 * Submit one answer. In exam mode the response is stored but not graded until the
 * session finishes; otherwise it is graded and recorded immediately.
 */
export function submitAnswer(state: AppState, bank: BankIndex, input: AnswerInput): GradeResult | null {
  const s = state.sessions[input.sessionId];
  const it = bank.byId.get(input.itemId);
  if (!s || !it) return null;
  const prev = s.answers[it.id];
  if (prev?.submitted && !s.exam) return null;
  s.answers[it.id] = {
    response: input.response,
    seconds: Math.round((prev?.seconds || 0) + Math.max(0, input.seconds)),
    submitted: !s.exam,
    confidence: input.confidence ?? prev?.confidence,
    gaveUp: input.gaveUp,
  };
  if (s.exam) return null;
  const g = recordAttempt(state, it, s, input.response, s.answers[it.id].seconds, input.confidence, input.gaveUp, input.date, input.now);
  s.answers[it.id].correct = g.correct;
  s.answers[it.id].score = g.score;
  return g;
}

function recordAttempt(
  state: AppState,
  it: Item,
  s: PracticeSession,
  response: AnswerInput['response'],
  seconds: number,
  confidence: Confidence | undefined,
  gaveUp: boolean | undefined,
  date: string,
  now = new Date(),
): GradeResult {
  const g = gaveUp ? { correct: false, score: 0 } : gradeItem(it, response);
  const first = !state.attempts.some((a) => a.itemId === it.id);
  const a: Attempt = {
    id: uid('a'),
    itemId: it.id,
    subject: it.subject,
    topic: it.topic,
    at: now.toISOString(),
    date,
    mode: attemptMode(s),
    sessionId: s.id,
    blockId: s.blockId,
    correct: g.correct,
    score: g.score,
    response,
    seconds: Math.round(seconds),
    confidence,
    firstTry: first,
    gaveUp: gaveUp || undefined,
  };
  state.attempts.push(a);
  state.progress[it.id] = updateItemProgress(state.progress[it.id], a, it.targetSec);
  const day = ensureDay(state, date);
  day.answered += 1;
  day.correct += g.correct ? 1 : 0;
  return g;
}

/** Change the confidence of a not-yet-submitted answer (exam mode keeps it until grading). */
export function setConfidence(state: AppState, sessionId: string, itemId: string, confidence: Confidence) {
  const s = state.sessions[sessionId];
  if (!s) return;
  const a = s.answers[itemId];
  if (a && a.submitted) return;
  s.answers[itemId] = { response: a?.response ?? null, seconds: a?.seconds ?? 0, submitted: false, confidence };
}

/** Save an in-progress response (not graded) so it survives closing the window. */
export function saveDraft(state: AppState, sessionId: string, itemId: string, response: AnswerInput['response'], seconds: number) {
  const s = state.sessions[sessionId];
  if (!s) return;
  const a = s.answers[itemId];
  if (a?.submitted && !s.exam) return;
  s.answers[itemId] = { ...(a || { submitted: false }), response, seconds: Math.round((a?.seconds || 0) + Math.max(0, seconds)), submitted: false } as PracticeSession['answers'][string];
}

export function addStudyTime(state: AppState, sessionId: string | null, seconds: number, date: string) {
  if (seconds <= 0) return;
  ensureDay(state, date).seconds += seconds;
  if (sessionId && state.sessions[sessionId]) state.sessions[sessionId].elapsedSec += seconds;
}

export interface FinishResult {
  mock?: MockResult;
  answered: number;
  correct: number;
}

/** Finish a session: grade exam-mode answers, record a mock result, close the block. */
export function finishSession(state: AppState, bank: BankIndex, sessionId: string, date: string, now = new Date()): FinishResult {
  const s = state.sessions[sessionId];
  if (!s) return { answered: 0, correct: 0 };
  if (s.finishedAt) return summarize(state, s);
  s.finishedAt = now.toISOString();
  if (s.exam) {
    for (const id of s.itemIds) {
      const it = bank.byId.get(id);
      const ans = s.answers[id];
      if (!it) continue;
      const response = ans?.response ?? null;
      const g = recordAttempt(state, it, s, response, ans?.seconds ?? 0, ans?.confidence, response === null ? true : ans?.gaveUp, date, now);
      s.answers[id] = { response, seconds: ans?.seconds ?? 0, submitted: true, correct: g.correct, score: g.score, confidence: ans?.confidence, gaveUp: response === null };
    }
  }
  const res = summarize(state, s);
  if (s.kind === 'mock' && s.mock) {
    const items = s.itemIds.map((id) => bank.byId.get(id)).filter(Boolean) as Item[];
    // Math 大問 Ⅲ/Ⅳ are a bigger share of the paper than a Ⅰ/Ⅱ 問: weight by target time.
    const weight = (it: Item) => (it.subject === 'math' ? it.targetSec / 660 : 1);
    let wSum = 0;
    let wGot = 0;
    const bySubject: MockResult['bySubject'] = {};
    const wsum: Partial<Record<Subject, number>> = {};
    for (const it of items) {
      const sc = s.answers[it.id]?.score ?? 0;
      wSum += weight(it);
      wGot += weight(it) * sc;
      const b = (bySubject[it.subject] ||= { correct: 0, total: 0, raw: 0, estimate: 0 });
      b.total += 1;
      b.correct += s.answers[it.id]?.correct ? 1 : 0;
      b.raw += weight(it) * sc;
      wsum[it.subject] = (wsum[it.subject] ?? 0) + weight(it);
    }
    for (const [subj, b] of Object.entries(bySubject) as [Subject, NonNullable<MockResult['bySubject']>[Subject]][]) {
      if (!b) continue;
      b.raw = wsum[subj] ? b.raw / wsum[subj]! : 0;
      b.estimate = Math.round(b.raw * (subj === 'math' ? 200 : subj === 'japanese' ? 200 : 100));
    }
    const raw = wSum ? wGot / wSum : 0;
    const mock: MockResult = {
      id: uid('m'),
      kind: s.mock.kind,
      session: s.mock.session,
      date,
      startedAt: s.startedAt,
      finishedAt: s.finishedAt,
      seconds: s.elapsedSec,
      itemIds: s.itemIds,
      answered: res.answered,
      correct: res.correct,
      total: s.itemIds.length,
      raw,
      estimate: mockEstimate(s.mock.kind, raw),
      bySubject,
    };
    state.mocks.push(mock);
    res.mock = mock;
  }
  if (s.blockId) {
    const b = findBlock(state, s.blockId);
    if (b) {
      b.status = 'done';
      b.doneAt = now.toISOString();
      b.result = { answered: res.answered, correct: res.correct, seconds: s.elapsedSec };
    }
  }
  if (state.activeSessionId === s.id) state.activeSessionId = undefined;
  return res;
}

function summarize(state: AppState, s: PracticeSession): FinishResult {
  let answered = 0;
  let correct = 0;
  for (const id of s.itemIds) {
    const a = s.answers[id];
    if (a?.submitted && !a.gaveUp) answered++;
    if (a?.correct) correct++;
  }
  return { answered, correct };
}

export function abandonSession(state: AppState, sessionId: string) {
  const s = state.sessions[sessionId];
  if (!s) return;
  if (state.activeSessionId === sessionId) state.activeSessionId = undefined;
  if (s.blockId) {
    const b = findBlock(state, s.blockId);
    if (b && b.status === 'active' && !Object.values(s.answers).some((a) => a.submitted)) b.status = 'todo';
  }
  if (!Object.values(s.answers).some((a) => a.submitted || a.response !== null)) delete state.sessions[sessionId];
}

export function markBlock(state: AppState, blockId: string, status: PlanBlock['status'], now = new Date()) {
  const b = findBlock(state, blockId);
  if (!b) return;
  b.status = status;
  if (status === 'done') b.doneAt = now.toISOString();
}

export function recordVocab(
  state: AppState,
  input: { vocabId: string; skill: VocabSkill; correct: boolean; response: string; seconds: number; heardAudio?: boolean; date: string; now?: Date },
) {
  const now = input.now || new Date();
  state.vocabAttempts.push({
    id: uid('v'),
    vocabId: input.vocabId,
    skill: input.skill,
    at: now.toISOString(),
    date: input.date,
    correct: input.correct,
    response: input.response,
    seconds: Math.round(input.seconds * 10) / 10,
    heardAudio: input.heardAudio || undefined,
  });
  const cur = state.vocab[input.vocabId] || {};
  cur[input.skill] = updateVocabSkill(cur[input.skill], input.correct, now.toISOString(), input.date);
  state.vocab[input.vocabId] = cur;
  ensureDay(state, input.date).vocab += 1;
}

export function toggleStar(state: AppState, itemId: string) {
  const p = state.progress[itemId];
  if (p) p.starred = !p.starred;
  else state.progress[itemId] = { attempts: 0, correct: 0, lastAt: new Date().toISOString(), lastCorrect: false, lastScore: 0, box: 0, inMistakes: false, starred: true };
}

export function setItemNote(state: AppState, itemId: string, note: string) {
  const p = state.progress[itemId];
  if (p) p.note = note.slice(0, 2000);
}

/** Pull an item out of the mistake book manually ("我已掌握"). */
export function dismissMistake(state: AppState, itemId: string) {
  const p = state.progress[itemId];
  if (p) {
    p.inMistakes = false;
    p.due = undefined;
  }
}

/** Today's word cards: due reviews first (oldest, failed first), then new words by value. */
export function vocabQueue(state: AppState, bank: BankIndex, date: string, newLimit: number): { id: string; skill: VocabSkill }[] {
  const due: { id: string; skill: VocabSkill; key: string }[] = [];
  const fresh: { id: string; skill: VocabSkill; rank: number }[] = [];
  // False friends and kana-only connectors first; then everyday/campus words; then terms.
  const value = (v: (typeof bank.bundle.vocab)[number]) =>
    (v.trapZh ? 0 : 4) + (/^[\u3040-\u30ffー・ ]+$/.test(v.word) ? 0 : 1) + (v.category === 'general' || v.category === 'reading' ? 0 : 2);
  let newWords = 0;
  const candidates = [...bank.bundle.vocab].sort((a, b) => value(a) - value(b));
  for (const v of candidates) {
    const skills = vocabSkills(v);
    const p = state.vocab[v.id];
    if (!p || skills.every((k) => !p[k])) {
      if (newWords < newLimit) {
        newWords++;
        for (const k of skills) fresh.push({ id: v.id, skill: k, rank: newWords });
      }
      continue;
    }
    for (const skill of skills) {
      const sp = p[skill];
      if (!sp) fresh.push({ id: v.id, skill, rank: 0 });
      else if (sp.due <= date) due.push({ id: v.id, skill, key: sp.due + (sp.lastCorrect ? '1' : '0') });
    }
  }
  due.sort((a, b) => a.key.localeCompare(b.key));
  fresh.sort((a, b) => a.rank - b.rank);
  return [...due.slice(0, 80).map(({ id, skill }) => ({ id, skill })), ...fresh.map(({ id, skill }) => ({ id, skill }))];
}

export { mockItems };
