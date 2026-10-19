// The drill itself: 看字写读音 (type the reading, no audio before answering) and
// 看词选意思 (pick the Chinese meaning). Each answer is graded and saved instantly.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { VocabEntry } from '@shared/types.ts';
import { addStudyTime, markBlock, recordVocab } from '@shared/actions.ts';
import { readingMatches } from '@shared/grading.ts';
import { useApp, update } from '../../lib/store.ts';
import { stopSpeech } from '../../lib/audio.ts';
import { cx } from '../../lib/format.ts';
import { Icon } from '../../components/Icon.tsx';
import { Badge, Button, IconButton, Kbd, Progress, isModalOpen } from '../../components/ui.tsx';
import { answerCandidates, answerKana, hasRomaji, nearMissHint } from './kana.ts';
import { getRun, meaningChoice, newRun, setRun, SKILL_LABEL, useRun, withRetry, type RunAnswer, type RunCard } from './run.ts';
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

  const total = run.cards.length;
  const done = run.index + (run.current ? 1 : 0);
  const firstTries = run.results.filter((x) => !x.retry);
  const right = firstTries.filter((x) => x.correct).length;
  const wrong = firstTries.length - right;
  const wordLen = [...v.word].length;
  const retriesLeft = run.cards.slice(run.index + 1).filter((c) => c.retry).length;

  return (
    <div className="vc-session">
      <header className="vc-topbar">
        <Button variant="ghost" size="sm" icon="arrowLeft" onClick={() => finishRun(false)}>
          结束本轮
        </Button>
        <div className="vc-topbar-mid">
          <span className="vc-count num">
            {Math.min(done + (run.current ? 0 : 1), total)}
            <span className="faint"> / {total}</span>
          </span>
          <Progress value={done / total} size="sm" className="vc-topbar-progress" />
        </div>
        <div className="vc-topbar-right">
          <span className="vc-tally" title="本轮首次作答">
            <span className="vc-tally-ok">
              <Icon name="check" size={14} />
              <b className="num">{right}</b>
            </span>
            <span className="vc-tally-bad">
              <Icon name="x" size={14} />
              <b className="num">{wrong}</b>
            </span>
          </span>
          <IconButton
            icon="volume"
            size="sm"
            label={autoplay ? '答完自动朗读：开' : '答完自动朗读：关'}
            active={autoplay}
            onClick={() => {
              writeAutoplay(!autoplay);
              setAutoplay(!autoplay);
            }}
          />
        </div>
      </header>

      <div className={cx('vc-stage', run.current && (run.current.correct ? 'is-right' : 'is-wrong'))} ref={stageRef} tabIndex={-1} key={cardKey}>
        <div className="vc-stage-tags">
          <Badge tone={card.skill === 'read' ? 'primary' : 'japanese'} icon={card.skill === 'read' ? 'pen' : 'list'}>
            {card.skill === 'read' ? '看字写读音' : '看词选意思'}
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
        {card.skill === 'read' ? <ReadInput v={v} answered={run.current} onAnswer={answer} /> : <MeaningOptions v={v} date={run.date} retry={!!card.retry} answered={run.current} onAnswer={answer} />}

        {run.current && <Reveal v={v} card={card} a={run.current} />}

        <footer className="vc-stage-foot">
          {run.current ? (
            <>
              <span className="vc-keys faint">
                <Kbd>Space</Kbd> 读音 {v.audio?.example && <><Kbd>E</Kbd> 例句</>}
              </span>
              <Button variant="primary" size="lg" iconRight="arrowRight" onClick={next}>
                {run.index + 1 >= total ? '完成' : '下一个'}
                <Kbd>Enter</Kbd>
              </Button>
            </>
          ) : (
            <span className="vc-keys faint">
              {card.skill === 'read' ? (
                <>
                  用日语输入法打假名，或直接打罗马字 · <Kbd>Enter</Kbd> 确认
                </>
              ) : (
                <>
                  <Kbd>1</Kbd>–<Kbd>4</Kbd> 选择 · <Kbd>0</Kbd> 不认识
                </>
              )}
            </span>
          )}
        </footer>
      </div>

      <p className="vc-session-note faint">
        {retriesLeft > 0 ? `答错的 ${retriesLeft} 个会在本轮稍后再问一次。` : '读音和词义分开记录，答错的会在本轮稍后再问一次。'}
      </p>
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
            <span className="faint">按假名判：</span>
            <span lang="ja">{kana}</span>
          </>
        ) : (
          <span className="faint">&nbsp;</span>
        )}
      </div>
      <div className="vc-read-actions">
        <Button variant="ghost" onClick={() => onAnswer({ correct: false, response: '', typed: '' })}>
          不会，看答案
        </Button>
        <Button variant="primary" icon="check" onClick={submit} disabled={!text.trim()}>
          确认
        </Button>
      </div>
    </div>
  );
}

function MeaningOptions({ v, date, retry, answered, onAnswer }: { v: VocabEntry; date: string; retry: boolean; answered: RunAnswer | null; onAnswer: (a: RunAnswer) => void }) {
  const bank = useApp((s) => s.bank);
  const choice = useMemo(() => (bank ? meaningChoice(bank, v, date, retry ? 'retry' : '') : null), [bank, v, date, retry]);

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
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!choice) return null;
  return (
    <div className="vc-options">
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
      {!answered && (
        <button type="button" className="vc-option-skip" onClick={() => pick(-1)}>
          不认识这个词
        </button>
      )}
    </div>
  );
}

function Reveal({ v, card, a }: { v: VocabEntry; card: RunCard; a: RunAnswer }) {
  const alts = v.altReadings?.filter((x) => x !== v.reading) ?? [];
  return (
    <div className="vc-reveal">
      <div className={cx('vc-verdict', a.correct ? 'is-right' : 'is-wrong')}>
        <Icon name={a.correct ? 'checkCircle' : 'xCircle'} size={18} />
        <span>{a.correct ? (card.retry ? '这次对了' : '答对了') : card.retry ? '还是不太熟，明天再见' : card.skill === 'read' ? '读音记一下' : '意思记一下'}</span>
        <span className="vc-verdict-skill faint">{SKILL_LABEL[card.skill]}</span>
      </div>
      <div className="vc-reveal-main">
        <div className="vc-reveal-reading">
          <span className="vc-reading" lang="ja">
            {v.reading}
          </span>
          {alts.length > 0 && (
            <span className="faint text-sm" lang="ja">
              也读 {alts.join('・')}
            </span>
          )}
          <AudioButton src={v.audio?.word} size="sm" />
        </div>
        {card.skill === 'read' && <p className="vc-meaning">{v.meaningZh}</p>}
        {v.trapZh && (
          <div className="vc-trap">
            <Icon name="alert" size={15} />
            <span>{v.trapZh}</span>
          </div>
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
    </div>
  );
}
