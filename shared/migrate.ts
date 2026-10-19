// Initial state and the one-time import of the v1.4 learning record.
// The v1 file itself is never modified; its raw content is kept under `legacy`.
import type { AppState, JournalEntry, Profile, Settings, VocabAttempt, VocabProgress } from './types.ts';
import { studyDate } from './dates.ts';

export const EXAM_DATE = '2026-11-08';
export const DEFAULT_DAILY_MINUTES = 360;

export function defaultProfile(now: Date): Profile {
  return {
    examDate: EXAM_DATE,
    startDate: studyDate(now),
    targetTotal: 630,
    baseline: { japanese: 295, math: 121, physics: 58, chemistry: 65 },
    targets: { japanese: 325, math: 155, physics: 72, chemistry: 78 },
    dailyMinutes: DEFAULT_DAILY_MINUTES,
    dayMinutes: {},
    background:
      '高考约580分，衡水实验班背景，难题能力尚可；主要是知识遗忘、EJU引导式填空不适应与速度慢。',
    weakTopics: ['phys.wave', 'phys.em', 'math.calc', 'math.trig', 'chem.inorg', 'chem.org', 'ja.listening', 'ja.vocab'],
    mathCourse: 2,
    onboarded: false,
  };
}

export function defaultSettings(): Settings {
  return {
    theme: 'system',
    musicEnabled: false,
    musicTrack: 'music-01',
    musicVolume: 0.22,
    autoNextJapanese: false,
    showZhGloss: false,
    fontScale: 1,
    pronunciationRate: 1,
    coachEnabled: true,
  };
}

export function createInitialState(now: Date): AppState {
  return {
    version: 2,
    revision: 0,
    createdAt: now.toISOString(),
    profile: defaultProfile(now),
    settings: defaultSettings(),
    attempts: [],
    progress: {},
    vocabAttempts: [],
    vocab: {},
    plans: {},
    sessions: {},
    mocks: [],
    days: {},
    journal: [],
  };
}

type V1 = {
  version?: number;
  profile?: Record<string, unknown>;
  attempts?: Array<Record<string, unknown>>;
  mastery?: Record<string, { streak?: number; wrong?: number }>;
  records?: Record<string, { date?: string; note?: string; at?: string }>;
  blockRecords?: Record<string, { date?: string; text?: string; at?: string; blockId?: string }>;
  vocabulary?: {
    attempts?: Array<Record<string, unknown>>;
    observations?: Array<{ id?: string; date?: string; text?: string; createdAt?: string }>;
  };
  timer?: { label?: string; total?: number; remaining?: number };
  preferences?: { volume?: number; track?: string };
};

// Words whose kanji→reading recall was observed in the v1 "recall" block (2026-10-06).
const V1_READ_CORRECT = ['vx140', 'vx064', 'vx086', 'vx217', 'vx141'];
const V1_READ_WRONG = ['vx290', 'vx291'];

/**
 * Convert a v1.4 record. Day-1 vocab answers were made by listening only, so they
 * count as meaning recognition (skill "meaning"), never as reading production.
 */
export function migrateV1(raw: unknown, now: Date): AppState {
  const v1 = (raw || {}) as V1;
  const state = createInitialState(now);
  const today = studyDate(now);
  const p = v1.profile || {};
  const scores = p.scores as Record<string, number> | undefined;
  const targets = p.targets as Record<string, number> | undefined;
  if (scores) Object.assign(state.profile.baseline, scores);
  if (targets) Object.assign(state.profile.targets, targets);
  if (typeof p.target === 'number') state.profile.targetTotal = p.target;
  if (typeof p.examDate === 'string') state.profile.examDate = p.examDate;
  if (typeof v1.preferences?.volume === 'number') state.settings.musicVolume = v1.preferences.volume;
  if (typeof v1.preferences?.track === 'string') state.settings.musicTrack = v1.preferences.track;

  // Vocabulary history (meaning recognition by ear).
  const vocabAttempts: VocabAttempt[] = [];
  for (const a of v1.attempts || []) {
    if (typeof a.questionId !== 'string') continue;
    vocabAttempts.push({
      id: String(a.id || `${a.questionId}-${a.at}`),
      vocabId: a.questionId,
      skill: 'meaning',
      at: String(a.at || now.toISOString()),
      date: String(a.date || today),
      correct: a.correct === true,
      response: String(a.answer ?? ''),
      seconds: Number(a.seconds) || 0,
      heardAudio: true,
      legacy: true,
    });
  }
  for (const a of v1.vocabulary?.attempts || []) {
    if (typeof a.questionId !== 'string') continue;
    vocabAttempts.push({
      id: String(a.id),
      vocabId: a.questionId,
      skill: 'meaning',
      at: String(a.at || now.toISOString()),
      date: String(a.date || today),
      correct: a.correct === true,
      response: String(a.response ?? ''),
      seconds: Number(a.seconds) || 0,
      heardAudio: false,
      legacy: true,
    });
  }
  state.vocabAttempts = vocabAttempts;

  // SRS: everything learned on day 1 is overdue now, so it is due today.
  const vocab: Record<string, VocabProgress> = {};
  for (const a of vocabAttempts) {
    const cur = vocab[a.vocabId] || {};
    const prev = cur.meaning;
    cur.meaning = {
      box: a.correct ? Math.max(1, prev?.box ?? 0) : 0,
      due: today,
      seen: (prev?.seen ?? 0) + 1,
      correct: (prev?.correct ?? 0) + (a.correct ? 1 : 0),
      lastAt: a.at,
      lastCorrect: a.correct,
    };
    vocab[a.vocabId] = cur;
  }
  for (const id of [...V1_READ_CORRECT, ...V1_READ_WRONG]) {
    const ok = V1_READ_CORRECT.includes(id);
    vocab[id] = {
      ...(vocab[id] || {}),
      read: { box: ok ? 1 : 0, due: today, seen: 1, correct: ok ? 1 : 0, lastAt: '2026-10-06T01:43:44.805Z', lastCorrect: ok },
    };
  }
  state.vocab = vocab;

  // Journal: keep the learner's own words.
  const journal: JournalEntry[] = [];
  for (const [key, r] of Object.entries(v1.records || {})) {
    if (r.note) journal.push({ id: `v1-${key}`, date: r.date || today, at: r.at || now.toISOString(), text: r.note, kind: 'legacy' });
  }
  for (const [key, r] of Object.entries(v1.blockRecords || {})) {
    if (r.text) {
      journal.push({
        id: `v1-${key}`,
        date: r.date || today,
        at: r.at || now.toISOString(),
        text: `【v1 ${r.blockId === 'use' ? '造句' : '回忆'}】${r.text}`,
        kind: 'legacy',
      });
    }
  }
  for (const o of v1.vocabulary?.observations || []) {
    if (o.text) journal.push({ id: `v1-${o.id}`, date: o.date || today, at: o.createdAt || now.toISOString(), text: o.text, kind: 'legacy' });
  }
  if (v1.timer?.label && v1.timer.total) {
    journal.push({
      id: 'v1-timer-2026-10-06',
      date: '2026-10-06',
      at: '2026-10-06T03:02:06.025Z',
      text: `【v1 计时】${v1.timer.label} ${Math.round(v1.timer.total / 60)} 分钟，无作答记录。`,
      kind: 'legacy',
    });
  }
  journal.sort((a, b) => a.at.localeCompare(b.at));
  state.journal = journal;

  state.legacy = { importedAt: now.toISOString(), v1: raw };
  return state;
}
