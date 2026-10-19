// Listening player on top of lib/audio.ts: play/pause, progress, speed.
// Exam sessions play each clip once, at normal speed, without seeking.
import { useEffect, useRef, useState, type MouseEvent, type RefObject } from 'react';
import type { AudioRef } from '@shared/types.ts';
import { onSpeechChange, playSpeech, speechElement, stopSpeech } from '../../lib/audio.ts';
import { Icon } from '../../components/Icon.tsx';
import { Kbd, Segmented, toast } from '../../components/ui.tsx';
import { cx, fmtClock } from '../../lib/format.ts';

const RATES = ['0.85', '1', '1.15'] as const;
type Rate = (typeof RATES)[number];

export function AudioPanel({
  audio,
  exam,
  played,
  onPlayed,
  toggleRef,
}: {
  audio: AudioRef;
  exam: boolean;
  /** Exam: this clip has already been played through. */
  played: boolean;
  onPlayed: () => void;
  /** The player calls this for the Space shortcut. */
  toggleRef: RefObject<(() => void) | null>;
}) {
  const start = audio.start ?? 0;
  const [rate, setRate] = useState<Rate>('1');
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [ended, setEnded] = useState(false);
  const [loading, setLoading] = useState(false);
  const el = useRef<HTMLAudioElement | null>(null);
  const playedRef = useRef(onPlayed);
  playedRef.current = onPlayed;

  // Read the clip length up front (metadata only).
  useEffect(() => {
    const probe = new Audio();
    probe.preload = 'metadata';
    const done = () => {
      if (Number.isFinite(probe.duration)) setDuration((audio.end ?? probe.duration) - start);
    };
    probe.addEventListener('loadedmetadata', done);
    probe.src = audio.src;
    return () => {
      probe.removeEventListener('loadedmetadata', done);
      probe.src = '';
    };
  }, [audio.src, audio.end, start]);

  // Follow play/pause from the shared speech channel (window hide pauses it too).
  useEffect(() => {
    const sync = () => {
      const mine = !!el.current && speechElement() === el.current;
      setPlaying(mine && !el.current!.paused);
    };
    const off = onSpeechChange(sync);
    return () => {
      off();
      if (el.current && speechElement() === el.current) stopSpeech();
    };
  }, []);

  // Smooth progress while playing; stop at the clip end.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      const a = el.current;
      if (a) {
        const t = a.currentTime - start;
        setPos(t);
        if (audio.end !== undefined && a.currentTime >= audio.end) {
          a.pause();
          setEnded(true);
          playedRef.current();
          return;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, start, audio.end]);

  const begin = async (at = 0) => {
    setLoading(true);
    try {
      const a = await playSpeech(audio.src, { rate: exam ? 1 : Number(rate), start: start + at });
      el.current = a;
      setEnded(false);
      a.addEventListener('ended', () => {
        setEnded(true);
        setPos((audio.end ?? a.duration) - start);
        playedRef.current();
      });
      a.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(a.duration)) setDuration((audio.end ?? a.duration) - start);
      });
      setPlaying(true);
    } catch {
      toast('音频暂时无法播放', 'danger');
    } finally {
      setLoading(false);
    }
  };

  const locked = exam && (played || ended);
  const ours = () => !!el.current && speechElement() === el.current;

  const toggle = () => {
    if (loading) return;
    const a = ours() ? el.current : null;
    if (a && !a.paused) {
      if (exam) return; // exam: no pausing on purpose
      a.pause();
      return;
    }
    if (a && a.paused && !ended) {
      void a.play();
      return;
    }
    if (locked) return;
    void begin(0);
  };
  toggleRef.current = toggle;

  const seek = (e: MouseEvent<HTMLDivElement>) => {
    if (exam || !duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const at = frac * duration;
    if (ours() && el.current) {
      el.current.currentTime = start + at;
      setPos(at);
      setEnded(false);
      if (el.current.paused) void el.current.play();
    } else void begin(at);
  };

  const changeRate = (r: Rate) => {
    setRate(r);
    if (ours() && el.current) el.current.playbackRate = Number(r);
  };

  const frac = duration ? Math.min(1, pos / duration) : 0;
  const status = playing ? '正在播放' : ended ? (exam ? '已播放完毕' : '播放结束') : pos > 0 ? '已暂停' : exam ? '准备好后开始播放' : '听完再作答';

  return (
    <div className={cx('pl-audio', playing && 'is-playing', locked && 'is-locked')}>
      <button
        type="button"
        className="pl-audio-btn"
        onClick={toggle}
        disabled={(locked && !playing) || (exam && playing)}
        aria-label={playing ? '暂停' : '播放'}
        data-hotkeys
      >
        {loading ? <span className="spinner" style={{ width: 20, height: 20 }} /> : <Icon name={playing ? (exam ? 'volume' : 'pause') : ended && !exam ? 'refresh' : 'play'} size={22} />}
      </button>
      <div className="pl-audio-main">
        <div className="pl-audio-top">
          <span className="pl-audio-status">
            <Icon name="headphones" size={14} />
            {status}
          </span>
          <span className="pl-audio-time num">
            {fmtClock(pos)} / {duration ? fmtClock(duration) : '–:––'}
          </span>
        </div>
        <div className={cx('pl-audio-bar', !exam && 'is-seekable')} onClick={seek} role="slider" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)}>
          <div className="pl-audio-fill" style={{ width: `${frac * 100}%` }} />
        </div>
        <div className="pl-audio-foot">
          {exam ? (
            <span className="pl-audio-note">
              <Icon name="info" size={13} />
              考试模式：只播放一遍，不能暂停和倍速
            </span>
          ) : (
            <>
              <Segmented size="sm" value={rate} onChange={changeRate} options={RATES.map((r) => ({ value: r, label: `${r}×` }))} />
              <span className="pl-audio-note">
                <Kbd>Space</Kbd> 播放 / 暂停
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
