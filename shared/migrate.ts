import {
  isSubject,
  SCHOOLS,
  DEFAULT_NEW_CARDS_PER_DAY,
  type AppState,
  type Profile,
  type Attempt,
  type ItemProgress,
  type MockResult,
  type PracticeSession,
} from './types.ts';
import type { BankIndex } from './bank.ts';

export const DEFAULT_COACH_MODEL = 'gpt-6.2-sol';
export const DEFAULT_COACH_EFFORT = 'medium';

/** Run once, so a later explicit selection of Astra survives a restart. */
export function migrateCoachDefaults(state: AppState): boolean {
  if (state.coachDefaultsVersion === 2) return false;
  if (!state.settings.coachModel || state.settings.coachModel === 'gpt-6.2-astra')
    state.settings.coachModel = DEFAULT_COACH_MODEL;
  state.settings.coachEffort ??= DEFAULT_COACH_EFFORT;
  state.coachDefaultsVersion = 2;
  return true;
}

export function defaultProfile(): Profile {
  return {
    startDate: '2026-11-19',
    examDate: '2027-06-20',
    mathCourse: 2,
    onboarded: false,
    baseline: { math: 132, physics: 54, chemistry: 66 },
    targets: { math: 190, physics: 90, chemistry: 90 },
    milestones: [
      { date: '2026-12-31', targets: { math: 145, physics: 62, chemistry: 72 } },
      { date: '2027-02-28', targets: { math: 160, physics: 72, chemistry: 78 } },
      { date: '2027-04-30', targets: { math: 178, physics: 82, chemistry: 85 } },
      { date: '2027-06-19', targets: { math: 190, physics: 90, chemistry: 90 } },
    ],
    schools: [...SCHOOLS],
    dailyMinutes: 120,
    weekdays: [1, 2, 4, 5, 6],
    weakTopics: [
      'phys.em.induction',
      'phys.em.capacitor',
      'phys.mech.circular',
      'phys.mech.spring',
      'phys.mech.pendulum',
      'chem.inorg',
      'chem.org.basics',
      'chem.org.aliphatic',
      'chem.org.aromatic',
      'chem.react.enthalpy',
      'math.seq',
      'math.prob.count',
      'math.explog',
      'math.calc.int',
    ],
    strongTopics: ['phys.em.circuit', 'phys.mech.kinematics', 'math.vec', 'math.quad', 'math.trig'],
    strongEarlyChemistry: true,
  };
}
export function createInitialState(now = new Date()): AppState {
  return {
    version: 3,
    coachDefaultsVersion: 2,
    revision: 0,
    createdAt: now.toISOString(),
    profile: defaultProfile(),
    settings: {
      theme: 'system',
      musicEnabled: false,
      musicTrack: 'music-01',
      musicVolume: 0.22,
      fontScale: 1,
      coachEnabled: true,
      coachModel: DEFAULT_COACH_MODEL,
      coachEffort: DEFAULT_COACH_EFFORT,
      newCardsPerDay: DEFAULT_NEW_CARDS_PER_DAY,
    },
    calendar: { overrides: {}, moves: [], restWeeks: [] },
    attempts: [],
    progress: {},
    plans: {},
    sessions: {},
    mocks: [],
    days: {},
    variants: {},
    notes: {},
  };
}

// Raw v2 is archived in full (including v1). Only attributable STEM activity enters v3 statistics.
export function migrateV2(raw: unknown, bank: BankIndex, now = new Date()): AppState {
  const old = raw as {
    version: number;
    attempts: Attempt[];
    progress: Record<string, ItemProgress>;
    mocks: MockResult[];
    sessions?: Record<string, PracticeSession>;
  };
  if (old?.version !== 2 || !Array.isArray(old.attempts) || !old.progress || !Array.isArray(old.mocks))
    throw new Error('invalid v2 state');
  const state = createInitialState(now);
  state.legacy = { importedAt: now.toISOString(), v2: structuredClone(raw) };
  state.attempts = structuredClone(
    old.attempts.filter(
      (a) => isSubject(a.subject) && !a.topic.startsWith('ja.') && !a.itemId.startsWith('recall-terms-'),
    ),
  );
  const stemIds = new Set(state.attempts.map((a) => a.itemId));
  const knownStem = (id: string) =>
    stemIds.has(id) || bank.byId.has(id) || /^(?:\d{4}_\d-|recall-)(?:math|phy|phys|chem)-/.test(id);
  for (const session of Object.values(old.sessions ?? {})) {
    if (!isSubject(session.subject) && session.subject !== 'mixed') continue;
    if (isSubject(session.subject)) {
      for (const id of session.itemIds) if (!/(?:^recall-terms-|[-.]ja[-.])/.test(id)) stemIds.add(id);
    }
    const ids = session.itemIds.filter(knownStem);
    if (!ids.length) continue;
    const answers = structuredClone(
      Object.fromEntries(Object.entries(session.answers).filter(([id]) => ids.includes(id))),
    );
    state.sessions[session.id] = {
      ...structuredClone(session),
      imported: true,
      itemIds: ids,
      answers,
      index: Math.max(0, ids.indexOf(session.itemIds[session.index])),
      elapsedSec:
        ids.length === session.itemIds.length
          ? session.elapsedSec
          : Object.values(answers).reduce((n, a) => n + a.seconds, 0),
    };
    delete state.sessions[session.id].blockId;
  }
  for (const [id, p] of Object.entries(old.progress)) {
    if (knownStem(id)) state.progress[id] = { ...p };
  }
  state.mocks = structuredClone(old.mocks.filter((m) => m.kind === 'math' || m.kind === 'science'));
  for (const a of state.attempts) {
    const day = (state.days[a.date] ??= { answered: 0, correct: 0, seconds: 0 });
    day.answered++;
    day.correct += Number(a.correct);
    day.seconds += a.seconds;
  }
  return state;
}
