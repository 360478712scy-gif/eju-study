// Small building blocks shared by the vocab views.
import { Fragment, useSyncExternalStore } from 'react';
import type { VocabSkillProgress } from '@shared/types.ts';
import { VOCAB_MAX_BOX } from '@shared/srs.ts';
import { useApp } from '../../lib/store.ts';
import { onSpeechChange, playSpeech, speechElement, stopSpeech } from '../../lib/audio.ts';
import { cx } from '../../lib/format.ts';
import { Icon } from '../../components/Icon.tsx';
import { toast, Tooltip } from '../../components/ui.tsx';
import { REMEMBERED_BOX } from './run.ts';

function isPlaying(src: string | undefined): boolean {
  const el = speechElement();
  return !!src && !!el && !el.paused && !el.ended && el.src.endsWith(src);
}

export function useSpeaking(src: string | undefined): boolean {
  return useSyncExternalStore(onSpeechChange, () => isPlaying(src));
}

/** Play a word / example clip at the learner's pronunciation rate (a second press stops it). */
export function speak(src: string | undefined, rate: number, opts: { quiet?: boolean } = {}) {
  if (!src) return;
  if (isPlaying(src) && !opts.quiet) {
    stopSpeech();
    return;
  }
  playSpeech(src, { rate }).catch((e: unknown) => {
    // Interrupted by the next clip / next card: not a failure.
    if (opts.quiet || (e instanceof DOMException && e.name === 'AbortError')) return;
    toast('音频没能播放，再点一次试试', 'warning');
  });
}

export function AudioButton({ src, label, size = 'md' }: { src: string | undefined; label?: string; size?: 'sm' | 'md' | 'lg' }) {
  const rate = useApp((s) => s.state?.settings.pronunciationRate ?? 1);
  const playing = useSpeaking(src);
  if (!src) return null;
  const button = (
    <button
      type="button"
      className={cx('vc-audio', `vc-audio-${size}`, playing && 'is-playing', !label && 'is-round')}
      onClick={() => speak(src, rate)}
      aria-label={label ? `播放${label}` : '播放'}
    >
      <Icon name={playing ? 'pause' : 'volume'} size={size === 'lg' ? 20 : size === 'sm' ? 14 : 16} />
      {label && <span>{label}</span>}
    </button>
  );
  // A labelled button says what it plays; a round one gets the shared tooltip, never a native title.
  return label ? button : <Tooltip label="播放">{button}</Tooltip>;
}

/** Five-step Leitner meter for one skill: filled steps neutral while learning, green once 已记住
 *  (level 2+), an amber first step when the last answer was wrong (due again, not a failure mark). */
export function Meter({ p, label }: { p: VocabSkillProgress | undefined; label?: string }) {
  const state = !p ? 'none' : !p.lastCorrect ? 'weak' : p.box >= REMEMBERED_BOX ? 'known' : 'grow';
  const title = !p ? `${label ?? ''}未学` : `${label ?? ''} 第 ${p.box}/${VOCAB_MAX_BOX} 级 · 练过 ${p.seen} 次${!p.lastCorrect ? ' · 上次答错' : state === 'known' ? ' · 已记住' : ''}`;
  return (
    <span className={cx('vc-meter', `is-${state}`)} role="img" aria-label={title}>
      {label && <span className="vc-meter-label">{label}</span>}
      <span className="vc-meter-bars">
        {Array.from({ length: VOCAB_MAX_BOX }, (_, i) => (
          <i key={i} className={cx(p && i < p.box && 'on')} />
        ))}
      </span>
    </span>
  );
}

/** Example sentence with the word (or its stem, for conjugated verbs) highlighted. */
export function Highlighted({ text, word }: { text: string; word: string }) {
  let needle = word;
  if (!text.includes(needle)) {
    const stem = word.replace(/[ぁ-ん]+$/, '');
    needle = stem && stem !== word && text.includes(stem) ? stem : '';
  }
  if (!needle) return <>{text}</>;
  const parts = text.split(needle);
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {p}
          {i < parts.length - 1 && <mark className="vc-mark">{needle}</mark>}
        </Fragment>
      ))}
    </>
  );
}
