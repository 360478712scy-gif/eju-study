// One audio channel for speech (listening clips, word audio) and one for background music.
// Speech always ducks the music; hiding the window pauses both.
import { onWindowVisibility } from './native.ts';

let speech: HTMLAudioElement | null = null;
let speechListeners = new Set<() => void>();
const music = typeof Audio !== 'undefined' ? new Audio() : (null as unknown as HTMLAudioElement);
let musicWanted = false;
let musicVolume = 0.22;

export const TRACKS = [
  { id: 'music-01', name: 'Meditation Impromptu 01', src: '/assets/music/meditation-01.mp3' },
  { id: 'music-02', name: 'Meditation Impromptu 02', src: '/assets/music/meditation-02.mp3' },
  { id: 'music-03', name: 'Meditation Impromptu 03', src: '/assets/music/meditation-03.mp3' },
];

if (music) {
  music.loop = true;
  music.preload = 'none';
}

function duck(on: boolean) {
  if (music) music.volume = on ? 0 : musicVolume;
}

export function speechElement(): HTMLAudioElement | null {
  return speech;
}

export function onSpeechChange(fn: () => void) {
  speechListeners.add(fn);
  return () => speechListeners.delete(fn);
}

function notify() {
  for (const l of speechListeners) l();
}

/** Play a speech clip (stops the previous one). Resolves when playback starts. */
export async function playSpeech(src: string, opts: { rate?: number; start?: number } = {}): Promise<HTMLAudioElement> {
  stopSpeech();
  const a = new Audio(src);
  a.preservesPitch = true;
  a.playbackRate = opts.rate ?? 1;
  if (opts.start) a.currentTime = opts.start;
  speech = a;
  a.addEventListener('play', () => {
    duck(true);
    notify();
  });
  const done = () => {
    if (speech === a) duck(false);
    notify();
  };
  a.addEventListener('pause', done);
  a.addEventListener('ended', done);
  await a.play();
  return a;
}

export function stopSpeech() {
  if (speech) {
    speech.pause();
    speech = null;
    duck(false);
    notify();
  }
}

export function setMusic(enabled: boolean, track: string, volume: number) {
  if (!music) return;
  musicVolume = volume;
  const t = TRACKS.find((x) => x.id === track) || TRACKS[0];
  if (!music.src.endsWith(t.src)) music.src = t.src;
  music.volume = speech && !speech.paused ? 0 : volume;
  musicWanted = enabled;
  if (enabled) void music.play().catch(() => {});
  else music.pause();
}

export function musicPlaying() {
  return !!music && !music.paused;
}

onWindowVisibility((visible) => {
  if (!visible) {
    speech?.pause();
    music?.pause();
  } else if (musicWanted) {
    void music.play().catch(() => {});
  }
});
