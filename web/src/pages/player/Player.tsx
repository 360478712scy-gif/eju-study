// The practice player: one item at a time, question on the left, answer on the right.
// Practice sessions grade each answer immediately; exam sessions (mocks, timed sets)
// keep everything silent until 交卷.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppState, Confidence, Item, PracticeSession, SessionAnswer } from '@shared/types.ts';
import type { BankIndex } from '@shared/bank.ts';
import { abandonSession, addStudyTime, finishSession, saveDraft, setConfidence, submitAnswer } from '@shared/actions.ts';
import { blankGroups, gradeItem, isAnswered } from '@shared/grading.ts';
import { flush, getSnapshot, update, useApp } from '../../lib/store.ts';
import { navigate } from '../../lib/router.ts';
import { onWindowVisibility } from '../../lib/native.ts';
import { stopSpeech } from '../../lib/audio.ts';
import { Button, Kbd, isModalOpen, toast, useConfirm } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import { RichText } from '../../components/RichText.tsx';
import { QuestionStem, splitReadingStem, type StemMarks } from '../../components/question/QuestionStem.tsx';
import { cx } from '../../lib/format.ts';
import { StudyClock } from './clock.ts';
import { isFocusedControl, isTextField, markKey } from './hotkeys.ts';
import { IdlePill, TopBar, type StripCell } from './TopBar.tsx';
import { ChoicePad } from './ChoicePad.tsx';
import { MarkSheet } from './MarkSheet.tsx';
import { AudioPanel } from './AudioPanel.tsx';
import { CoachCard } from './CoachCard.tsx';
import { NoteBox } from './NoteBox.tsx';
import { ConfidencePicker, ExamSheet, ExplanationCard, ItemHeader, ListeningCaption, ListeningTitle, ResultBanner, nextConfidence } from './parts.tsx';

type Resp = SessionAnswer['response'];
type Mutate = (d: AppState, bank: BankIndex, today: string) => void;

/** Set while leaving a session that is about to be removed, so the page does not flash "not found". */
export const leaving = { id: null as string | null };

const DRAFT_SAVE_MS = 1500;
const FLUSH_EVERY = 10;

function marksOf(r: Resp): Record<string, string> {
  return r && typeof r === 'object' ? r : {};
}

function explanationDefault(a: SessionAnswer | undefined): boolean {
  return !!a && (!a.correct || !!a.gaveUp || (!!a.confidence && a.confidence !== 'sure'));
}

export function Player({ session, items }: { session: PracticeSession; items: Item[] }) {
  const settings = useApp((s) => s.state!.settings);
  const progressMap = useApp((s) => s.state!.progress);
  const today = useApp((s) => s.today);
  const sid = session.id;
  const exam = session.exam;
  const N = items.length;
  const { ask, node: confirmNode } = useConfirm();

  const [clock] = useState(() => new StudyClock(!exam));
  const [index, setIndex] = useState(() => Math.max(0, Math.min(N - 1, session.index || 0)));
  const item = items[index];
  const ans: SessionAnswer | undefined = session.answers[item.id];
  const graded = !exam && !!ans?.submitted;
  const canEdit = !graded;

  // Local responses / confidence (mirrored in refs so callbacks always see the latest).
  const [drafts, setDraftsState] = useState<Record<string, Resp>>(() => {
    const o: Record<string, Resp> = {};
    for (const [id, a] of Object.entries(session.answers)) if (exam || !a.submitted) o[id] = a.response;
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
  const curId = useRef(item.id);
  curId.current = item.id;

  const response: Resp = graded ? ans!.response : (drafts[item.id] ?? null);
  const confidence: Confidence = graded ? (ans?.confidence ?? 'sure') : (confs[item.id] ?? 'sure');

  const [exOpen, setExOpen] = useState<Record<string, boolean>>({});
  const [autoNext, setAutoNext] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [gloss, setGloss] = useState(settings.showZhGloss);
  const played = useRef(new Set<string>());
  const [, bumpPlayed] = useState(0);
  const audioToggle = useRef<(() => void) | null>(null);
  const coachFocus = useRef<(() => void) | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  // ── Derived ──
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
          const shaky = !!c && c !== 'sure';
          const done = isAnswered(it, r);
          return { state: shaky ? 'flag' : done ? 'answered' : 'todo', reachable: true, answered: done };
        }
        if (a?.submitted) return { state: a.correct ? 'right' : 'wrong', reachable: true };
        return { state: 'todo', reachable: i <= frontier };
      }),
    [items, session.answers, drafts, confs, exam, frontier],
  );

  const split = useMemo(() => splitReadingStem(item), [item]);
  const groups = useMemo(() => (item.format === 'blanks' ? blankGroups(item) : []), [item]);
  const letters = useMemo(() => groups.flatMap((g) => [...g]), [groups]);
  const grade = useMemo(() => (graded ? gradeItem(item, ans!.response) : null), [graded, item, ans]);
  const groupPos = useMemo(() => {
    if (!item.group) return undefined;
    const same = items.filter((it) => it.group === item.group);
    return { n: same.indexOf(item) + 1, of: same.length };
  }, [item, items]);

  // Mark-sheet cursor, keyed by item so it resets without an effect.
  const [cursor, setCursor] = useState<{ id: string; letter: string | null }>({ id: '', letter: null });
  const values = marksOf(response);
  const activeLetter = cursor.id === item.id ? cursor.letter : canEdit ? (letters.find((l) => !values[l]) ?? letters[0] ?? null) : null;
  const activeGroup = activeLetter ? (groups.find((g) => g.includes(activeLetter)) ?? null) : null;

  // ── Persistence ──
  const persist = (opts: { saveNow?: boolean; mutate?: Mutate } = {}) => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = null;
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
          if (s.exam && it && isAnswered(it, r)) submitAnswer(d, bank, { sessionId: sid, itemId: id, response: r, seconds: sec, confidence: confsRef.current[id], date: day });
          else saveDraft(d, sid, id, r, sec);
        }
        opts.mutate?.(d, bank, day);
      },
      { saveNow: opts.saveNow },
    );
  };

  const setDraft = (id: string, r: Resp, commitNow = false) => {
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

  const confirmSubmitExam = async () => {
    setSheetOpen(false);
    const left = items.filter((it) => !isAnswered(it, draftsRef.current[it.id] ?? session.answers[it.id]?.response ?? null)).length;
    const ok = await ask('现在交卷？', {
      body: left ? `还有 ${left} 题没作答，交卷后按答错计算。` : '全部作答完毕，交卷后立刻看到成绩和每题解析。',
      ok: '交卷',
    });
    if (ok) finish();
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
      if (index < N - 1) goTo(index + 1);
      else void confirmSubmitExam();
      return;
    }
    if (!graded) return;
    if (index < N - 1) goTo(index + 1);
    else if (allGraded) finish();
    else goTo(frontier);
  };

  const submit = (opts: { gaveUp?: boolean; resp?: Resp } = {}) => {
    if (exam || graded || finishing.current) return;
    const r = opts.resp !== undefined ? opts.resp : (draftsRef.current[item.id] ?? null);
    if (!opts.gaveUp && !isAnswered(item, r)) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = null;
    dirty.current.delete(item.id);
    const study = clock.takeStudy();
    const secs = clock.takeItem();
    clock.setCounting(false);
    const conf = confsRef.current[item.id] ?? 'sure';
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

  const exit = () => {
    cancelAutoNext();
    stopSpeech();
    persist({ saveNow: true });
    const s = getSnapshot().state?.sessions[sid];
    const touched = !!s && Object.values(s.answers).some((a) => a.submitted || a.response !== null);
    leaving.id = sid;
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

  const mark = (ch: string) => {
    if (!canEdit || item.format !== 'blanks' || !letters.length) return;
    const L = activeLetter ?? letters[0];
    setDraft(item.id, { ...marksOf(draftsRef.current[item.id] ?? null), [L]: ch });
    const i = letters.indexOf(L);
    setCursor({ id: item.id, letter: letters[Math.min(i + 1, letters.length - 1)] });
  };

  const erase = () => {
    if (!canEdit || item.format !== 'blanks' || !letters.length) return;
    const L = activeLetter ?? letters[0];
    const cur = { ...marksOf(draftsRef.current[item.id] ?? null) };
    let target = L;
    if (!cur[L]) {
      const i = letters.indexOf(L);
      if (i > 0) target = letters[i - 1];
    }
    delete cur[target];
    setDraft(item.id, cur);
    setCursor({ id: item.id, letter: target });
  };

  const moveCursor = (delta: number) => {
    if (!letters.length) return;
    const i = activeLetter ? letters.indexOf(activeLetter) : -1;
    setCursor({ id: item.id, letter: letters[Math.max(0, Math.min(letters.length - 1, i + delta))] });
  };

  const focusGroup = (g: string) => {
    if (!canEdit) return;
    const first = [...g].find((l) => !values[l]) ?? g[0];
    setCursor({ id: item.id, letter: first });
  };

  /** Bring a freshly opened explanation into view without hiding the whole question. */
  const revealExplanation = () => {
    const main = mainRef.current;
    const card = main?.querySelector('.pl-excard');
    if (!main || !card) return;
    const top = card.getBoundingClientRect().top - main.getBoundingClientRect().top;
    if (top > main.clientHeight * 0.72) main.scrollTo({ top: main.scrollTop + top - main.clientHeight * 0.32, behavior: 'smooth' });
  };

  // Latest callbacks for timers / listeners bound once.
  const api = useRef({ persist, goTo, finish });
  api.current = { persist, goTo, finish };

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
        else submit();
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
      if (n % FLUSH_EVERY === 0) api.current.persist();
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

  // ── Render ──
  const marks: StemMarks | undefined =
    item.format === 'blanks'
      ? {
          values,
          active: canEdit ? activeGroup : null,
          results: grade?.groups ? Object.fromEntries(grade.groups.map((g) => [g.group, g.correct])) : undefined,
          onBoxClick: canEdit ? focusGroup : undefined,
        }
      : undefined;

  const listeningHidden = item.section === 'listening' && !graded;
  const heroAudio = item.section === 'listening' && !!item.audio && !item.figures?.length;
  const answered = isAnswered(item, response);
  const exOpenNow = exOpen[item.id] ?? explanationDefault(ans);
  const answeredCount = cells.filter((c) => c.answered).length;
  const isLast = index === N - 1;

  const topActions = exam ? (
    <>
      <Button size="sm" variant="secondary" icon="grid" onClick={() => setSheetOpen(true)}>
        答题卡
      </Button>
      <Button size="sm" variant="primary" icon="check" onClick={() => void confirmSubmitExam()}>
        交卷
      </Button>
    </>
  ) : (
    <Button size="sm" variant="ghost" icon="flag" onClick={() => void confirmFinishEarly()} title="提前结束这一组，看小结">
      结束
    </Button>
  );

  return (
    <div className={cx('pl', exam && 'pl-is-exam')}>
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
          <div className="pl-col" key={item.id}>
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
              <article className={cx('pl-paper', item.subject === 'japanese' && 'is-ja', split && 'is-passage')}>
                {split && <div className="pl-paper-label">本文</div>}
                <QuestionStem item={item} text={split?.passage} marks={marks} gloss={gloss} onGlossChange={setGloss} />
              </article>
            )}
            {graded && <ExplanationCard item={item} open={exOpenNow} onToggle={() => setExOpen((m) => ({ ...m, [item.id]: !exOpenNow }))} />}
            {graded && settings.coachEnabled && <CoachCard key={`c-${item.id}`} item={item} response={ans!.response} wasCorrect={!!ans!.correct} focusRef={coachFocus} />}
          </div>
        </main>

        <aside className="pl-side">
          <div className="pl-side-scroll">
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
              />
            )}

            {canEdit && <ConfidencePicker value={confidence} onChange={setConf} exam={exam} />}

            <div className="pl-keys" aria-hidden>
              {graded ? (
                <>
                  <Kbd>E</Kbd> 解析 <Kbd>Enter</Kbd> 下一题 <Kbd>←</Kbd>
                  <Kbd>→</Kbd> 翻题
                </>
              ) : (
                <>
                  <Kbd>Enter</Kbd> {exam ? '下一题' : '提交'} <Kbd>F</Kbd> {exam ? '标记' : '把握'} <Kbd>←</Kbd>
                  <Kbd>→</Kbd> 翻题{item.audio && (
                    <>
                      {' '}
                      <Kbd>Space</Kbd> 播放
                    </>
                  )}
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
            {graded && grade && ans && <ResultBanner item={item} answer={ans} grade={grade} today={today} progress={progressMap[item.id]} />}
            {exam ? (
              <>
                <div className="pl-foot-row">
                  <Button variant="secondary" icon="left" onClick={() => goTo(index - 1)} disabled={index === 0}>
                    上一题
                  </Button>
                  {isLast ? (
                    <Button variant="primary" icon="check" className="pl-grow" onClick={() => void confirmSubmitExam()}>
                      交卷
                    </Button>
                  ) : (
                    <Button variant="primary" iconRight="right" className="pl-grow" onClick={next}>
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
              <Button variant="primary" size="lg" block className={cx('pl-next', autoNext && 'is-auto')} onClick={() => (autoNext ? (cancelAutoNext(), goTo(index + 1)) : next())}>
                {isLast && allGraded ? '完成，看小结' : '下一题'}
                <Kbd>Enter</Kbd>
              </Button>
            ) : (
              <div className="pl-foot-row">
                <Button variant="ghost" icon="bulb" onClick={() => submit({ gaveUp: true })} title="直接看解析（记为没做出来）">
                  不会，看解析
                </Button>
                <Button variant="primary" size="lg" className="pl-grow pl-submit" disabled={!answered} onClick={() => submit()}>
                  提交 <Kbd>Enter</Kbd>
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
