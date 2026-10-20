// The drill itself: 看字写读音 (type the reading, no audio before answering) and
// 看词选意思 (pick the Chinese meaning). Each answer is graded and saved instantly.
// Runs full-window like the question player (see .vc-focus in vocab.css).
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { VocabEntry } from '@shared/types.ts';
import { addStudyTime, markBlock, recordVocab } from '@shared/actions.ts';
import { readingMatches } from '@shared/grading.ts';
import { useApp, update } from '../../lib/store.ts';
import { navigate } from '../../lib/router.ts';
import { stopSpeech } from '../../lib/audio.ts';
import { cx } from '../../lib/format.ts';
import { Icon } from '../../components/Icon.tsx';
import { Badge, Button, Callout, IconButton, Kbd, SubjectDot, Tooltip, isModalOpen, toast } from '../../components/ui.tsx';
import { answerCandidates, answerKana, hasRomaji, nearMissHint } from './kana.ts';
import { getRun, meaningChoice, newRun, setRun, SKILL_NAME, SKILL_TONE, splitMeaning, useRun, withRetry, type RunAnswer, type RunCard, type VocabRun } from './run.ts';
import { AudioButton, Highlighted, speak } from './parts.tsx';

const AUTOPLAY_KEY = 'eju-vocab-autoplay';

function readAutoplay(): boolean {
  try {
    return localStorage.getItem(AUTOPLAY_KEY) !== '0';
  } catch {
    return true;
  }
}

function writeAutoplay(on: boolean) {
  try {
    localStorage.setItem(AUTOPLAY_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function startRun(cards: RunCard[], date: string, title: string) {
  if (cards.length) setRun(newRun(cards, date, title));
}

/** Close the run: credit the last bit of time and tick off today's vocab block when the queue was finished. */
export function finishRun(completed: boolean) {
  const r = getRun();
  if (!r || r.finished) return;
  stopSpeech();
  const now = Date.now();
  const credit = Math.round(Math.min(30, Math.max(0, (now - r.tickAt) / 1000)));
  if (!r.results.length) {
    setRun(null);
    return;
  }
  let closed = false;
  update((d, _bank, today) => {
    addStudyTime(d, null, credit, today);
    if (!completed) return;
    const b = d.plans[today]?.blocks.find((x) => x.kind === 'vocab' && x.status !== 'done');
    if (!b) return;
    markBlock(d, b.id, 'done', new Date(now));
    const first = r.results.filter((x) => !x.retry);
    b.result = { answered: first.length, correct: first.filter((x) => x.correct).length, seconds: Math.round(r.seconds + credit) };
    closed = true;
  });
  setRun({ ...r, finished: true, completed, closedBlock: closed, seconds: r.seconds + credit, tickAt: now });
}

function isTyping(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
}

/** Top-bar controls should not keep focus after a click (Enter would press them again). */
const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();

/**
 * Full-window top bar shared by the run and its summary, the question player's pattern:
 * back · subject dot + title │ centre │ right, with the run's progress as a line on its bottom edge.
 */
export function VocabTopBar({ title, onBack, backLabel, center, right, progress }: { title: string; onBack: () => void; backLabel: string; center?: ReactNode; right?: ReactNode; progress?: ReactNode }) {
  return (
    <header className="vc-top">
      <div className="vc-top-left">
        <IconButton icon="arrowLeft" label={backLabel} onClick={onBack} onMouseDown={keepFocus} tooltipSide="bottom" />
        <div className="vc-top-title">
          <SubjectDot subject="japanese" />
          <span className="vc-top-name">{title}</span>
        </div>
      </div>
      <div className="vc-top-center">{center}</div>
      <div className="vc-top-right">{right}</div>
      {progress}
    </header>
  );
}

/** First-pass cards fill the line; retries of missed cards get their own striped segment after it. */
function RunProgress({ run }: { run: VocabRun }) {
  const first = run.cards.filter((c) => !c.retry).length;
  const retries = run.cards.length - first;
  const firstDone = run.results.filter((x) => !x.retry).length;
  const retryDone = run.results.length - firstDone;
  return (
    <div className="vc-progress" role="progressbar" aria-label="本轮进度" aria-valuenow={firstDone} aria-valuemin={0} aria-valuemax={first}>
      <div className="vc-progress-main">
        <i style={{ width: `${(firstDone / Math.max(1, first)) * 100}%` }} />
      </div>
      {retries > 0 && (
        <div className="vc-progress-retry" style={{ width: `clamp(24px, ${retries * 10}px, 18%)` }}>
          <i style={{ width: `${(retryDone / retries) * 100}%` }} />
        </div>
      )}
    </div>
  );
}

export function VocabSession() {
  const run = useRun();
  const bank = useApp((s) => s.bank);
  const rate = useApp((s) => s.state?.settings.pronunciationRate ?? 1);
  const [autoplay, setAutoplay] = useState(readAutoplay);
  const stageRef = useRef<HTMLDivElement>(null);
  const shownAt = useRef(performance.now());

  const card = run ? run.cards[run.index] : undefined;
  const v = card && bank ? bank.vocabById.get(card.vocabId) : undefined;
  const cardKey = run ? `${run.id}:${run.index}` : '';

  useEffect(() => {
    shownAt.current = performance.now();
    // A meaning card starts with nothing focused-looking: focus the card itself (the read card
    // focuses its input). Option rings appear only once the learner tabs or uses arrows.
    if (getRun()?.cards[getRun()!.index]?.skill === 'meaning') stageRef.current?.focus({ preventScroll: true });
    document.querySelector('.main')?.scrollTo({ top: 0 });
  }, [cardKey]);

  // Time away from the page is not study time: restart the clock on return, credit a little on leave.
  useEffect(() => {
    const r = getRun();
    if (r && !r.finished) setRun({ ...r, tickAt: Date.now() });
    return () => {
      const cur = getRun();
      if (!cur || cur.finished) return;
      const credit = Math.round(Math.min(60, Math.max(0, (Date.now() - cur.tickAt) / 1000)));
      if (credit > 0) update((d, _b, today) => addStudyTime(d, null, credit, today));
      setRun({ ...cur, seconds: cur.seconds + credit, tickAt: Date.now() });
      stopSpeech();
    };
  }, []);

  // A card whose word vanished from the bank is skipped silently.
  useEffect(() => {
    if (run && !run.finished && card && bank && !v) {
      if (run.index + 1 >= run.cards.length) finishRun(true);
      else setRun({ ...run, index: run.index + 1, current: null });
    }
  }, [run, card, bank, v]);

  const answer = (a: RunAnswer) => {
    const r = getRun();
    if (!r || r.current || !card || !v) return;
    const now = Date.now();
    const seconds = Math.max(0.5, (performance.now() - shownAt.current) / 1000);
    const credit = Math.round(Math.min(90, Math.max(0, (now - r.tickAt) / 1000)));
    update((d, _bank, today) => {
      recordVocab(d, { vocabId: v.id, skill: card.skill, correct: a.correct, response: a.response, seconds, date: today });
      addStudyTime(d, null, credit, today);
    });
    setRun({
      ...r,
      current: a,
      cards: !a.correct && !card.retry ? withRetry(r) : r.cards,
      results: [...r.results, { ...a, vocabId: v.id, skill: card.skill, retry: !!card.retry, seconds }],
      seconds: r.seconds + credit,
      tickAt: now,
    });
    if (autoplay && v.audio?.word) speak(v.audio.word, rate, { quiet: true });
    requestAnimationFrame(() => stageRef.current?.focus({ preventScroll: true }));
  };

  const next = () => {
    const r = getRun();
    if (!r || !r.current) return;
    stopSpeech();
    if (r.index + 1 >= r.cards.length) finishRun(true);
    else setRun({ ...r, index: r.index + 1, current: null });
  };

  // ← leaves the run where it is (it resumes on the 词汇 page); an untouched run is dropped.
  const leave = () => {
    const r = getRun();
    if (r && !r.results.length) setRun(null);
    else toast('这一轮先放着，回到词汇就能接着练', 'success');
    navigate('/');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.repeat || e.metaKey || e.ctrlKey || e.altKey || isModalOpen() || isTyping(e.target)) return;
      const r = getRun();
      if (!r || r.finished || !v) return;
      if (r.current) {
        if (e.key === 'Enter' || e.key === 'ArrowRight') {
          e.preventDefault();
          next();
        } else if (e.key === ' ') {
          e.preventDefault();
          speak(v.audio?.word, rate);
        } else if (e.key.toLowerCase() === 'e' && v.audio?.example) {
          e.preventDefault();
          speak(v.audio.example, rate);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!run || !card || !v || !bank) return null;

  const firstTotal = run.cards.filter((c) => !c.retry).length;
  const retryTotal = run.cards.length - firstTotal;
  const firstTries = run.results.filter((x) => !x.retry);
  const right = firstTries.filter((x) => x.correct).length;
  const wrong = firstTries.length - right;
  const pos = Math.max(1, Math.min(firstTotal, firstTries.length + (!card.retry && !run.current ? 1 : 0)));
  const wordLen = [...v.word].length;
  const last = run.index + 1 >= run.cards.length;

  return (
    <div className="vc-focus">
      <VocabTopBar
        title={run.title}
        onBack={leave}
        backLabel="离开（这一轮会保留）"
        progress={<RunProgress run={run} />}
        center={
          <span className="vc-count">
            <b className="num">{pos}</b>
            <span className="vc-count-of num"> / {firstTotal}</span>
          </span>
        }
        right={
          <>
            {retryTotal > 0 && (
              <Tooltip label="答错的词这一轮稍后再问一次，不算进总数" side="bottom">
                <span className="vc-retry-chip" tabIndex={-1}>
                  <span className="num">+{retryTotal}</span> 重练
                </span>
              </Tooltip>
            )}
            <Tooltip label="本轮第一次作答：答对 · 答错" side="bottom">
              <span className="vc-tally" tabIndex={-1}>
                <span className="vc-tally-ok">
                  <Icon name="check" size={14} />
                  <b className="num">{right}</b>
                </span>
                <span className="vc-tally-bad">
                  <Icon name="x" size={14} />
                  <b className="num">{wrong}</b>
                </span>
              </span>
            </Tooltip>
            <IconButton
              icon="volume"
              size="sm"
              label={autoplay ? '答完自动朗读：开' : '答完自动朗读：关'}
              tooltipSide="bottom"
              active={autoplay}
              onMouseDown={keepFocus}
              onClick={() => {
                writeAutoplay(!autoplay);
                setAutoplay(!autoplay);
              }}
            />
            <Button variant="ghost" size="sm" icon="flag" onClick={() => finishRun(false)} onMouseDown={keepFocus}>
              结束
            </Button>
          </>
        }
      />

      <div className="vc-focus-body">
        <div
          className={cx('vc-stage', run.current && (run.current.correct ? 'is-right' : 'is-wrong'))}
          ref={stageRef}
          tabIndex={-1}
          key={cardKey}
          aria-label={`${SKILL_NAME[card.skill]}：${v.word}`}
        >
          <div className="vc-stage-tags">
            <Badge tone={SKILL_TONE[card.skill]} icon={card.skill === 'read' ? 'pen' : 'list'}>
              {SKILL_NAME[card.skill]}
            </Badge>
            {card.retry && (
              <Badge tone="warning" icon="refresh">
                再练一次
              </Badge>
            )}
          </div>

          <div className={cx('vc-word', wordLen > 5 ? 'is-long' : wordLen > 3 && 'is-mid')} lang="ja">
            {v.word}
          </div>
          {card.skill === 'read' ? (
            <ReadInput v={v} answered={run.current} onAnswer={answer} />
          ) : (
            <MeaningOptions v={v} date={run.date} retry={!!card.retry} answered={run.current} onAnswer={answer} />
          )}

          {run.current && (
            <>
              <Reveal v={v} card={card} a={run.current} />
              <footer className="vc-stage-foot">
                <span className="vc-keys">
                  <Kbd>Space</Kbd> 读音
                  {v.audio?.example && (
                    <>
                      <Kbd>E</Kbd> 例句
                    </>
                  )}
                </span>
                <Button variant="primary" size="lg" iconRight="arrowRight" onClick={next}>
                  {last ? '完成' : '下一个'}
                  <Kbd>Enter</Kbd>
                </Button>
              </footer>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ReadInput({ v, answered, onAnswer }: { v: VocabEntry; answered: RunAnswer | null; onAnswer: (a: RunAnswer) => void }) {
  const [text, setText] = useState('');
  const [shake, setShake] = useState(false);
  const composing = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const kana = hasRomaji(text) ? answerKana(text) : '';

  useEffect(() => {
    if (!answered) inputRef.current?.focus({ preventScroll: true });
  }, [answered]);

  const submit = () => {
    const raw = text.trim();
    if (!raw) {
      setShake(true);
      setTimeout(() => setShake(false), 320);
      inputRef.current?.focus();
      return;
    }
    const options = answerCandidates(raw);
    const hit = options.find((k) => readingMatches(k, v.reading, v.altReadings));
    onAnswer({ correct: !!hit, response: hit ?? options[0], typed: raw });
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    // Japanese IME: Enter that confirms a conversion must not submit (Safari reports keyCode 229).
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || composing.current || e.keyCode === 229) return;
    e.preventDefault();
    submit();
  };

  if (answered) {
    const hint = answered.correct ? null : nearMissHint(answered.response, v.reading, v.altReadings);
    return (
      <div className={cx('vc-typed', answered.correct ? 'is-right' : 'is-wrong')}>
        {answered.typed ? (
          <span className="vc-typed-text" lang="ja">
            {answered.correct ? answered.response : <s>{answered.response}</s>}
          </span>
        ) : (
          <span className="vc-typed-text vc-typed-skip">没有作答</span>
        )}
        {hint && <span className="vc-typed-hint">{hint}</span>}
      </div>
    );
  }

  return (
    <>
      <div className="vc-read">
        <div className={cx('vc-input-wrap', shake && 'is-shake')}>
          <input
            ref={inputRef}
            className="vc-input"
            lang="ja"
            value={text}
            placeholder="写出读音"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="读音（假名或罗马字）"
            onChange={(e) => setText(e.target.value)}
            onCompositionStart={() => (composing.current = true)}
            onCompositionEnd={() => {
              // keydown for the confirming Enter can arrive right after compositionend.
              setTimeout(() => (composing.current = false), 0);
            }}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="vc-romaji" aria-live="polite">
          {kana ? (
            <>
              按假名判：<span lang="ja">{kana}</span>
            </>
          ) : (
            '用日语输入法打假名，或直接打罗马字'
          )}
        </div>
      </div>
      <footer className="vc-stage-foot">
        <span className="vc-keys">
          <Kbd>Enter</Kbd> 确认
        </span>
        <span className="vc-foot-actions">
          <Button variant="ghost" size="lg" onClick={() => onAnswer({ correct: false, response: '', typed: '' })}>
            不会，看答案
          </Button>
          <Button variant="primary" size="lg" icon="check" onClick={submit} disabled={!text.trim()}>
            确认
          </Button>
        </span>
      </footer>
    </>
  );
}

const GRID_CHARS = 18;

function MeaningOptions({ v, date, retry, answered, onAnswer }: { v: VocabEntry; date: string; retry: boolean; answered: RunAnswer | null; onAnswer: (a: RunAnswer) => void }) {
  const bank = useApp((s) => s.bank);
  const choice = useMemo(() => (bank ? meaningChoice(bank, v, date, retry ? 'retry' : '') : null), [bank, v, date, retry]);
  const listRef = useRef<HTMLDivElement>(null);

  const pick = (i: number) => {
    if (!choice || answered) return;
    if (i < 0) onAnswer({ correct: false, response: '', choice: -1 });
    else onAnswer({ correct: i === choice.answer, response: choice.options[i].vocabId, choice: i });
  };

  useEffect(() => {
    if (answered || !choice) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey || isModalOpen() || isTyping(e.target)) return;
      if (/^[1-4]$/.test(e.key) && Number(e.key) <= choice.options.length) {
        e.preventDefault();
        pick(Number(e.key) - 1);
      } else if (e.key === '0') {
        e.preventDefault();
        pick(-1);
      } else if (e.key.startsWith('Arrow')) {
        // Arrows move between the options (2 × 2 on wide windows, a column otherwise).
        const btns = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('.vc-option') ?? [])];
        if (!btns.length) return;
        const at = btns.indexOf(document.activeElement as HTMLButtonElement);
        const cols = listRef.current && getComputedStyle(listRef.current).gridTemplateColumns.split(' ').length > 1 ? 2 : 1;
        const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -cols : cols;
        const to = at < 0 ? 0 : Math.max(0, Math.min(btns.length - 1, at + step));
        e.preventDefault();
        btns[to].focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!choice) return null;
  // Four short glosses fit one line each in two columns; otherwise one option per row.
  const grid = choice.options.every((o) => [...o.text].length <= GRID_CHARS);
  return (
    <>
      <div className={cx('vc-options', grid && 'is-grid')} ref={listRef}>
        {choice.options.map((o, i) => {
          const isAnswer = i === choice.answer;
          const chosen = answered?.choice === i;
          return (
            <button
              key={o.vocabId}
              type="button"
              className={cx('vc-option', answered && isAnswer && 'is-right', answered && chosen && !isAnswer && 'is-wrong', answered && !isAnswer && !chosen && 'is-dim')}
              onClick={() => pick(i)}
              disabled={!!answered}
            >
              <span className="vc-option-key num">{i + 1}</span>
              <span className="vc-option-text">{o.text}</span>
              {answered && isAnswer && <Icon name="check" size={18} className="vc-option-mark" />}
              {answered && chosen && !isAnswer && <Icon name="x" size={18} className="vc-option-mark" />}
            </button>
          );
        })}
      </div>
      {!answered && (
        <footer className="vc-stage-foot">
          <span className="vc-keys">
            <Kbd>1</Kbd>–<Kbd>4</Kbd> 选择
          </span>
          <Button variant="ghost" size="lg" onClick={() => pick(-1)}>
            不认识这个词
            <Kbd>0</Kbd>
          </Button>
        </footer>
      )}
    </>
  );
}

function Reveal({ v, card, a }: { v: VocabEntry; card: RunCard; a: RunAnswer }) {
  const alts = v.altReadings?.filter((x) => x !== v.reading) ?? [];
  const { pos, text } = splitMeaning(v.meaningZh);
  const title = a.correct ? (card.retry ? '这次对了' : '答对了') : card.retry ? '还是不太熟，明天再见' : card.skill === 'read' ? '读音记一下' : '意思记一下';
  return (
    <div className="vc-reveal">
      <div className={cx('vc-verdict', a.correct ? 'tone-success' : 'tone-danger')} role="status">
        <span className="vc-verdict-icon">
          <Icon name={a.correct ? 'check' : 'x'} size={16} />
        </span>
        <span className="vc-verdict-title">{title}</span>
        <span className="vc-verdict-answer">
          {/* A right reading already shows in green above; repeating it would only echo. */}
          {!(card.skill === 'read' && a.correct && a.response === v.reading) && (
            <span className="vc-reading" lang="ja">
              {v.reading}
            </span>
          )}
          {alts.length > 0 && (
            <span className="vc-alt" lang="ja">
              也读 {alts.join('・')}
            </span>
          )}
          <AudioButton src={v.audio?.word} size="sm" />
        </span>
      </div>
      <p className="vc-meaning vc-def">
        {pos && <span className="vc-pos">{pos}</span>}
        {text}
      </p>
      {v.trapZh && (
        <Callout tone="warning" icon="alert" className="vc-trap">
          {v.trapZh}
        </Callout>
      )}
      {v.example && (
        <div className="vc-example">
          <div className="vc-example-ja" lang="ja">
            <span className="vc-example-text">
              <Highlighted text={v.example.ja} word={v.word} />
            </span>
            <AudioButton src={v.audio?.example} size="sm" label="例句" />
          </div>
          {v.example.zh && <p className="vc-example-zh">{v.example.zh}</p>}
        </div>
      )}
    </div>
  );
}
