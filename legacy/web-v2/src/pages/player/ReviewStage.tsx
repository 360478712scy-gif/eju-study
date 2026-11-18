// Read-only look at a finished item from the summary: question, your answer, result, explanation, AI.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Item, PracticeSession } from '@shared/types.ts';
import { blankGroups, gradeItem } from '@shared/grading.ts';
import { useApp } from '../../lib/store.ts';
import { stopSpeech } from '../../lib/audio.ts';
import { Button, IconButton, Kbd, SubjectDot, isModalOpen } from '../../components/ui.tsx';
import { hasSlot } from '../../components/question/boxRefs.ts';
import { readJaFont } from './prefs.ts';
import { Icon } from '../../components/Icon.tsx';
import { RichText } from '../../components/RichText.tsx';
import { QuestionStem } from '../../components/question/QuestionStem.tsx';
import { cx } from '../../lib/format.ts';
import { isFocusedControl, isTextField } from './hotkeys.ts';
import { ChoicePad } from './ChoicePad.tsx';
import { MarkSheet } from './MarkSheet.tsx';
import { AudioPanel } from './AudioPanel.tsx';
import { CoachCard, hasCoachEntry } from './CoachCard.tsx';
import { NoteButton, NoteEditor } from './NoteBox.tsx';
import { ActionRow, ExplanationCard, ItemHeader, ListeningCaption, ListeningTitle, ReferencePeek, ResultBanner, referenceSelector, revealAnswer, revealResult, stemLayout, useScrolledAway, useScrollFade } from './parts.tsx';

export function ReviewStage({ session, list, start, onClose }: { session: PracticeSession; list: Item[]; start: number; onClose: () => void }) {
  const settings = useApp((s) => s.state!.settings);
  const progress = useApp((s) => s.state!.progress);
  const today = useApp((s) => s.today);
  const [pos, setPos] = useState(start);
  const [exOpen, setExOpen] = useState(true);
  const [gloss, setGloss] = useState(settings.showZhGloss);
  const item = list[pos];
  const ans = session.answers[item.id];
  const grade = useMemo(() => gradeItem(item, ans?.response ?? null), [item, ans]);
  const layout = useMemo(() => stemLayout(item), [item]);
  const split = layout.split;
  const groups = useMemo(() => (item.format === 'blanks' ? [...blankGroups(item)].sort((a, b) => a.localeCompare(b)) : []), [item]);
  const audioToggle = useRef<(() => void) | null>(null);
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});
  const [coachOpen, setCoachOpen] = useState<Record<string, boolean>>({});
  /** The item whose AI panel was opened just now (scrolled into view once). */
  const coachJustOpened = useRef<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const sideRef = useRef<HTMLDivElement>(null);
  const values = ans?.response && typeof ans.response === 'object' ? ans.response : {};
  const heroAudio = item.section === 'listening' && !!item.audio && !item.figures?.length;
  const answerView = ans ?? { response: null, seconds: 0, submitted: true, gaveUp: true };

  useLayoutEffect(() => {
    if (sideRef.current) sideRef.current.scrollTop = 0;
    revealAnswer(sideRef.current);
    revealResult(mainRef.current);
  }, [item.id]);

  const go = (d: number) => {
    const n = pos + d;
    if (n < 0 || n >= list.length) return;
    stopSpeech();
    setPos(n);
    setExOpen(true);
    mainRef.current?.scrollTo({ top: 0 });
  };

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey || isModalOpen() || isTextField(e.target)) return;
    if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'Escape') onClose();
    else if (e.key === 'e' || e.key === 'E') setExOpen((o) => !o);
    else if (e.key === ' ' && item.audio && !isFocusedControl(e.target)) {
      e.preventDefault();
      audioToggle.current?.();
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => {
      window.removeEventListener('keydown', h);
      stopSpeech();
    };
  }, []);

  const single = !split && (layout.short || heroAudio);
  useScrollFade(sideRef, single);
  const refAway = useScrolledAway(mainRef, referenceSelector(item), !single && exOpen, item.id);
  const result = (
    <ResultBanner
      exam={session.exam}
      review
      item={item}
      answer={answerView}
      grade={ans?.gaveUp ? { ...grade, correct: false } : grade}
      today={today}
      progress={progress[item.id]}
    />
  );
  const choicePad = item.format === 'choice' ? <ChoicePad item={item} value={typeof ans?.response === 'number' ? ans.response : null} reveal columns={single && (item.options?.length ?? 4) <= 4 ? 2 : undefined} /> : null;
  const noteShown = noteOpen[item.id] ?? !!progress[item.id]?.note;
  const coachShown = settings.coachEnabled && (coachOpen[item.id] ?? hasCoachEntry(item.id));
  const tools = (!noteShown || (settings.coachEnabled && !coachShown)) && (
    <div className="pl-tools">
      {!noteShown && <NoteButton onClick={() => setNoteOpen((m) => ({ ...m, [item.id]: true }))} />}
      {settings.coachEnabled && !coachShown && (
        <button type="button" className="pl-tool" onClick={() => {
            coachJustOpened.current = item.id;
            setCoachOpen((m) => ({ ...m, [item.id]: true }));
          }} onMouseDown={(e) => e.preventDefault()}>
          <Icon name="sparkles" size={15} />
          问 AI
        </button>
      )}
    </div>
  );
  const noteEditor = noteShown && <NoteEditor key={`n-${item.id}`} itemId={item.id} />;
  const coach = coachShown && (
    <CoachCard
      key={`c-${item.id}`}
      item={item}
      response={ans?.response ?? null}
      wasCorrect={!!ans?.correct && !ans?.gaveUp}
      variant={single ? 'card' : 'inline'}
      onClose={() => setCoachOpen((m) => ({ ...m, [item.id]: false }))}
      reveal={coachJustOpened.current === item.id}
    />
  );
  const action =
    pos < list.length - 1 ? (
      <Button variant="primary" size="lg" block={!single} onClick={() => go(1)}>
        下一题 <Kbd>→</Kbd>
      </Button>
    ) : (
      <Button variant="primary" size="lg" block={!single} onClick={onClose}>
        回到小结 <Kbd>Esc</Kbd>
      </Button>
    );
  const blank =
    layout.inline && item.format === 'choice' && hasSlot(layout.inline.passage) ? { text: item.answer !== undefined ? (item.options?.[item.answer] ?? null) : null, tone: 'right' as const } : undefined;
  const stem = (
    <QuestionStem
      item={item}
      text={split?.passage ?? layout.inline?.passage}
      prompt={layout.inline?.question}
      gloss={gloss}
      onGlossChange={setGloss}
      blank={blank}
      marks={item.format === 'blanks' ? { values, results: Object.fromEntries((grade.groups || []).map((g) => [g.group, g.correct])) } : undefined}
    />
  );
  const audio = (answerArea?: ReactNode) =>
    item.audio && (
      <AudioPanel
        key={item.id}
        audio={item.audio}
        exam={false}
        played={false}
        onPlayed={() => {}}
        toggleRef={audioToggle}
        hero={heroAudio}
        title={heroAudio ? <ListeningTitle item={item} /> : undefined}
        caption={heroAudio ? <ListeningCaption item={item} revealed /> : undefined}
        idleText="可以再听一遍，对照解析里的原文"
      >
        {answerArea}
      </AudioPanel>
    );
  const explanation = <ExplanationCard item={item} open={exOpen} onToggle={() => setExOpen((o) => !o)} />;

  return (
    <div className={cx('pl pl-review', single && 'is-single')}>
      <header className="pl-top">
        <div className="pl-top-left">
          <IconButton icon="arrowLeft" label="返回小结（Esc）" tooltipSide="bottom" onClick={onClose} />
          <div className="pl-top-title">
            <SubjectDot subject={item.subject} />
            <span className="pl-top-name">回看 · {session.title}</span>
          </div>
        </div>
        <div className="pl-top-center">
          {list.length > 1 && (
            <span className="pl-count">
              <b className="num">{pos + 1}</b>
              <span className="pl-count-of num"> / {list.length}</span>
            </span>
          )}
        </div>
        <div className="pl-top-right">
          <Button size="sm" variant="ghost" icon="left" onClick={() => go(-1)} onMouseDown={(e) => e.preventDefault()} disabled={pos === 0}>
            上一题
          </Button>
          <Button size="sm" variant="ghost" iconRight="right" onClick={() => go(1)} onMouseDown={(e) => e.preventDefault()} disabled={pos === list.length - 1}>
            下一题
          </Button>
        </div>
      </header>
      <div className="pl-body">
        {single ? (
          <main className="pl-main is-single" ref={mainRef}>
            <div className="pl-col is-single" key={item.id}>
              <ItemHeader item={item} />
              {heroAudio ? (
                audio(
                  <>
                    <div className="pl-side-label">
                      <span>你的作答</span>
                    </div>
                    {choicePad}
                  </>,
                )
              ) : (
                <article className={cx('pl-paper is-short', item.subject === 'japanese' && 'is-ja')}>
                  {stem}
                  <div className="pl-paper-answer">{choicePad}</div>
                </article>
              )}
              <ActionRow className="is-graded">
                {result}
                <div className="pl-row-end">
                  {tools}
                  {action}
                </div>
              </ActionRow>
              {noteEditor}
              {coach}
              {explanation}
            </div>
          </main>
        ) : (
          <>
            <main className="pl-main" ref={mainRef}>
              <div className="pl-col" key={item.id}>
                <ItemHeader item={item} />
                {audio()}
                <article className={cx('pl-paper', item.subject === 'japanese' && 'is-ja', split && 'is-passage', split && readJaFont() === 'mincho' && 'is-mincho')}>
                  {split && (
                    <div className="pl-paper-label">
                      <span>本文</span>
                    </div>
                  )}
                  {stem}
                </article>
                {explanation}
              </div>
            </main>
            <aside className="pl-side">
              <div className="card card-flush pl-side-card">
                <div className="pl-side-scroll" ref={sideRef}>
                  {split && (
                    <div className="pl-ask">
                      <span className="pl-ask-label">设问</span>
                      <RichText text={split.question} lang="ja" className="pl-ask-text" />
                    </div>
                  )}
                  {item.format === 'choice' && (
                    <div className="pl-side-label">
                      <span>你的作答</span>
                    </div>
                  )}
                  {item.format === 'choice' ? choicePad : <MarkSheet groups={groups} values={values} active={null} results={grade.groups} />}
                  {result}
                  {tools}
                  {noteEditor}
                  {coach}
                  {exOpen && refAway && <ReferencePeek item={item} passage={split?.passage} />}
                </div>
                <div className="pl-side-foot">{action}</div>
              </div>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
