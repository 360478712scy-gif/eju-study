// Foreground study clock for the player. Time only runs while the window is visible
// (and, outside exams, while the learner shows signs of life). Seconds pile up here
// and are drained into the store in whole seconds by the player.
//
// Outside exams, time since the last sign of life is held back ("tail") until the learner
// moves again or acts; when the idle pause kicks in, that tail — the idle minutes — is
// dropped instead of being counted as study.
import { useSyncExternalStore } from 'react';
import { speechElement } from '../../lib/audio.ts';

const IDLE_MS = 5 * 60_000;
/** A single tick never counts more than this (sleep, throttled timers). */
const MAX_STEP = 3;

export class StudyClock {
  private visible: boolean;
  private idle = false;
  private stopped = false;
  private idleEnabled: boolean;
  private last = performance.now();
  private lastActivity = Date.now();
  private study = 0;
  private item = 0;
  /** Not yet confirmed by activity (only when idle detection is on). */
  private studyTail = 0;
  private itemTail = 0;
  private counting = false;
  private ver = 0;
  private listeners = new Set<() => void>();

  constructor(idleEnabled: boolean) {
    this.idleEnabled = idleEnabled;
    this.visible = typeof document === 'undefined' || document.visibilityState === 'visible';
  }

  get running() {
    return this.visible && !this.idle && !this.stopped;
  }
  get isIdle() {
    return this.idle && this.visible && !this.stopped;
  }

  private advance() {
    const now = performance.now();
    const dt = Math.min(MAX_STEP, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (!this.running) return;
    if (this.idleEnabled) {
      this.studyTail += dt;
      if (this.counting) this.itemTail += dt;
    } else {
      this.study += dt;
      if (this.counting) this.item += dt;
    }
  }

  /** The time since the last sign of life was real study: count it. */
  commit() {
    this.advance();
    this.study += this.studyTail;
    this.item += this.itemTail;
    this.studyTail = 0;
    this.itemTail = 0;
  }

  private notify() {
    this.ver++;
    for (const l of this.listeners) l();
  }

  tick() {
    this.advance();
    const sp = speechElement();
    if (sp && !sp.paused) {
      // Listening counts as activity.
      this.lastActivity = Date.now();
      this.commit();
    }
    if (this.idleEnabled && !this.idle && Date.now() - this.lastActivity > IDLE_MS) {
      // Nobody has been here since the last activity: those minutes were not study.
      this.idle = true;
      this.studyTail = 0;
      this.itemTail = 0;
    }
    this.notify();
  }

  setVisible(v: boolean) {
    // Switching away is a sign of life too: what ran up to now counts.
    this.commit();
    this.visible = v;
    if (v) this.lastActivity = Date.now();
    this.notify();
  }

  activity() {
    this.lastActivity = Date.now();
    this.commit();
    if (this.idle) {
      this.idle = false;
      this.notify();
    }
  }

  /** Start timing a new item (the previous item's seconds must have been taken). */
  setItem(counting: boolean) {
    this.advance();
    this.item = 0;
    this.itemTail = 0;
    this.counting = counting;
    this.notify();
  }

  setCounting(counting: boolean) {
    this.advance();
    this.counting = counting;
  }

  stop() {
    this.commit();
    this.stopped = true;
    this.notify();
  }

  /** Whole seconds of study time not yet written to the store. */
  takeStudy(): number {
    this.advance();
    const w = Math.floor(this.study);
    this.study -= w;
    return w;
  }

  /** Whole seconds spent on the current item not yet written to the store. */
  takeItem(): number {
    this.advance();
    const w = Math.floor(this.item);
    this.item -= w;
    return w;
  }

  /** Study time not yet written to the store, including the unconfirmed tail (for display). */
  pendingStudy() {
    return this.study + this.studyTail;
  }
  pendingItem() {
    return this.item + this.itemTail;
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
  version = () => this.ver;
}

/** Re-render on every clock tick (used only by the small timer widgets). */
export function useClock(clock: StudyClock) {
  useSyncExternalStore(clock.subscribe, clock.version);
  return clock;
}
