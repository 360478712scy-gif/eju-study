// Read-only look at a finished item from the summary: question, your answer, result, explanation, AI.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Item, PracticeSession } from '@shared/types.ts';
import { blankGroups, gradeItem } from '@shared/grading.ts';
import { useApp } from '../../lib/store.ts';
import { stopSpeech } from '../../lib/audio.ts';
import { Button, IconButton, Kbd, SubjectTag, isModalOpen } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import { RichText } from '../../components/RichText.tsx';
import { QuestionStem } from '../../components/question/QuestionStem.tsx';
import { cx } from '../../lib/format.ts';
import { isFocusedControl, isTextField } from './hotkeys.ts';
import { ChoicePad } from './ChoicePad.tsx';
import { MarkSheet } from './MarkSheet.tsx';
import { AudioPanel } from './AudioPanel.tsx';
import { CoachCard } from './CoachCard.tsx';
import { NoteBox } from './NoteBox.tsx';
import { ExplanationCard, ItemHeader, ListeningCaption, ListeningTitle, ResultBanner, stemLayout } from './parts.tsx';

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
  const groups = useMemo(() => (item.format === 'blanks' ? blankGroups(item) : []), [item]);
  const audioToggle = useRef<(() => void) | null>(null);
  const coachFocus = useRef<(() => void) | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const values = ans?.response && typeof ans.response === 'object' ? ans.response : {};
  const heroAudio = item.section === 'listening' && !!item.audio && !item.figures?.length;
  const answerView = ans ?? { response: null, seconds: 0, submitted: true, gaveUp: true };

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

  return (
    <div className="pl pl-review">
      <header className="pl-top">
        <div className="pl-top-left">
          <IconButton icon="arrowLeft" label="返回小结（Esc）" onClick={onClose} />
          <div className="pl-top-title">
            <span className="pl-top-name">回看 · {session.title}</span>
            <span className="pl-top-meta">
              <SubjectTag subject={item.subject} size="sm" />
            </span>
          </div>
        </div>
        <div className="pl-top-center" />
        <div className="pl-top-right">
          <Button size="sm" variant="ghost" icon="left" onClick={() => go(-1)} disabled={pos === 0}>
            上一题
          </Button>
          <span className="pl-count">
            <b className="num">{pos + 1}</b> / <span className="num">{list.length}</span>
          </span>
          <Button size="sm" variant="ghost" iconRight="right" onClick={() => go(1)} disabled={pos === list.length - 1}>
            下一题
          </Button>
        </div>
      </header>
      <div className="pl-body">
        <main className="pl-main" ref={mainRef}>
          <div className={cx('pl-col', layout.short && 'is-short')} key={item.id}>
            <ItemHeader item={item} />
            {item.audio && (
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
              />
            )}
            {!heroAudio && <article className={cx('pl-paper', item.subject === 'japanese' && 'is-ja', split && 'is-passage', layout.short && 'is-short')}>
              {split && <div className="pl-paper-label">本文</div>}
              <QuestionStem
                item={item}
                text={split?.passage ?? layout.inline?.passage}
                prompt={layout.inline?.question}
                gloss={gloss}
                onGlossChange={setGloss}
                marks={item.format === 'blanks' ? { values, results: Object.fromEntries((grade.groups || []).map((g) => [g.group, g.correct])) } : undefined}
              />
            </article>}
            <ExplanationCard item={item} open={exOpen} onToggle={() => setExOpen((o) => !o)} />
            {settings.coachEnabled && <CoachCard key={`c-${item.id}`} item={item} response={ans?.response ?? null} wasCorrect={!!ans?.correct} focusRef={coachFocus} />}
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
                  <span>你的作答</span>
                </div>
              )
            )}
            {item.format === 'choice' ? (
              <ChoicePad item={item} value={typeof ans?.response === 'number' ? ans.response : null} reveal />
            ) : (
              <MarkSheet groups={groups} values={values} active={null} results={grade.groups} />
            )}
            <div className="pl-tools">
              <NoteBox key={item.id} itemId={item.id} />
              {settings.coachEnabled && (
                <button type="button" className="pl-tool" onClick={() => coachFocus.current?.()}>
                  <Icon name="sparkles" size={15} />
                  问 AI
                </button>
              )}
            </div>
          </div>
          <div className="pl-side-foot">
            <ResultBanner exam={session.exam} item={item} answer={answerView} grade={ans?.gaveUp ? { ...grade, correct: false } : grade} today={today} progress={progress[item.id]} />
            {pos < list.length - 1 ? (
              <Button variant="primary" size="lg" block onClick={() => go(1)}>
                下一题 <Kbd>→</Kbd>
              </Button>
            ) : (
              <Button variant="primary" size="lg" block onClick={onClose}>
                回到小结 <Kbd>Esc</Kbd>
              </Button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
