import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { isCard } from '@shared/bank.ts';
import { blankGroups, isAnswered } from '@shared/grading.ts';
import type { Confidence, PracticeSession, Response, SessionAnswer, WrittenResponse } from '@shared/types.ts';
import { Page } from '../../shell/Shell.tsx';
import { Button, Card, Chip, Empty, Icon, IconButton, Modal, Sheet, SubjectGlyph, TextArea, toast } from '../../ui/ui.tsx';
import { BallMenu } from '../../shell/BallMenu.tsx';
import { MusicPlayer } from '../../shell/Music.tsx';
import { Settings } from '../settings/Settings.tsx';
import { t } from '../../copy/index.ts';
import { findItem, pendingScripts, topicName } from '../../lib/model.ts';
import { go, isTyping, link } from '../../lib/navigation.ts';
import { useStudy } from '../../lib/study.tsx';
import { cardRating, FlashCard } from '../review/Review.tsx';
import { Choices, Marks, Solution, Stem } from './Question.tsx';
import { WrittenGrade } from './Written.tsx';
import './session.css';

type Frame = (page: ReactNode, dock?: ReactNode) => ReactNode;
type Draft = { response: Response; confidence?: Confidence; seconds: number };
type SessionOverlay = 'overview' | 'exit' | 'finish' | 'summary' | '';
const positionKey = (session: string) => 'eju-v3-position:' + session;
const draftKey = (session: string, item: string) => 'eju-v3-draft:' + session + ':' + item;

function localDraft(session: string, item: string): Draft | undefined {
  try { return JSON.parse(sessionStorage.getItem(draftKey(session, item)) ?? 'null') ?? undefined; }
  catch { return undefined; }
}

function storeDraft(session: string, item: string, draft?: Draft) {
  try {
    if (draft) sessionStorage.setItem(draftKey(session, item), JSON.stringify(draft));
    else sessionStorage.removeItem(draftKey(session, item));
  } catch { /* storage unavailable */ }
}

const textDraft = (text: string) => ({ text }) as unknown as Response;
function writtenText(response: Response) {
  return response && typeof response === 'object' && 'text' in response ? String(response.text ?? '') : '';
}

export function Session({ id, selectedItem, initialOverlay, frame, shortcuts, returnTo }: {
  id: string; selectedItem?: string | null; initialOverlay?: 'overview' | 'finish'; frame: Frame; shortcuts: boolean; returnTo: () => void;
}) {
  const { state } = useStudy();
  const session = state.sessions[id];
  if (!session) return frame(<Page><Empty icon="alert" title={t.session.missing}
    action={<Button onClick={returnTo}>{t.common.backBtn}</Button>} /></Page>);
  return <SessionPlayer key={id + (selectedItem ?? '') + (initialOverlay ?? '')} session={session} selectedItem={selectedItem} initialOverlay={initialOverlay} frame={frame} shortcuts={shortcuts} returnTo={returnTo} />;
}

function SessionPlayer({ session, selectedItem, initialOverlay, frame, shortcuts, returnTo }: {
  session: PracticeSession; selectedItem?: string | null; initialOverlay?: 'overview' | 'finish'; frame: Frame; shortcuts: boolean; returnTo: () => void;
}) {
  const study = useStudy();
  const { state, bank, active, seconds, paused, flushClock, togglePause, action, openCoach, openQuickNote, continueGuided, isGuided } = study;
  const initialIndex = selectedItem ? session.itemIds.indexOf(selectedItem) : session.sealedAt && !session.finishedAt
    ? session.itemIds.indexOf(pendingScripts(session, bank)[0]) : session.index;
  const [index, setIndex] = useState(() => {
    if (!selectedItem && !session.sealedAt && !session.finishedAt) {
      try {
        const saved = sessionStorage.getItem(positionKey(session.id));
        if (saved !== null && Number(saved) >= 0 && Number(saved) < session.itemIds.length) return Number(saved);
      } catch { /* storage unavailable */ }
    }
    return Math.max(0, initialIndex);
  });
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const draftRef = useRef<Record<string, Draft>>({});
  const persistTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());
  const [overlay, setOverlay] = useState<SessionOverlay>(initialOverlay ?? '');
  const [showExplanation, setShowExplanation] = useState<boolean | null>(null);
  const [revealWritten, setRevealWritten] = useState(false);
  const [busy, setBusy] = useState(false);
  // Ball menu (bottom left): its column, and the music window / settings sheet it opens.
  const [ballOpen, setBallOpen] = useState(false);
  const [panel, setPanel] = useState<'' | 'music' | 'settings'>('');
  const locked = useRef(false);
  const deadlineHandled = useRef(false);
  const itemId = session.itemIds[index];
  const item = findItem(bank, state, itemId);
  const saved = session.answers[itemId];
  const isLive = active?.id === session.id && !session.finishedAt;
  const exam = session.exam && isLive;
  const sealed = Boolean(exam && session.sealedAt);
  const remaining = session.timeLimitSec == null ? null
    : Math.max(0, Math.ceil((Date.parse(session.startedAt) + session.timeLimitSec * 1000 - now) / 1000));
  const expired = exam && !sealed && remaining === 0;
  const pending = pendingScripts(session, bank);
  const readOnly = !isLive || !!saved?.submitted;
  const card = !!item && isCard(item) && item.format === 'choice' && !exam && !readOnly;
  const draft = drafts[itemId];
  const response = readOnly || sealed ? saved?.response ?? null : draft?.response ?? (draft ? null : saved?.response ?? null);
  const confidence = draft?.confidence ?? (draft ? undefined : saved?.confidence);
  const elapsedAtEntry = useRef(Math.max(seconds, session.elapsedSec));
  const storedItemSeconds = useRef(saved?.seconds ?? 0);
  const itemTime = Math.min(86400, storedItemSeconds.current + Math.max(0, seconds - elapsedAtEntry.current));
  const displayTime = exam && !sealed && remaining != null ? remaining : readOnly ? saved?.seconds ?? 0 : itemTime;
  const showAnswer = !!saved?.submitted || !isLive;
  const canEdit = !!item && !readOnly && !sealed && !expired && !busy;
  const explanation = showAnswer && (showExplanation ?? !!saved?.submitted);
  const sessionAnswered = (question: NonNullable<typeof item>, value: Response | undefined) => question.format === 'written'
    ? !!writtenText(value ?? null).trim() : isAnswered(question, value);
  const numberAnswered = session.itemIds.filter(id => {
    const q = findItem(bank, state, id);
    const answer = session.answers[id];
    return q && (answer?.submitted || (exam && sessionAnswered(q, id === itemId ? response : answer?.response)));
  }).length;

  const emitDraft = useEffectEvent(async (id: string) => {
    const value = draftRef.current[id];
    if (!value || !isLive || sealed || expired || session.answers[id]?.submitted) return true;
    const success = (await action({ type: 'draft', sessionId: session.id, itemId: id, ...value })) !== undefined;
    if (success && draftRef.current[id] === value) {
      delete draftRef.current[id];
      storeDraft(session.id, id);
    }
    return success;
  });
  // Persist the recovery snapshot before debouncing HTTP writes. A reload can recover a draft mid-keystroke.
  const queueDraft = (next: Draft) => {
    if (!canEdit) return;
    draftRef.current[itemId] = next;
    setDrafts(values => ({ ...values, [itemId]: next }));
    storeDraft(session.id, itemId, next);
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => void emitDraft(itemId), 350);
  };

  useEffect(() => {
    if (!exam || sealed) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [exam, sealed]);

  useEffect(() => {
    if (!itemId || !isLive || sealed || session.answers[itemId]?.submitted) return;
    if (!draftRef.current[itemId]) {
      const cached = localDraft(session.id, itemId);
      if (cached) {
        draftRef.current[itemId] = cached;
        storedItemSeconds.current = Math.max(storedItemSeconds.current, cached.seconds);
        setDrafts(values => ({ ...values, [itemId]: cached }));
        void emitDraft(itemId);
      }
    }
    return () => {
      clearTimeout(persistTimer.current);
      void emitDraft(itemId);
    };
  }, [itemId, isLive, sealed, session.id, session.answers[itemId]?.submitted]);

  const clearDraft = (id: string) => {
    delete draftRef.current[id];
    setDrafts(values => {
      const next = { ...values };
      delete next[id];
      return next;
    });
    storeDraft(session.id, id);
  };

  const select = async (next: number, save = true) => {
    if (next < 0 || next >= session.itemIds.length || next === index) return;
    if (save && canEdit && !card) {
      clearTimeout(persistTimer.current);
      const draft = { response, confidence, seconds: itemTime };
      draftRef.current[itemId] = draft;
      storeDraft(session.id, itemId, draft);
      setDrafts(values => ({ ...values, [itemId]: draft }));
      if (!await emitDraft(itemId)) return;
    }
    const nextId = session.itemIds[next];
    elapsedAtEntry.current = seconds;
    storedItemSeconds.current = Math.max(session.answers[nextId]?.seconds ?? 0, draftRef.current[nextId]?.seconds ?? 0);
    setShowExplanation(null);
    setRevealWritten(false);
    setIndex(next);
    try { sessionStorage.setItem(positionKey(session.id), String(next)); } catch { /* storage unavailable */ }
    setOverlay('');
    document.querySelector('.pane-main .page-scroll')?.scrollTo({ top: 0 });
  };

  const perform = async (callback: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try { await callback(); }
    finally { locked.current = false; setBusy(false); }
  };

  const finish = async (skipSave = false) => {
    await perform(async () => {
      clearTimeout(persistTimer.current);
      if (!skipSave && !sealed && !expired && exam && item && !card) {
        draftRef.current[itemId] = { response, confidence, seconds: itemTime };
        if (!await emitDraft(itemId)) return;
      }
      await flushClock();
      const result = await action<PracticeSession | { pendingWritten: string[] }>({ type: 'finish', sessionId: session.id });
      if (!result) return;
      if ('pendingWritten' in result) {
        const target = session.itemIds.indexOf(result.pendingWritten[0]);
        await select(target, false);
        setOverlay('');
        toast(t.session.pendingWritten(result.pendingWritten.length));
      } else setOverlay('summary');
    });
  };

  const onDeadline = useEffectEvent(() => { void finish(true); });
  useEffect(() => {
    if (!expired || deadlineHandled.current || busy) return;
    deadlineHandled.current = true;
    onDeadline();
  }, [expired, busy]);

  const submit = async (value: Response, gaveUp = false, confidenceOverride = confidence) => {
    if (!item || !isLive || (readOnly && !sealed) || expired) return;
    await perform(async () => {
      clearTimeout(persistTimer.current);
      const result = await action({
        type: exam && !sealed ? 'draft' : 'answer', sessionId: session.id, itemId,
        response: value, confidence: confidenceOverride, seconds: sealed ? saved?.seconds ?? 0 : itemTime, gaveUp,
      });
      if (result === undefined) return;
      clearDraft(itemId);
      if (sealed) {
        const next = pending.filter(id => id !== itemId)[0];
        if (next) { toast(t.session.writtenSaved, 'ok'); await select(session.itemIds.indexOf(next), false); }
        else setOverlay('finish');
      } else if (exam) {
        if (index < session.itemIds.length - 1) await select(index + 1, false);
        else setOverlay('finish');
      } else if (card && index < session.itemIds.length - 1) {
        await select(index + 1, false);
      } else setShowExplanation(true);
    });
  };

  const next = () => {
    if (busy) return;
    if (index + 1 < session.itemIds.length) void select(index + 1);
    else if (isLive) setOverlay('finish');
    else returnTo();
  };
  const previous = () => { if (!busy) void select(index - 1); };
  const updateResponse = (value: Response) => queueDraft({ response: value, confidence, seconds: itemTime });
  const flag = (value: Confidence) => queueDraft({ response, confidence: confidence === value ? undefined : value, seconds: itemTime });
  const askCoach = (mode?: 'variant') => {
    if (item) openCoach({ item, response, mode, locked: exam });
  };
  const primary = () => {
    if (!item || busy || expired || sealed) return;
    if (readOnly) { next(); return; }
    if (card) return;
    if (item.format === 'written' && !exam) { setRevealWritten(true); return; }
    if (exam || sessionAnswered(item, response)) void submit(response);
  };

  const keys = useEffectEvent((event: KeyboardEvent) => {
    if (!shortcuts || event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey ||
      isTyping(event) || overlay || ballOpen || panel || busy || !item) return;
    const control = (event.target as HTMLElement)?.closest('button, a, summary');
    if (control && (event.code === 'Space' || (event.key === 'Enter' && !control.matches('.opt')))) return;
    if (card && (event.code === 'Space' || /^[123]$/.test(event.key))) return;
    const key = event.key.toLowerCase();
    if (key === 'arrowleft') previous();
    else if (key === 'arrowright') { if (index + 1 < session.itemIds.length) void select(index + 1); }
    else if (key === 'enter') primary();
    else if (key === 'f') flag('unsure');
    else if (key === 'e' && showAnswer) setShowExplanation(!explanation);
    else if (key === '/') askCoach();
    else if (event.code === 'Space' && isLive && !exam) togglePause();
    else if (/^[1-9]$/.test(key) && item.format === 'choice' && canEdit && Number(key) <= (item.options?.length ?? 0)) updateResponse(Number(key) - 1);
    else if (/^[0-9+-]$/.test(key) && item.format === 'blanks' && canEdit) {
      const marks = (response ?? {}) as Record<string, string>;
      const letters = [...new Set(blankGroups(item).join(''))];
      const label = letters.find(letter => !marks[letter]) ?? letters[0];
      if (label) updateResponse({ ...marks, [label]: key });
    } else return;
    event.preventDefault();
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => keys(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const exit = async (abandon = false) => {
    await perform(async () => {
      clearTimeout(persistTimer.current);
      if (canEdit && !card) {
        draftRef.current[itemId] = { response, confidence, seconds: itemTime };
        storeDraft(session.id, itemId, draftRef.current[itemId]);
        if (!await emitDraft(itemId)) return;
      }
      await flushClock();
      if (abandon && !await action({ type: 'abandon', sessionId: session.id })) return;
      if (abandon) for (const id of session.itemIds) storeDraft(session.id, id);
      else toast(t.toast.sessionSaved, 'ok');
      returnTo();
    });
  };

  // 暂离: save and go back to the main screen. A mock keeps its own exit dialog (its clock and sealing rules).
  const leave = () => {
    setPanel('');
    if (!isLive) returnTo();
    else if (exam) setOverlay('exit');
    else void exit();
  };

  const report = state.mocks.find(mock => mock.id === session.id);
  const summaryNext = () => {
    setOverlay('');
    for (const id of session.itemIds) storeDraft(session.id, id);
    try { sessionStorage.removeItem(positionKey(session.id)); } catch { /* storage unavailable */ }
    if (isGuided(session)) {
      go(link('today'));
      void continueGuided();
    } else if (report) go(link('mock') + '?' + new URLSearchParams({ report: report.id }));
    else returnTo();
  };

  const header = item ? topicName(bank, item.topic) || item.source.label : t.common.missingItem;
  const title = item?.source.label ?? header;
  const status = (answer?: SessionAnswer) => answer?.submitted
    ? answer.correct ? 'is-done' : 'is-bad'
    : answer?.response != null ? (answer.confidence && answer.confidence !== 'sure' ? 'is-unsure' : 'is-done') : '';
  return frame(<Page>
    <div className="ses-top">
      <IconButton icon="close" label={isLive ? t.session.pauseAndExitBtn : t.session.returnToOrigin}
        onClick={() => isLive ? setOverlay('exit') : returnTo()} />
      {item && <SubjectGlyph subject={item.subject} size="sm" />}
      <div className="ses-info"><b>{title}</b><div className="t-3">{t.session.questionProgress(index + 1, session.itemIds.length)}
        {item && <> · {t.session.targetTimeHint(item.targetSec)}</>}</div></div>
      <div className="ses-progress">
        {session.itemIds.map((id, i) => <span key={id} className={i === index ? 'is-now' : status(session.answers[id])} />)}
      </div>
      <div className="ses-nav">
        <IconButton icon="chev-left" label={t.session.prevQuestionBtn} disabled={index === 0} onClick={previous} />
        <IconButton icon="chev-right" label={t.session.nextQuestionBtn} disabled={index + 1 >= session.itemIds.length} onClick={next} />
        <IconButton icon="sheet" label={t.session.headSheetBtn} onClick={() => setOverlay('overview')} />
      </div>
      <button type="button" className={`ses-timer${expired ? ' is-warn' : ''}${paused ? ' is-paused' : ''}`}
        disabled={!(isLive && !exam)} onClick={togglePause}
        aria-label={paused ? t.session.headResumeBtn : t.session.headPauseBtn}>
        <Icon name="clock" size={14} /><span className="num">{t.time.timerClock(displayTime)}</span>
        {isLive && !exam && <span className="ses-timer-act">{paused ? t.session.headResumeBtn : t.session.headPauseBtn}</span>}
      </button>
    </div>
    {paused && isLive && !exam && <Chip icon="clock">{t.session.paused}</Chip>}
    {expired && <Card title={t.session.timeUp}><Button onClick={() => void finish(true)}>{t.session.submitMockPaperBtn}</Button></Card>}
    {sealed && <Card className="session-sealed" title={t.session.pendingWritten(pending.length)}>
      {!!pending.length && <Button size="sm" onClick={() => void select(session.itemIds.indexOf(pending[0]), false)}>{t.session.nextQuestionBtn}</Button>}
      {!pending.length && <Button variant="primary" onClick={() => void finish(true)}>{t.session.submitMockPaperBtn}</Button>}
    </Card>}
    {!item ? <Empty title={t.common.missingItem} /> : card ? <FlashCard key={itemId} item={item} index={index + 1} total={session.itemIds.length}
      onRate={value => { const rate = cardRating(item, value); void submit(rate.response, rate.gaveUp, rate.confidence); }} disabled={busy} shortcuts={shortcuts && !overlay} />
      : <>
        {item.format === 'written' && <Chip tone="school">{t.session.writtenHeaderBadge}</Chip>}
        <Stem key={`stem-${itemId}`} item={item} />
        {item.format === 'choice' && <Choices item={item} response={response} reveal={showAnswer} disabled={!canEdit} choose={updateResponse} />}
        {item.format === 'blanks' && <Marks key={`marks-${itemId}`} item={item} response={response} reveal={showAnswer} disabled={!canEdit} onChange={updateResponse} onEnter={primary} />}
        {item.format === 'written' && exam && !sealed && <Card className="written-draft" title={t.session.examWrittenDraft}>
          <TextArea value={writtenText(response)} onChange={text => updateResponse(textDraft(text))} placeholder={t.session.aiGradePlaceholder} />
          <Button size="sm" disabled={!canEdit} onClick={() => updateResponse(textDraft(t.session.paperDraftText))}>{t.session.paperDraft}</Button>
          {writtenText(response) && <span className="t-3">{t.session.draftStored}</span>}
        </Card>}
        {item.format === 'written' && (showAnswer || (!exam && revealWritten) || (sealed && (pending.includes(itemId) || Boolean((saved?.response as WrittenResponse | null)?.marks))))
          && <WrittenGrade key={`grade-${itemId}-${Boolean(sealed)}`} item={item} saved={saved} sealed={sealed} disabled={busy || !isLive}
            text={writtenText(response)} onSubmit={value => void submit(value)} />}
        <div className="hstack ses-actions">
          {canEdit && !exam && <Button variant="ghost" icon="flag" aria-pressed={confidence === 'unsure'} kbd="F" onClick={() => flag('unsure')}>{confidence === 'unsure' ? t.session.flagUnsureActive : t.session.flagUnsureBtn}</Button>}
          {!exam && <Button variant="ghost" icon="coach" kbd="/" onClick={() => askCoach()}>{t.session.askCoachInSessionBtn}</Button>}
          {!exam && <Button variant="ghost" icon="notes" onClick={() => openQuickNote(item.topic)}>{t.nav.dockQuickNotes}</Button>}
          {showAnswer && <Button variant="ghost" size="sm" aria-expanded={explanation} kbd="E" onClick={() => setShowExplanation(!explanation)}>{explanation ? t.session.collapseExplainBtn : t.session.expandExplainBtn}</Button>}
          <span className="spacer" />
          {item.format === 'written' && !exam && !readOnly && !revealWritten
            ? <Button variant="primary" size="lg" onClick={() => setRevealWritten(true)}>{t.session.revealWrittenAnswerBtn}</Button>
            : !sealed && (item.format !== 'written' || readOnly || exam) && <Button variant="primary" size="lg" kbd="↵"
              disabled={busy || expired || (!readOnly && !exam && !sessionAnswered(item, response))}
              onClick={primary}>{readOnly ? index + 1 < session.itemIds.length ? t.session.nextQuestionBtn : isLive ? t.session.finishSessionBtn : t.session.returnToOrigin
                : exam ? index + 1 === session.itemIds.length ? t.session.submitMockPaperBtn : t.session.nextQuestionBtn : t.session.submitItemBtn}</Button>}
        </div>
        {!exam && canEdit && !revealWritten && <Button variant="ghost" size="sm" onClick={() => void submit(null, true)}>{t.session.giveUpAndSeeExplainBtn}</Button>}
        {explanation && <><Solution item={item} answer={saved} />
          <Button size="sm" icon="sparkle" className="session-variant" onClick={() => askCoach('variant')}>{t.session.spawnVariantBtn}</Button></>}
      </>}
    <Modal open={overlay === 'overview'} title={t.session.overviewPopoverTitle} onClose={() => setOverlay('')} closeLabel={t.common.closeBtn}
      footer={isLive && <Button variant="primary" onClick={() => setOverlay('finish')}>{exam ? t.session.submitMockPaperBtn : t.session.finishSessionBtn}</Button>}>
      <div className="session-overview">{session.itemIds.map((id, i) => {
        const answer = session.answers[id];
        const label = i === index ? t.session.overviewCurrent : answer?.confidence && answer.confidence !== 'sure' ? t.session.overviewUnsure
          : answer?.submitted || answer?.response != null ? t.session.overviewDone : t.session.overviewUnanswered;
        return <Button key={id} square variant={i === index ? 'primary' : 'glass'} className={status(answer)}
          title={label} aria-label={t.session.questionProgress(i + 1, session.itemIds.length) + ' · ' + label}
          onClick={() => { if (i === index) setOverlay(''); else void select(i); }}>{i + 1}</Button>;
      })}</div>
    </Modal>
    <Modal open={overlay === 'exit'} closeLabel={t.common.closeBtn} title={exam ? t.session.exitMockModalTitle : t.session.pauseAndExitBtn}
      onClose={() => setOverlay('')} footer={<>
        <Button disabled={busy} variant="ghost" onClick={() => setOverlay('')}>{t.session.stayInSessionBtn}</Button>
        <Button disabled={busy} variant="primary" onClick={() => void exit()}>{t.session.confirmSaveExitBtn}</Button>
      </>}>
      <p>{exam ? t.session.exitMockModalBody : t.common.abandonNote}</p>
      <div className="hstack ses-actions">
        {exam || numberAnswered > 0
          ? <Button disabled={busy} onClick={() => setOverlay('finish')}>{exam ? t.session.submitMockPaperBtn : t.session.finishSessionBtn}</Button>
          : <Button disabled={busy} variant="danger" onClick={() => void exit(true)}>{t.common.abandon}</Button>}
      </div>
    </Modal>
    <Modal open={overlay === 'finish'} closeLabel={t.common.closeBtn} title={exam ? t.session.submitMockPaperBtn : t.session.finishSessionBtn} onClose={() => setOverlay('')}
      footer={<Button variant="primary" disabled={busy || (sealed && pending.length > 0)} onClick={() => {
        if (!exam && !numberAnswered) void exit(true);
        else void finish();
      }}>{t.session.confirmFinish}</Button>}>
      <p>{sealed ? t.session.pendingWritten(pending.length) : numberAnswered < session.itemIds.length
        ? t.session.finishWithUnanswered(session.itemIds.length - numberAnswered)
        : t.mock.answered(numberAnswered, session.itemIds.length)}</p>
    </Modal>
    <Modal open={overlay === 'summary'} closeLabel={t.common.closeBtn} title={t.session.summaryModalTitle} onClose={summaryNext}
      footer={<Button variant="primary" iconRight="arrow-right" onClick={summaryNext}>
        {isGuided(session) ? t.session.continue : report ? t.mock.openReportBtn : t.session.returnToOrigin}
      </Button>}>
      <p>{t.session.summaryStatsLine(Object.values(session.answers).filter(answer => answer.correct).length, session.itemIds.length, Math.round(session.elapsedSec / 60))}</p>
      {session.itemIds.some(id => session.answers[id]?.submitted && !session.answers[id].correct) &&
        <Button variant="ghost" onClick={() => {
          void select(session.itemIds.findIndex(id => session.answers[id]?.submitted && !session.answers[id].correct), false);
          setShowExplanation(true);
          setOverlay('');
        }}>{t.session.reviewWrongJustNowBtn}</Button>}
    </Modal>
    <BallMenu label={t.ball.menu} closeLabel={t.ball.close} onOpenChange={setBallOpen} items={[
      { id: 'settings', icon: 'gear', label: t.ball.settings, on: panel === 'settings', onClick: () => setPanel(panel === 'settings' ? '' : 'settings') },
      { id: 'note', icon: 'edit', label: t.ball.note, onClick: () => { setPanel(''); openQuickNote(item?.topic); } },
      { id: 'music', icon: 'music', label: t.ball.music, on: panel === 'music', className: 'music-trigger', onClick: () => setPanel(panel === 'music' ? '' : 'music') },
      { id: 'home', icon: 'home', label: t.ball.home, onClick: leave },
    ]} />
    <MusicPlayer open={panel === 'music'} onClose={() => setPanel('')} className="is-by-ball" />
    <Sheet open={panel === 'settings'} label={t.ball.settings} onClose={() => setPanel('')} className="sheet-settings">
      <IconButton className="sheet-settings-close" icon="close" label={t.common.closeBtn} onClick={() => setPanel('')} />
      <Settings />
    </Sheet>
    {!isLive && isGuided(session) && <div className="ses-actions"><Button variant="primary" iconRight="arrow-right" onClick={summaryNext}>{t.session.continue}</Button></div>}
  </Page>);
}
