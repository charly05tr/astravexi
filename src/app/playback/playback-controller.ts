import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import { ScenarioClock } from '../../adapters/scenario-clock';
import {
  DEFAULT_SPEED_ID,
  PLAYBACK_SPEEDS,
  advanceT,
  clampT,
  dataKey,
  stepToReading,
} from '../../core/playback/timeline';
import type { PlaybackSpan } from '../../core/playback/timeline';
import type { DemoScenario } from '../demo/demo-scenario';

export interface PlaybackScheduler {
  nowMs(): number;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const browserScheduler: PlaybackScheduler = {
  nowMs: () => Date.now(),
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (h) => globalThis.clearInterval(h as ReturnType<typeof setInterval>),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface PlaybackState {
  /** The live position the bar shows (moves every tick while playing). */
  t: number;
  /** The mission minute the app is evaluated at: it follows `t` only when the visible data changes (throttled). */
  committedT: number;
  playing: boolean;
  speedId: string;
  /** Last notable change, for the polite live region. Throttled: never every tick. */
  announcement: string;
}

export interface PlaybackMetrics {
  commits: number;
  totalMs: number;
  lastMs: number;
  maxMs: number;
}

export interface PlaybackController {
  readonly span: PlaybackSpan;
  readonly clock: ScenarioClock;
  readonly store: StoreApi<PlaybackState>;
  readonly metrics: PlaybackMetrics;
  /** The app store registers how to re-evaluate everything at the clock's minute. The latest binding wins. */
  bind(commit: () => Promise<void>): () => void;
  play(): void;
  pause(): void;
  toggle(): void;
  setSpeed(id: string): void;
  /** Moves to `t` and re-evaluates the app now. */
  seek(t: number): Promise<void>;
  /** Moves the bar at once and re-evaluates the app at most every `commitMinMs` (dragging the scrubber). */
  scrub(t: number): void;
  step(dir: 1 | -1): Promise<void>;
  stepMinutes(minutes: number): Promise<void>;
  restart(): Promise<void>;
  /** Polite live-region message about a notable change; throttled and de-duplicated. */
  announce(text: string): void;
  dispose(): void;
}

export interface PlaybackOptions {
  scheduler?: PlaybackScheduler;
  /** Real milliseconds between position updates while playing. */
  tickMs?: number;
  /** The app is re-evaluated at most this often (real ms) while playing or scrubbing. */
  commitMinMs?: number;
  /** Live-region messages are at least this far apart (real ms). */
  announceMinMs?: number;
}

export function createPlaybackController(span: PlaybackSpan, clock: ScenarioClock, options: PlaybackOptions = {}): PlaybackController {
  const sched = options.scheduler ?? browserScheduler;
  const tickMs = options.tickMs ?? 50;
  const commitMinMs = options.commitMinMs ?? 250;
  const announceMinMs = options.announceMinMs ?? 3000;
  const { startT, endT, readingTimes } = span;

  const store = createStore<PlaybackState>()(() => ({
    t: clock.now(),
    committedT: clock.now(),
    playing: false,
    speedId: DEFAULT_SPEED_ID,
    announcement: '',
  }));
  const metrics: PlaybackMetrics = { commits: 0, totalMs: 0, lastMs: 0, maxMs: 0 };

  let commitFn: (() => Promise<void>) | null = null;
  let timer: unknown = null;
  let trailing: unknown = null;
  let pendingScrubT: number | null = null;
  let applying = false;
  let lastCommitMs = -Infinity;
  let lastKey = dataKey(readingTimes, clock.now());
  let anchorT = clock.now();
  let anchorMs = sched.nowMs();
  let lastAnnounceMs = -Infinity;
  let pendingAnnouncement: string | null = null;
  let announceTimer: unknown = null;

  const minPerSec = () => PLAYBACK_SPEEDS.find((s) => s.id === store.getState().speedId)?.minPerSec ?? 1;
  const reanchor = (t: number) => {
    anchorT = t;
    anchorMs = sched.nowMs();
  };

  async function commit(t: number): Promise<void> {
    clock.setNow(t);
    lastKey = dataKey(readingTimes, t);
    lastCommitMs = sched.nowMs();
    store.setState({ committedT: t });
    if (!commitFn) return;
    applying = true;
    const began = sched.nowMs();
    try {
      await commitFn();
    } finally {
      applying = false;
      const took = sched.nowMs() - began;
      metrics.commits += 1;
      metrics.totalMs += took;
      metrics.lastMs = took;
      metrics.maxMs = Math.max(metrics.maxMs, took);
    }
  }

  function stopTimer() {
    if (timer !== null) sched.clearInterval(timer);
    timer = null;
  }

  function tick() {
    const state = store.getState();
    const t = advanceT(anchorT, sched.nowMs() - anchorMs, minPerSec(), startT, endT);
    if (t !== state.t) store.setState({ t });
    if (t >= endT) {
      // The end of the span: stop by itself, with the app showing the last minute.
      stopTimer();
      store.setState({ playing: false, t: endT });
      void commit(endT);
      return;
    }
    if (!applying && dataKey(readingTimes, t) !== lastKey && sched.nowMs() - lastCommitMs >= commitMinMs) void commit(t);
  }

  function play() {
    if (store.getState().playing) return;
    if (store.getState().t >= endT) {
      store.setState({ t: startT });
      void commit(startT);
    }
    reanchor(store.getState().t);
    store.setState({ playing: true });
    timer = sched.setInterval(tick, tickMs);
  }

  function pause() {
    if (!store.getState().playing) return;
    stopTimer();
    const t = store.getState().t;
    store.setState({ playing: false });
    if (t !== store.getState().committedT) void commit(t);
  }

  async function seek(target: number): Promise<void> {
    const t = clampT(target, startT, endT);
    if (trailing !== null) sched.clearTimeout(trailing);
    trailing = null;
    pendingScrubT = null;
    store.setState({ t });
    reanchor(t);
    await commit(t);
    if (t >= endT && store.getState().playing) {
      stopTimer();
      store.setState({ playing: false });
    }
  }

  function flushScrub() {
    trailing = null;
    if (pendingScrubT === null) return;
    if (applying) {
      trailing = sched.setTimeout(flushScrub, commitMinMs);
      return;
    }
    const t = pendingScrubT;
    pendingScrubT = null;
    void commit(t);
  }

  // The clock moved from outside (Reset demo, Advance one day): the bar follows and playback stops.
  const unsubscribeClock = clock.subscribe(() => {
    stopTimer();
    const t = clock.now();
    lastKey = dataKey(readingTimes, t);
    reanchor(t);
    store.setState({ t, committedT: t, playing: false });
  });

  return {
    span,
    clock,
    store,
    metrics,
    bind(fn) {
      commitFn = fn;
      return () => {
        if (commitFn === fn) commitFn = null;
      };
    },
    play,
    pause,
    toggle: () => (store.getState().playing ? pause() : play()),
    setSpeed(id) {
      if (!PLAYBACK_SPEEDS.some((s) => s.id === id)) return;
      reanchor(store.getState().t);
      store.setState({ speedId: id });
    },
    seek,
    scrub(target) {
      const t = clampT(target, startT, endT);
      store.setState({ t });
      reanchor(t);
      pendingScrubT = t;
      if (trailing === null) {
        if (!applying && sched.nowMs() - lastCommitMs >= commitMinMs) flushScrub();
        else trailing = sched.setTimeout(flushScrub, commitMinMs);
      }
    },
    step: (dir) => seek(stepToReading(readingTimes, store.getState().t, dir, startT, endT)),
    stepMinutes: (minutes) => seek(store.getState().t + minutes),
    async restart() {
      stopTimer();
      store.setState({ playing: false });
      await seek(span.initialT);
    },
    announce(text) {
      if (text === '' || text === store.getState().announcement) return;
      const wait = announceMinMs - (sched.nowMs() - lastAnnounceMs);
      if (wait <= 0) {
        lastAnnounceMs = sched.nowMs();
        pendingAnnouncement = null;
        store.setState({ announcement: text });
        return;
      }
      pendingAnnouncement = text;
      if (announceTimer === null) {
        announceTimer = sched.setTimeout(() => {
          announceTimer = null;
          if (pendingAnnouncement === null) return;
          lastAnnounceMs = sched.nowMs();
          store.setState({ announcement: pendingAnnouncement });
          pendingAnnouncement = null;
        }, wait);
      }
    },
    dispose() {
      stopTimer();
      if (trailing !== null) sched.clearTimeout(trailing);
      if (announceTimer !== null) sched.clearTimeout(announceTimer);
      unsubscribeClock();
    },
  };
}

const controllers = new WeakMap<DemoScenario, PlaybackController>();

/**
 * The playback of a scenario. One per loaded scenario, so switching profile keeps the position and the speed.
 * `options` only matter the first time (tests inject a scheduler).
 */
export function playbackFor(scenario: DemoScenario, options?: PlaybackOptions): PlaybackController {
  let hit = controllers.get(scenario);
  if (!hit) {
    hit = createPlaybackController(scenario.playback, new ScenarioClock(scenario.clock.minute), options);
    controllers.set(scenario, hit);
  }
  return hit;
}
