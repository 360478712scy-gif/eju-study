// The practice player: one item at a time, question on the left, answer on the right.
// Practice sessions grade each answer immediately; exam sessions (mocks, timed sets)
// keep everything silent until 交卷.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppState, Confidence, Item, ItemProgress, PracticeSession, SessionAnswer } from '@shared/types.ts';
import type { BankIndex } from '@shared/bank.ts';
import { abandonSession, addStudyTime, finishSession, lockedGroups, saveDraft, setConfidence, submitAnswer } from '@shared/actions.ts';
import { blankGroups, gradeItem, isAnswered } from '@shared/grading.ts';
import { flush, getSnapshot, update, useApp } from '../../lib/store.ts';
import { addNavGuard, navigate } from '../../lib/router.ts';
import { onWindowVisibility } from '../../lib/native.ts';
import { stopSpeech } from '../../lib/audio.ts';
import { Button, Kbd, isModalOpen, toast, useConfirm } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import { RichText } from '../../components/RichText.tsx';
import { QuestionStem, type StemMarks } from '../../components/question/QuestionStem.tsx';
import { cx } from '../../lib/format.ts';
import { StudyClock } from './clock.ts';
import { isFocusedControl, isTextField, markKey } from './hotkeys.ts';
import { IdlePill, TopBar, type StripCell } from './TopBar.tsx';
import { ChoicePad } from './ChoicePad.tsx';
import { MarkSheet } from './MarkSheet.tsx';
import { AudioPanel } from './AudioPanel.tsx';
import { CoachCard } from './CoachCard.tsx';
import { NoteBox } from './NoteBox.tsx';
import { ConfidencePicker, ExamSheet, ExplanationCard, ItemHeader, ListeningCaption, ListeningTitle, ResultBanner, SlowNudge, nextConfidence, revealAnswer, stemLayout } from './parts.tsx';

type Resp = SessionAnswer['response'];
type Mutate = (d: AppState, bank: BankIndex, today: string) => void;

/** Set while leaving a session that is about to be removed, so the page does not flash "not found". */
export const leaving = { id: null as string | null };

const DRAFT_SAVE_MS = 1500;
const FLUSH_EVERY = 10;

function marksOf(r: Resp): Record<string, string> {
  return r && typeof r === 'object' ? r : {};
}

type Locks = Record<string, Record<string, string>>;

/**
 * Math re-test (review sessions, incl. a mock's correction): box groups that were right last time
 * stay filled and locked, so only the rest is redone. A last attempt that was given up, or one
 * where everything was already right (a guess), is redone in full.
 */
function initialLocks(session: PracticeSession, items: Item[]): Locks {
  if (session.kind !== 'review') return {};
  const { state, bank } = getSnapshot();
  if (!state || !bank) return {};
  const out: Locks = {};
  for (const it of items) {
    if (it.format !== 'blanks' || (!session.exam && session.answers[it.id]?.submitted)) continue;
    let gaveUp = false;
    for (let i = state.attempts.length - 1; i >= 0; i--) {
      if (state.attempts[i].itemId === it.id) {
        gaveUp = !!state.attempts[i].gaveUp;
        break;
      }
    }
    if (gaveUp) continue;
    const l = lockedGroups(state, bank, it.id);
    const n = Object.keys(l).length;
    if (n > 0 && n < blankGroups(it).join('').length) out[it.id] = l;
  }
  return out;
}

function explanationDefault(a: SessionAnswer | undefined): boolean {
  return !!a && (!a.correct || !!a.gaveUp || (!!a.confidence && a.confidence !== 'sure'));
}

/** Buttons that should not keep focus after a click (else Enter presses them again). */
const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();

/** 专注模式 (⇧⌘F): hides the strip, timers, item meta and hints. Kept for the whole app run. */
let zenPref = false;

export function Player({ session, items }: { session: PracticeSession; items: Item[] }) {
  const settings = useApp((s) => s.state!.settings);
  const progressMap = useApp((s) => s.state!.progress);
  const today = useApp((s) => s.today);
  const sid = session.id;
  const exam = session.exam;
  const N = items.length;
  const { ask, node: confirmNode } = useConfirm();

  const [clock] = useState(() => new StudyClock(!exam));
  const [locks] = useState<Locks>(() => initialLocks(session, items));
  const [index, setIndex] = useState(() => Math.max(0, Math.min(N - 1, session.index || 0)));
  const item = items[index];
  const ans: SessionAnswer | undefined = session.answers[item.id];
  const graded = !exam && !!ans?.submitted;
  const canEdit = !graded;

  // Local responses / confidence (mirrored in refs so callbacks always see the latest).
  const [drafts, setDraftsState] = useState<Record<string, Resp>>(() => {
    const o: Record<string, Resp> = {};
    for (const [id, a] of Object.entries(session.answers)) if (exam || !a.submitted) o[id] = a.response;
    for (const [id, l] of Object.entries(locks)) o[id] = { ...marksOf(o[id] ?? null), ...l };
    return o;
  });
  const [confs, setConfsState] = useState<Record<string, Confidence>>(() => {
    const o: Record<string, Confidence> = {};
    for (const [id, a] of Object.entries(session.answers)) if (a.confidence) o[id] = a.confidence;
    return o;
  });
  const draftsRef = useRef(drafts);
  const confsRef = useRef(confs);
  const dirty = useRef(new Set<string>());
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishing = useRef(false);
  /** Set when the learner leaves on purpose (back arrow), so the exam nav guard lets it through. */
  const leavingOnPurpose = useRef(false);
  /** Progress just before each answer was graded (to tell when an item left the mistake book). */
  const before = useRef<Record<string, ItemProgress | null>>({});
  const curId = useRef(item.id);
  curId.current = item.id;

  const response: Resp = graded ? ans!.response : (drafts[item.id] ?? null);
  const confidence: Confidence = graded ? (ans?.confidence ?? 'sure') : (confs[item.id] ?? 'sure');

  const [exOpen, setExOpen] = useState<Record<string, boolean>>({});
  const [autoNext, setAutoNext] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [skipped, setSkipped] = useState<Record<string, true>>({});
  const [gloss, setGloss] = useState(settings.showZhGloss);
  const played = useRef(new Set<string>());
  const [, bumpPlayed] = useState(0);
  const audioToggle = useRef<(() => void) | null>(null);
  const coachFocus = useRef<(() => void) | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const sideRef = useRef<HTMLDivElement>(null);
  const [zen, setZen] = useState(zenPref);

  // ── Derived ──
  /** Something of the learner's own is filled in (locked cells don't count). */
  const done = (it: Item, r: Resp): boolean => {
    const l = locks[it.id];
    if (!l) return isAnswered(it, r);
    const v = marksOf(r);
    return Object.keys(it.blanks ?? {}).some((k) => !(k in l) && (v[k] || '').trim() !== '');
  };
  /** Fully answered: a choice is picked, or every open mark-sheet cell is filled. */
  const complete = (it: Item, r: Resp): boolean => {
    if (it.format === 'choice') return typeof r === 'number';
    const v = marksOf(r);
    return Object.keys(it.blanks ?? {}).every((k) => (v[k] || '').trim() !== '');
  };
  /** Exam: index of the next question (after the current one, wrapping) that still needs answers. */
  const nextOpen = (): number | null => {
    for (let k = 1; k < N; k++) {
      const j = (index + k) % N;
      const it = items[j];
      if (!complete(it, draftsRef.current[it.id] ?? session.answers[it.id]?.response ?? null)) return j;
    }
    return null;
  };

  const frontier = useMemo(() => {
    if (exam) return N - 1;
    const i = items.findIndex((it) => !session.answers[it.id]?.submitted);
    return i < 0 ? N - 1 : i;
  }, [exam, items, session.answers, N]);
  const allGraded = !exam && items.every((it) => session.answers[it.id]?.submitted);

  const cells: StripCell[] = useMemo(
    () =>
      items.map((it, i) => {
        const a = session.answers[it.id];
        if (exam) {
          const r = drafts[it.id] ?? a?.response ?? null;
          const c = confs[it.id];
          return { state: done(it, r) ? 'answered' : 'todo', reachable: true, flag: c && c !== 'sure' ? c : undefined };
        }
        if (a?.submitted) return { state: a.correct ? 'right' : 'wrong', reachable: true };
        return { state: 'todo', reachable: i <= frontier };
      }),
    [items, session.answers, drafts, confs, exam, frontier],
  );

  const layout = useMemo(() => stemLayout(item), [item]);
  const split = layout.split;
  const groups = useMemo(() => (item.format === 'blanks' ? blankGroups(item) : []), [item]);
  const letters = useMemo(() => groups.flatMap((g) => [...g]), [groups]);
  const lock = locks[item.id];
  /** Letters the learner fills (everything except the locked ones). */
  const openLetters = useMemo(() => (lock ? letters.filter((l) => !(l in lock)) : letters), [letters, lock]);
  const lockedNames = useMemo(() => (lock ? Object.fromEntries(groups.filter((g) => [...g].every((l) => l in lock)).map((g) => [g, true])) : undefined), [groups, lock]);
  const grade = useMemo(() => (graded ? gradeItem(item, ans!.response) : null), [graded, item, ans]);
  const groupPos = useMemo(() => {
    if (!item.group) return undefined;
    const same = items.filter((it) => it.group === item.group);
    return { n: same.indexOf(item) + 1, of: same.length };
  }, [item, items]);

  // Mark-sheet cursor, keyed by item so it resets without an effect.
  const [cursor, setCursor] = useState<{ id: string; letter: string | null }>({ id: '', letter: null });
  const values = marksOf(response);
  const activeLetter = cursor.id === item.id ? cursor.letter : canEdit ? (openLetters.find((l) => !values[l]) ?? openLetters[0] ?? null) : null;
  const activeGroup = activeLetter ? (groups.find((g) => g.includes(activeLetter)) ?? null) : null;

  // ── Persistence ──
  const persist = (opts: { saveNow?: boolean; mutate?: Mutate; periodic?: boolean } = {}) => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = null;
    // Saves triggered by the learner confirm the time since their last activity; the periodic one does not.
    if (!opts.periodic) clock.commit();
    const cur = getSnapshot().state?.sessions[sid];
    if (!cur || cur.finishedAt) {
      dirty.current.clear();
      return;
    }
    const study = clock.takeStudy();
    const secs = clock.takeItem();
    const id0 = curId.current;
    const ids = new Set(dirty.current);
    if (secs > 0) ids.add(id0);
    dirty.current.clear();
    if (!study && !ids.size && !opts.mutate) return;
    update(
      (d, bank, day) => {
        const s = d.sessions[sid];
        if (!s || s.finishedAt) return;
        if (study) addStudyTime(d, sid, study, day);
        for (const id of ids) {
          const a = s.answers[id];
          if (!s.exam && a?.submitted) continue;
          const r = draftsRef.current[id] ?? a?.response ?? null;
          const sec = id === id0 ? secs : 0;
          const it = bank.byId.get(id);
          if (s.exam && it && done(it, r)) submitAnswer(d, bank, { sessionId: sid, itemId: id, response: r, seconds: sec, confidence: confsRef.current[id], date: day });
          // A mark sheet typed and then fully erased is no answer at all.
          else saveDraft(d, sid, id, it && !isAnswered(it, r) ? null : r, sec);
        }
        opts.mutate?.(d, bank, day);
      },
      { saveNow: opts.saveNow },
    );
  };

  const setDraft = (id: string, r: Resp, commitNow = false) => {
    if (locks[id]) r = { ...marksOf(r), ...locks[id] };
    draftsRef.current = { ...draftsRef.current, [id]: r };
    setDraftsState(draftsRef.current);
    dirty.current.add(id);
    if (commitNow) persist();
    else {
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => api.current.persist(), DRAFT_SAVE_MS);
    }
  };

  const setConf = (c: Confidence) => {
    if (!canEdit) return;
    confsRef.current = { ...confsRef.current, [item.id]: c };
    setConfsState(confsRef.current);
    if (exam) persist({ mutate: (d) => setConfidence(d, sid, item.id, c) });
  };

  const cancelAutoNext = () => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = null;
    setAutoNext(false);
  };

  // ── Navigation ──
  const goTo = (i: number) => {
    if (i < 0 || i >= N || i === index) return;
    if (!exam && i > frontier) return;
    cancelAutoNext();
    stopSpeech();
    persist({
      mutate: (d) => {
        const s = d.sessions[sid];
        if (s && !s.finishedAt) s.index = i;
      },
    });
    setIndex(i);
  };

  const finish = (reason?: 'timeup') => {
    if (finishing.current) return;
    finishing.current = true;
    cancelAutoNext();
    stopSpeech();
    persist({ saveNow: true, mutate: (d, bank, day) => void finishSession(d, bank, sid, day) });
    clock.stop();
    if (reason === 'timeup') toast('时间到，已自动交卷', 'warning', 4000);
  };

  /** Exam: indexes of questions with nothing filled in yet. */
  const unanswered = (): number[] => {
    const out: number[] = [];
    items.forEach((it, i) => {
      if (!done(it, draftsRef.current[it.id] ?? session.answers[it.id]?.response ?? null)) out.push(i);
    });
    return out;
  };

  const confirmSubmitExam = async () => {
    setSheetOpen(false);
    const left = unanswered().length;
    const isMock = session.kind === 'mock';
    const body = !left ? (
      '全部作答完毕，交卷后立刻看到成绩和每题解析。'
    ) : (
      <div className="pl-confirm-body">
        <span>还有 {left} 题没作答。{isMock ? '交卷后没作答的按答错计算。' : '没做的题不进错题本，之后还会出现。'}</span>
        {left * 2 > N && (
          <span className="pl-confirm-warn">
            <Icon name="alert" size={14} />
            {isMock ? '超过一半没作答，这次的预测分会明显偏低。' : '超过一半没作答，这组的得分会明显偏低。'}
          </span>
        )}
      </div>
    );
    // Something still empty: an extra Enter must not hand in the paper.
    const ok = await ask('现在交卷？', { body, ok: '交卷', cancel: '继续作答', focus: left ? 'cancel' : 'ok' });
    if (ok) api.current.finish();
  };

  const confirmFinishEarly = async () => {
    const left = items.filter((it) => !session.answers[it.id]?.submitted).length;
    if (left === N) return exit();
    if (!left) return finish();
    const ok = await ask('结束这一组？', { body: `还有 ${left} 题没做。结束后会显示这组的小结，没做的题不算错。`, ok: '结束' });
    if (ok) finish();
  };

  const next = () => {
    if (exam) {
      if (index < N - 1) return goTo(index + 1);
      // Last question: go back to what is still empty before offering to hand in.
      const left = unanswered();
      const j = left.find((i) => i !== index);
      if (j === undefined) return void confirmSubmitExam();
      goTo(j);
      toast(`还有 ${left.length} 题没作答，先回到第 ${j + 1} 题`);
      return;
    }
    if (!graded) return;
    if (index < N - 1) goTo(index + 1);
    else if (allGraded) finish();
    else goTo(frontier);
  };

  const submit = (opts: { gaveUp?: boolean; resp?: Resp; force?: boolean } = {}) => {
    if (exam || graded || finishing.current) return;
    const r = opts.resp !== undefined ? opts.resp : (draftsRef.current[item.id] ?? null);
    if (!opts.gaveUp && !done(item, r)) return;
    if (!opts.gaveUp && !opts.force) {
      const empty = emptyCells();
      if (empty.length) return void confirmIncomplete(empty);
    }
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = null;
    dirty.current.delete(item.id);
    clock.commit();
    const study = clock.takeStudy();
    const secs = clock.takeItem();
    clock.setCounting(false);
    const conf = confsRef.current[item.id] ?? 'sure';
    before.current[item.id] = getSnapshot().state?.progress[item.id] ?? null;
    const g = update(
      (d, bank, day) => {
        for (const id of dirty.current) {
          const s = d.sessions[sid];
          if (s && !s.answers[id]?.submitted) saveDraft(d, sid, id, draftsRef.current[id] ?? null, 0);
        }
        dirty.current.clear();
        if (study) addStudyTime(d, sid, study, day);
        return submitAnswer(d, bank, { sessionId: sid, itemId: item.id, response: r, seconds: secs, confidence: conf, gaveUp: opts.gaveUp, date: day });
      },
      { saveNow: true },
    );
    const ok = !!g?.correct && !opts.gaveUp;
    const openEx = !ok || conf !== 'sure';
    setExOpen((m) => ({ ...m, [item.id]: openEx }));
    if (openEx) setTimeout(() => revealExplanation(), 80);
    if (ok && settings.autoNextJapanese && item.subject === 'japanese' && item.format === 'choice' && index < N - 1) {
      setAutoNext(true);
      autoTimer.current = setTimeout(() => {
        autoTimer.current = null;
        setAutoNext(false);
        api.current.goTo(index + 1);
      }, 800);
    }
  };

  /** Mark sheet: open cells of the current item that are still empty. */
  const emptyCells = (): string[] => {
    if (item.format !== 'blanks') return [];
    const v = marksOf(draftsRef.current[item.id] ?? null);
    return openLetters.filter((l) => !(v[l] || '').trim());
  };

  const confirmIncomplete = async (empty: string[]) => {
    const id = item.id;
    const ok = await ask(`还有 ${empty.length} 格没填`, { body: '未填的按错算。现在提交？', ok: '提交', cancel: '继续填', focus: 'cancel' });
    if (curId.current !== id) return;
    if (ok) api.current.submit({ force: true });
    else setCursor({ id, letter: empty[0] });
  };

  /** Enter on a half-filled sheet: first take the cursor to the next empty cell. */
  const jumpToEmpty = (): boolean => {
    const empty = emptyCells();
    if (!empty.length || (activeLetter && empty.includes(activeLetter))) return false;
    const from = activeLetter ? openLetters.indexOf(activeLetter) : -1;
    const nextEmpty = [...openLetters.slice(from + 1), ...openLetters.slice(0, from + 1)].find((l) => empty.includes(l));
    if (!nextEmpty) return false;
    setCursor({ id: item.id, letter: nextEmpty });
    return true;
  };

  const exit = () => {
    cancelAutoNext();
    stopSpeech();
    persist({ saveNow: true });
    const { state: st, bank } = getSnapshot();
    const s = st?.sessions[sid];
    const touched = !!s && Object.entries(s.answers).some(([id, a]) => {
      const it = bank?.byId.get(id);
      return a.submitted || (it ? isAnswered(it, a.response) : a.response !== null);
    });
    leaving.id = sid;
    leavingOnPurpose.current = true;
    navigate('/');
    if (!touched) update((d) => abandonSession(d, sid));
    else toast('进度已保存，随时可以接着做', 'success');
  };

  // ── Answer input ──
  const select = (i: number) => {
    if (!canEdit || item.format !== 'choice' || !item.options || i >= item.options.length) return;
    cancelAutoNext();
    setDraft(item.id, i, exam);
  };

  /** The cell being filled: the active letter if it is open, else the first open one. */
  const curLetter = (): string | null => (activeLetter && openLetters.includes(activeLetter) ? activeLetter : (openLetters[0] ?? null));

  const mark = (ch: string) => {
    if (!canEdit || item.format !== 'blanks') return;
    const L = curLetter();
    if (!L) return;
    setDraft(item.id, { ...marksOf(draftsRef.current[item.id] ?? null), [L]: ch });
    const i = openLetters.indexOf(L);
    setCursor({ id: item.id, letter: openLetters[Math.min(i + 1, openLetters.length - 1)] });
  };

  const erase = () => {
    if (!canEdit || item.format !== 'blanks') return;
    const L = curLetter();
    if (!L) return;
    const cur = { ...marksOf(draftsRef.current[item.id] ?? null) };
    let target = L;
    if (!cur[L]) {
      const i = openLetters.indexOf(L);
      if (i > 0) target = openLetters[i - 1];
    }
    delete cur[target];
    setDraft(item.id, cur);
    setCursor({ id: item.id, letter: target });
  };

  const moveCursor = (delta: number) => {
    if (!openLetters.length) return;
    const i = activeLetter ? openLetters.indexOf(activeLetter) : -1;
    setCursor({ id: item.id, letter: openLetters[Math.max(0, Math.min(openLetters.length - 1, i + delta))] });
  };

  const focusGroup = (g: string) => {
    if (!canEdit) return;
    const open = [...g].filter((l) => openLetters.includes(l));
    if (!open.length) return;
    setCursor({ id: item.id, letter: open.find((l) => !values[l]) ?? open[0] });
  };

  /** Exam: leave a slow question for later — go to the next one still unanswered. */
  const skipAhead = () => {
    const j = nextOpen();
    if (j === null) return;
    setSkipped((m) => ({ ...m, [item.id]: true }));
    goTo(j);
  };

  /** Bring a freshly opened explanation into view without hiding the whole question. */
  const revealExplanation = () => {
    const main = mainRef.current;
    const card = main?.querySelector('.pl-excard');
    if (!main || !card) return;
    const top = card.getBoundingClientRect().top - main.getBoundingClientRect().top;
    if (top > main.clientHeight * 0.72) main.scrollTo({ top: main.scrollTop + top - main.clientHeight * 0.32, behavior: 'smooth' });
  };

  const toggleZen = () => {
    zenPref = !zen;
    setZen(zenPref);
    toast(zenPref ? '专注模式：隐藏了进度条、计时和提示 · ⇧⌘F 恢复' : '已退出专注模式');
  };

  // Latest callbacks for timers / listeners bound once.
  const api = useRef({ persist, goTo, finish, submit, ask, toggleZen });
  api.current = { persist, goTo, finish, submit, ask, toggleZen };

  // ── Keyboard ──
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (isModalOpen() || isTextField(e.target)) return;
    const k = e.key;
    if (item.format === 'blanks' && canEdit) {
      const ch = markKey(e);
      if (ch !== null) {
        e.preventDefault();
        if (!e.repeat) mark(ch);
        return;
      }
      if (k === 'Backspace' || k === 'Delete') {
        e.preventDefault();
        erase();
        return;
      }
      if (k === 'ArrowUp' || k === 'ArrowDown') {
        e.preventDefault();
        moveCursor(k === 'ArrowUp' ? -1 : 1);
        return;
      }
    }
    if (e.repeat && k !== 'ArrowLeft' && k !== 'ArrowRight') return;
    if (item.format === 'choice' && /^[1-9]$/.test(k)) {
      if (canEdit) {
        e.preventDefault();
        select(Number(k) - 1);
      }
      return;
    }
    switch (k) {
      case 'Enter':
        if (isFocusedControl(e.target)) return;
        e.preventDefault();
        if (exam || graded) next();
        else if (!jumpToEmpty()) submit();
        return;
      case 'ArrowLeft':
        e.preventDefault();
        goTo(index - 1);
        return;
      case 'ArrowRight':
        e.preventDefault();
        if (exam || graded) goTo(index + 1);
        return;
      case 'f':
      case 'F':
        if (canEdit) {
          e.preventDefault();
          setConf(nextConfidence(confidence));
        }
        return;
      case 'e':
      case 'E':
        if (graded) {
          e.preventDefault();
          setExOpen((m) => ({ ...m, [item.id]: !(m[item.id] ?? explanationDefault(ans)) }));
        }
        return;
      case ' ':
        if (item.audio && !isFocusedControl(e.target)) {
          e.preventDefault();
          audioToggle.current?.();
        }
        return;
    }
  };
  const keyRef = useRef(onKey);
  keyRef.current = onKey;

  // ── Effects ──
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // Foreground clock: tick, periodic save, exam countdown.
  useEffect(() => {
    let n = 0;
    const t = setInterval(() => {
      clock.tick();
      n++;
      if (exam && session.timeLimitSec) {
        const s = getSnapshot().state?.sessions[sid];
        if (s && !s.finishedAt && s.elapsedSec + clock.pendingStudy() >= session.timeLimitSec) {
          api.current.finish('timeup');
          return;
        }
      }
      if (n % FLUSH_EVERY === 0) api.current.persist({ periodic: true });
    }, 1000);
    return () => clearInterval(t);
  }, [clock, exam, sid, session.timeLimitSec]);

  useEffect(
    () =>
      onWindowVisibility((v) => {
        clock.setVisible(v);
        if (!v) api.current.persist({ saveNow: true });
      }),
    [clock],
  );

  useEffect(() => {
    let last = 0;
    const on = () => {
      const now = Date.now();
      if (now - last > 1000) {
        last = now;
        clock.activity();
      }
    };
    const evs = ['keydown', 'pointerdown', 'pointermove', 'wheel'] as const;
    for (const ev of evs) window.addEventListener(ev, on, { passive: true, capture: true });
    return () => {
      for (const ev of evs) window.removeEventListener(ev, on, { capture: true });
    };
  }, [clock]);

  useEffect(() => {
    const h = () => {
      api.current.persist();
      void flush(true);
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  // ⌘1–4 / menu navigation away from a running exam: confirm, then pause (the clock only runs here).
  useEffect(() => {
    if (!exam) return;
    let asking = false;
    const off = addNavGuard((to) => {
      if (finishing.current || leavingOnPurpose.current || to === `/session/${sid}`) return true;
      if (!asking) {
        asking = true;
        void api.current
          .ask(session.kind === 'mock' ? '离开这场模考？' : '离开限时练习？', {
            body: '离开会暂停计时，进度保留，回到今日页可以接着做。',
            ok: '离开',
            cancel: '继续作答',
            focus: 'cancel',
          })
          .then((ok) => {
            asking = false;
            if (!ok) return;
            stopSpeech();
            api.current.persist({ saveNow: true });
            navigate(to, { force: true });
            toast('已暂停计时，进度已保存', 'success');
          });
      }
      return false;
    });
    return () => void off();
  }, [exam, sid, session.kind]);

  // 专注模式 from the menu / ⇧⌘F.
  useEffect(() => {
    const h = () => api.current.toggleZen();
    window.addEventListener('eju-toggle-focus', h);
    return () => window.removeEventListener('eju-toggle-focus', h);
  }, []);

  useEffect(() => {
    if (getSnapshot().state?.activeSessionId !== sid) {
      update((d) => {
        if (d.sessions[sid] && !d.sessions[sid].finishedAt) d.activeSessionId = sid;
      });
    }
    return () => {
      if (autoTimer.current) clearTimeout(autoTimer.current);
      api.current.persist();
      stopSpeech();
    };
  }, [sid]);

  // New item: restart its clock; keep the scroll when the passage stays the same.
  const prevItem = useRef(item);
  useLayoutEffect(() => {
    clock.setItem(exam || !session.answers[item.id]?.submitted);
    const prev = prevItem.current;
    prevItem.current = item;
    if (prev !== item && !(item.group && prev.group === item.group)) mainRef.current?.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  // After grading, keep the right answer in view above the result banner (the side panel is short on small windows).
  useLayoutEffect(() => {
    if (graded) revealAnswer(sideRef.current);
  }, [graded, item.id]);

  // ── Render ──
  const marks: StemMarks | undefined =
    item.format === 'blanks'
      ? {
          values,
          active: canEdit ? activeGroup : null,
          results: grade?.groups ? Object.fromEntries(grade.groups.map((g) => [g.group, g.correct])) : undefined,
          locked: lockedNames,
          onBoxClick: canEdit ? focusGroup : undefined,
        }
      : undefined;

  const listeningHidden = item.section === 'listening' && !graded;
  const heroAudio = item.section === 'listening' && !!item.audio && !item.figures?.length;
  const answered = done(item, response);
  const nudge = exam && canEdit && !complete(item, response) && !skipped[item.id] && item.section !== 'listening' && item.section !== 'listening-reading' && nextOpen() !== null;
  const exOpenNow = exOpen[item.id] ?? explanationDefault(ans);
  const answeredCount = cells.filter((c) => c.state === 'answered').length;
  const isLast = index === N - 1;
  /** Mark sheet in practice: cells filled / to fill (shown next to 提交). */
  const sheetFill = !exam && canEdit && item.format === 'blanks' ? { filled: openLetters.filter((l) => (values[l] || '').trim()).length, of: openLetters.length } : null;
  const lastLeft = exam && isLast ? cells.filter((c, i) => i !== index && c.state === 'todo').length : 0;

  const zenPill = zen && (
    <button type="button" className="pl-zen-pill" onClick={toggleZen} onMouseDown={keepFocus} title="退出专注模式（⇧⌘F）">
      <Icon name="eyeOff" size={13} />
      专注中
    </button>
  );
  const topActions = exam ? (
    <>
      {zenPill}
      <Button size="sm" variant="secondary" icon="grid" onClick={() => setSheetOpen(true)} onMouseDown={keepFocus}>
        答题卡
      </Button>
      <Button size="sm" variant="primary" icon="check" onClick={() => void confirmSubmitExam()} onMouseDown={keepFocus}>
        交卷
      </Button>
    </>
  ) : (
    <>
      {zenPill}
      <Button size="sm" variant="ghost" icon="flag" onClick={() => void confirmFinishEarly()} onMouseDown={keepFocus} title="提前结束这一组，看小结">
        结束
      </Button>
    </>
  );

  return (
    <div className={cx('pl', exam && 'pl-is-exam', zen && 'is-zen')}>
      <TopBar
        title={session.title}
        subject={session.subject}
        exam={exam}
        index={index}
        total={N}
        clock={clock}
        elapsed={session.elapsedSec}
        limit={exam ? session.timeLimitSec : undefined}
        itemSaved={ans?.seconds ?? 0}
        itemTarget={item.targetSec}
        itemLive={canEdit}
        cells={cells}
        onJump={goTo}
        onExit={exit}
        actions={topActions}
      />
      <div className="pl-body">
        <main className="pl-main" ref={mainRef}>
          <div className={cx('pl-col', layout.short && 'is-short')} key={item.id}>
            <ItemHeader item={item} groupPos={groupPos} />
            {item.audio && (
              <AudioPanel
                key={item.id}
                audio={item.audio}
                exam={exam}
                played={played.current.has(item.id)}
                onPlayed={() => {
                  if (exam && !played.current.has(item.id)) {
                    played.current.add(item.id);
                    bumpPlayed((x) => x + 1);
                  }
                }}
                toggleRef={audioToggle}
                hero={heroAudio}
                title={heroAudio ? <ListeningTitle item={item} /> : undefined}
                caption={heroAudio ? <ListeningCaption item={item} revealed={graded} /> : undefined}
                idleText={graded ? '可以再听一遍，对照解析里的原文' : undefined}
              />
            )}
            {!heroAudio && (
              <article className={cx('pl-paper', item.subject === 'japanese' && 'is-ja', split && 'is-passage', layout.short && 'is-short')}>
                {split && <div className="pl-paper-label">本文</div>}
                <QuestionStem
                  item={item}
                  text={split?.passage ?? layout.inline?.passage}
                  prompt={layout.inline?.question}
                  marks={marks}
                  gloss={gloss}
                  onGlossChange={setGloss}
                />
              </article>
            )}
            {graded && <ExplanationCard item={item} open={exOpenNow} onToggle={() => setExOpen((m) => ({ ...m, [item.id]: !exOpenNow }))} />}
            {graded && settings.coachEnabled && <CoachCard key={`c-${item.id}`} item={item} response={ans!.response} wasCorrect={!!ans!.correct} focusRef={coachFocus} />}
          </div>
        </main>

        <aside className="pl-side">
          <div className="pl-side-scroll" ref={sideRef}>
            {split ? (
              <div className="pl-ask">
                <span className="pl-ask-label">
                  <Icon name="help" size={13} />
                  设问
                </span>
                <RichText text={split.question} lang="ja" className="pl-ask-text" />
              </div>
            ) : (
              item.format === 'choice' && (
                <div className="pl-side-label">
                  <span>{listeningHidden ? '听完后选出答案' : graded ? '你的作答' : '选择答案'}</span>
                  {canEdit && <span className="faint text-xs">按 1–{Math.min(9, item.options?.length ?? 4)} 选择{!exam && ' · 双击直接提交'}</span>}
                </div>
              )
            )}

            {item.format === 'choice' ? (
              <ChoicePad
                item={item}
                value={typeof response === 'number' ? response : null}
                onSelect={canEdit ? select : undefined}
                onCommit={canEdit && !exam ? (i) => submit({ resp: i }) : undefined}
                reveal={graded}
                hideText={listeningHidden}
              />
            ) : (
              <MarkSheet
                groups={groups}
                values={values}
                active={activeLetter}
                onActivate={canEdit ? (l) => setCursor({ id: item.id, letter: l }) : undefined}
                onMark={canEdit ? mark : undefined}
                onErase={erase}
                results={grade?.groups}
                locked={lock}
              />
            )}

            {canEdit && <ConfidencePicker value={confidence} onChange={setConf} exam={exam} />}

            <div className="pl-keys" aria-hidden>
              {graded ? (
                <>
                  <Kbd>E</Kbd> 解析 <Kbd>Enter</Kbd> {isLast && allGraded ? '看小结' : '下一题'} <Kbd>←</Kbd>
                  <Kbd>→</Kbd> 翻看做过的题
                </>
              ) : exam ? (
                <>
                  <Kbd>Enter</Kbd> {!isLast ? '下一题' : lastLeft ? '回到没做的题' : '交卷'} <Kbd>F</Kbd> 标记 <Kbd>←</Kbd>
                  <Kbd>→</Kbd> 上一题 / 下一题
                </>
              ) : (
                <>
                  <Kbd>Enter</Kbd> {sheetFill && sheetFill.filled > 0 && sheetFill.filled < sheetFill.of ? '跳到空格 / 提交' : '提交'} <Kbd>F</Kbd> 把握
                  {index > 0 && (
                    <>
                      {' '}
                      <Kbd>←</Kbd> 回看上一题
                    </>
                  )}
                </>
              )}
              {!graded && item.audio && (
                <>
                  {' '}
                  <Kbd>Space</Kbd> 播放
                </>
              )}
            </div>

            {graded && (
              <div className="pl-tools">
                <NoteBox key={item.id} itemId={item.id} />
                {settings.coachEnabled && (
                  <button type="button" className="pl-tool" onClick={() => coachFocus.current?.()}>
                    <Icon name="sparkles" size={15} />
                    问 AI
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="pl-side-foot">
            {graded && grade && ans && (
              <ResultBanner item={item} answer={ans} grade={grade} today={today} progress={progressMap[item.id]} before={item.id in before.current ? before.current[item.id] : undefined} />
            )}
            {exam ? (
              <>
                {nudge && <SlowNudge clock={clock} saved={ans?.seconds ?? 0} target={item.targetSec} onSkip={skipAhead} />}
                <div className="pl-foot-row">
                  <Button variant="secondary" icon="left" onClick={() => goTo(index - 1)} onMouseDown={keepFocus} disabled={index === 0}>
                    上一题
                  </Button>
                  {isLast ? (
                    <Button variant="primary" icon="check" className="pl-grow" onClick={() => void confirmSubmitExam()} onMouseDown={keepFocus}>
                      交卷
                    </Button>
                  ) : (
                    <Button variant="primary" iconRight="right" className="pl-grow" onClick={next} onMouseDown={keepFocus}>
                      下一题 <Kbd>Enter</Kbd>
                    </Button>
                  )}
                </div>
                <div className="pl-foot-note">
                  <span>
                    已作答 <b className="num">{answeredCount}</b> / <span className="num">{N}</span>
                  </span>
                  {answered ? (
                    <span className="pl-saved">
                      <Icon name="check" size={12} />
                      已记录
                    </span>
                  ) : (
                    <span>本题未作答</span>
                  )}
                </div>
              </>
            ) : graded ? (
              <Button
                variant="primary"
                size="lg"
                block
                className={cx('pl-next', autoNext && 'is-auto')}
                onClick={() => (autoNext ? (cancelAutoNext(), goTo(index + 1)) : next())}
                onMouseDown={keepFocus}
              >
                {isLast && allGraded ? '完成，看小结' : '下一题'}
                <Kbd>Enter</Kbd>
              </Button>
            ) : (
              <div className="pl-foot-row">
                <Button variant="ghost" icon="bulb" onClick={() => submit({ gaveUp: true })} onMouseDown={keepFocus} title="直接看解析（记为没做出来）">
                  不会，看解析
                </Button>
                <Button variant="primary" size="lg" className="pl-grow pl-submit" disabled={!answered} onClick={() => submit()} onMouseDown={keepFocus}>
                  提交
                  {sheetFill && answered && sheetFill.filled < sheetFill.of ? (
                    <span className="pl-submit-fill num">
                      已填 {sheetFill.filled}/{sheetFill.of}
                    </span>
                  ) : (
                    <Kbd>Enter</Kbd>
                  )}
                </Button>
              </div>
            )}
          </div>
        </aside>
      </div>
      <IdlePill clock={clock} />
      {exam && <ExamSheet open={sheetOpen} onClose={() => setSheetOpen(false)} cells={cells} current={index} onJump={goTo} onSubmit={() => void confirmSubmitExam()} />}
      {confirmNode}
    </div>
  );
}
