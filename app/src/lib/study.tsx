import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { type Action } from '@shared/actions.ts';
import { indexBank, type BankIndex } from '@shared/bank.ts';
import { studyDate } from '@shared/dates.ts';
import { todayView, weeklyReview } from '@shared/selectors.ts';
import { mastery, predictions, reviewQueue } from '@shared/stats.ts';
import type { AppState, ContentBundle, DayPlan, Item, PlanBlock, PracticeSession } from '@shared/types.ts';
import { t } from '../copy/index.ts';
import { toast } from '../ui/ui.tsx';
import { ApiError, fetchState, saveAction } from './api.ts';
import { go, itemLink, link } from './navigation.ts';
import { onWindowVisibility } from './native.ts';
import { defaultAppearance, writeAppearance, type Appearance } from './preferences.ts';

export interface CoachContext {
  page?: string;
  topic?: string;
  item?: Item;
  response?: unknown;
  mode?: 'ask' | 'variant' | 'weekly';
  locked?: boolean;
}

interface Study {
  state: AppState;
  bank: BankIndex;
  date: string;
  today: ReturnType<typeof todayView>;
  weekly: ReturnType<typeof weeklyReview>;
  mastery: ReturnType<typeof mastery>;
  predictions: ReturnType<typeof predictions>;
  queue: ReturnType<typeof reviewQueue>;
  active?: PracticeSession;
  activeBlock?: PlanBlock;
  paused: boolean;
  seconds: number;
  appearance: Appearance;
  setAppearance: (value: Appearance) => void;
  action: <T = unknown>(action: Action) => Promise<T | undefined>;
  startItems: (ids: string[], kind?: 'free' | 'review' | 'drill') => Promise<void>;
  openSession: (session: PracticeSession) => void;
  startToday: (override?: DayPlan) => Promise<void>;
  completeManual: () => Promise<void>;
  togglePause: () => void;
  flushClock: () => Promise<void>;
  continueGuided: () => Promise<void>;
  isGuided: (session?: PracticeSession) => boolean;
  openCoach: (context?: CoachContext) => void;
  openSearch: () => void;
  openQuickNote: (topic?: string) => void;
}

const Context = createContext<Study | null>(null);
export function useStudy() {
  const value = useContext(Context);
  if (!value) throw new Error('Study provider required');
  return value;
}

export function StudyProvider({ initialState, bundle, initialDate, initialAppearance = defaultAppearance, hash, children, openCoach, openSearch, openQuickNote }: {
  initialState: AppState;
  bundle: ContentBundle;
  initialDate?: string;
  initialAppearance?: Appearance;
  hash: string;
  children: ReactNode;
  openCoach: Study['openCoach'];
  openSearch: Study['openSearch'];
  openQuickNote: Study['openQuickNote'];
}) {
  const [state, setState] = useState(initialState);
  const current = useRef(initialState);
  const revision = useRef(initialState.revision);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const [date, setDate] = useState(() => initialDate ?? studyDate());
  const [appearance, changeAppearance] = useState(initialAppearance);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [nativeVisible, setNativeVisible] = useState(true);
  const guide = useRef('');
  const starting = useRef(false);
  const bank = useMemo(() => indexBank(bundle), [bundle]);

  const sync = useCallback((next: AppState) => {
    if (next.revision < revision.current) return;
    revision.current = next.revision;
    current.current = next;
    setState(next);
  }, []);

  const action = useCallback(<T,>(input: Action): Promise<T | undefined> => {
    const run = async () => {
      try {
        const saved = await saveAction(revision.current, input);
        revision.current = saved.revision;
        if (input.type === 'tick') {
          const active = input.sessionId ? current.current.sessions[input.sessionId] : undefined;
          const day = studyDate();
          sync({
            ...current.current,
            revision: saved.revision,
            days: { ...current.current.days, [day]: saved.result as AppState['days'][string] },
            sessions: active ? {
              ...current.current.sessions,
              [active.id]: { ...active, elapsedSec: active.elapsedSec + input.seconds },
            } : current.current.sessions,
          });
        } else {
          try { sync(await fetchState()); }
          catch { toast(t.common.offlineBanner, 'warn'); }
        }
        return saved.result as T;
      } catch (error) {
        if (error instanceof ApiError && error.state) {
          sync(error.state);
          toast(t.common.staleState, 'warn');
        } else {
          try { sync(await fetchState()); } catch { /* server still unavailable */ }
          toast(t.common.errorTitle, 'bad');
        }
      }
    };
    const value = writes.current.then(run);
    writes.current = value;
    return value;
  }, [sync]);

  useEffect(() => {
    const refresh = () => {
      // Fetch after queued writes, so a window never moves back to an earlier revision.
      void writes.current.then(async () => { try { sync(await fetchState()); } catch { /* retries on focus or interval */ } });
    };
    const timer = setInterval(() => {
      if (!initialDate) setDate(studyDate());
      if (document.visibilityState === 'visible') refresh();
    }, 30_000);
    const remove = onWindowVisibility(visible => {
      setNativeVisible(visible);
      if (visible) {
        if (!initialDate) setDate(studyDate());
        refresh();
      }
    });
    return () => { clearInterval(timer); remove(); };
  }, [initialDate, sync]);

  useEffect(() => {
    try { guide.current = sessionStorage.getItem('eju-v3-guide') ?? ''; } catch { /* storage unavailable */ }
  }, []);

  const today = useMemo(() => todayView(state, bank, date), [state, bank, date]);
  const weekly = useMemo(() => weeklyReview(state, bank, date), [state, bank, date]);
  const topicMastery = useMemo(() => mastery(state, bank, date), [state, bank, date]);
  const forecasts = useMemo(() => predictions(state, bank, date), [state, bank, date]);
  const queue = useMemo(() => reviewQueue(state, bank, date), [state, bank, date]);
  const active = state.activeSessionId ? state.sessions[state.activeSessionId] : undefined;
  const activeBlock = active?.blockId
    ? state.plans[active.blockId.split(':')[0]]?.blocks.find(block => block.id === active.blockId)
    : today.plan.blocks.find(block => block.status === 'active');
  const manual = activeBlock && !active ? activeBlock : undefined;
  const clockKey = active?.id ?? manual?.id ?? '';
  const clock = useRef({ key: '', elapsed: 0, buffered: 0 });
  const flushClock = useCallback(async () => {
    const { key, buffered } = clock.current;
    if (!buffered) return;
    clock.current.buffered = 0;
    const session = current.current.activeSessionId;
    if (session === key && !current.current.sessions[session].sealedAt) {
      await action({ type: 'tick', sessionId: session, seconds: buffered });
    } else if (key === manual?.id && manual.kind !== 'break') {
      await action({ type: 'tick', seconds: buffered });
    }
  }, [action, manual?.id, manual?.kind]);

  const isOnSession = !!active && hash.split('?')[0] === itemLink(active.id);
  const canTick = nativeVisible && !paused && ((isOnSession && !active?.sealedAt) || (!active && !!manual));
  useEffect(() => {
    if (clock.current.key !== clockKey) {
      let elapsed = 0;
      if (manual) {
        try { elapsed = Number(sessionStorage.getItem('eju-v3-clock:' + manual.id)) || 0; } catch { /* storage unavailable */ }
      }
      clock.current = { key: clockKey, elapsed, buffered: 0 };
    }
    setSeconds(active?.elapsedSec ?? clock.current.elapsed);
  }, [clockKey, active?.elapsedSec, manual?.id]);

  useEffect(() => {
    if (!canTick || !clockKey) return;
    let previous = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const increment = Math.floor((now - previous) / 1000);
      if (!increment) return;
      previous += increment * 1000;
      if (document.hidden || increment > 5 || clock.current.key !== clockKey) return;
      const data = clock.current;
      data.elapsed += increment;
      if (manual) {
        try { sessionStorage.setItem('eju-v3-clock:' + manual.id, String(data.elapsed)); } catch { /* storage unavailable */ }
      }
      if (manual?.kind !== 'break') data.buffered += increment;
      setSeconds(active ? (current.current.sessions[active.id]?.elapsedSec ?? 0) + data.buffered : data.elapsed);
      if (data.buffered >= 15) void flushClock();
    }, 300);
    return () => { clearInterval(timer); void flushClock(); };
  }, [canTick, clockKey, active?.id, manual?.id, manual?.kind, flushClock]);

  const openSession = (session: PracticeSession) => {
    setPaused(false);
    go(itemLink(session.id));
  };

  const startItems: Study['startItems'] = async (ids, kind) => {
    if (current.current.activeSessionId) {
      toast(t.common.activeSession, 'warn');
      openSession(current.current.sessions[current.current.activeSessionId]);
      return;
    }
    const unique = [...new Set(ids)];
    if (!unique.length || starting.current) return;
    starting.current = true;
    try {
      if (unique.length > 500) toast(t.practice.batch(500));
      const session = await action<PracticeSession>({ type: 'startPractice', itemIds: unique.slice(0, 500), kind });
      if (session) openSession(session);
    } finally { starting.current = false; }
  };

  const startToday = async (override?: DayPlan) => {
    if (starting.current) return;
    const view = todayView(current.current, bank, date);
    if (current.current.activeSessionId) {
      const session = current.current.sessions[current.current.activeSessionId];
      if (session.blockId?.startsWith(date + ':')) setGuide(date);
      openSession(session);
      return;
    }
    const block = (override ?? view.plan).blocks.find(b => b.status === 'active') ??
      (override ?? view.plan).blocks.find(b => b.status === 'todo');
    if (!block) return;
    setGuide(date);
    setPaused(false);
    if (block.status === 'active') { go(link('today')); return; }
    starting.current = true;
    try {
      const result = await action<PlanBlock | PracticeSession>({ type: 'startBlock', date, blockId: block.id });
      if (result && 'answers' in result) openSession(result);
      else if (result) go(link('today'));
    } finally { starting.current = false; }
  };

  function setGuide(value: string) {
    guide.current = value;
    try { sessionStorage.setItem('eju-v3-guide', value); } catch { /* storage unavailable */ }
  }

  async function completeManual() {
    if (!manual || starting.current) return;
    starting.current = true;
    let result;
    try {
      await flushClock();
      result = await action({ type: 'completeBlock', date, blockId: manual.id });
    } finally { starting.current = false; }
    if (result) await startToday();
  }

  const setAppearance = (value: Appearance) => { changeAppearance(value); writeAppearance(value); };
  const togglePause = () => {
    if (!paused) void flushClock();
    setPaused(value => !value);
  };

  return <Context.Provider value={{
    state, bank, date, today, weekly, mastery: topicMastery, predictions: forecasts, queue, active, activeBlock, paused,
    seconds, appearance, setAppearance, action, startItems, openSession, startToday, completeManual, togglePause, flushClock,
    continueGuided: () => startToday(),
    isGuided: session => Boolean(session?.blockId?.startsWith(date + ':') && guide.current === date),
    openCoach, openSearch, openQuickNote,
  }}>{children}</Context.Provider>;
}
