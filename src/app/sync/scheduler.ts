export type RunOutcome = 'ok' | 'failed' | 'stop';

export interface SchedulerOptions {
  /** One sync. `failed` backs off, `stop` ends the schedule (the device was disconnected). A rejection counts as a failure. */
  run(): Promise<RunOutcome>;
  /** Wait after the last local write before syncing. Default 5 s. */
  debounceMs?: number;
  /** Wait between runs while healthy. Default 60 s. */
  intervalMs?: number;
  /** First backoff step; doubles per consecutive failure. Default 5 s. */
  backoffBaseMs?: number;
  /** Backoff cap. Default 5 min. */
  backoffMaxMs?: number;
  /** Injected in tests. */
  random?: () => number;
  now?: () => number;
  isOnline?: () => boolean;
  /** Where the `online` event is heard. Defaults to `window` when it exists. */
  target?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null;
}

export interface Scheduler {
  start(): void;
  stop(): void;
  /** A local write happened: sync after the debounce, unless a backoff is already pending. */
  notifyChange(): void;
  /** Sync right now, ignoring the backoff. Joins the run in flight instead of starting a second one. */
  syncNow(): Promise<void>;
  readonly started: boolean;
  /** Consecutive failures so far (0 when healthy). */
  readonly failures: number;
}

/**
 * Decides WHEN to sync; knows nothing about what a sync does. Runs once on start, debounced after local writes,
 * every `intervalMs`, and on the `online` event. After a failure the next run waits an exponentially growing,
 * jittered delay capped at `backoffMaxMs`. A single-flight lock means two syncs never overlap, and nothing here
 * ever throws into the caller: a rejected run counts as a failure.
 */
export function createScheduler(options: SchedulerOptions): Scheduler {
  const debounceMs = options.debounceMs ?? 5_000;
  const intervalMs = options.intervalMs ?? 60_000;
  const baseMs = options.backoffBaseMs ?? 5_000;
  const maxMs = options.backoffMaxMs ?? 300_000;
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;
  const isOnline = options.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const target = options.target === undefined ? (typeof window === 'undefined' ? null : window) : options.target;

  let started = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let inflight: Promise<void> | null = null;
  let failures = 0;
  let blockedUntil = 0;
  let rerun = false;

  const clear = (t: ReturnType<typeof setTimeout> | null) => {
    if (t !== null) clearTimeout(t);
  };

  /** Equal jitter: half the capped exponential step, plus a random share of the other half. */
  const backoff = (n: number) => {
    const cap = Math.min(maxMs, baseMs * 2 ** (n - 1));
    return cap / 2 + random() * (cap / 2);
  };

  const schedule = () => {
    clear(timer);
    timer = null;
    if (!started) return;
    const delay = failures > 0 ? backoff(failures) : intervalMs;
    blockedUntil = failures > 0 ? now() + delay : 0;
    timer = setTimeout(() => void execute(false), delay);
  };

  const scheduleDebounce = () => {
    if (!started) return;
    clear(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      if (failures > 0 && now() < blockedUntil) return; // the backoff timer will sync these writes
      void execute(false);
    }, debounceMs);
  };

  function execute(force: boolean): Promise<void> {
    if (!started) return Promise.resolve();
    if (inflight) {
      rerun = true;
      return inflight;
    }
    if (!force && !isOnline()) {
      schedule(); // offline is not a failure: look again later (the `online` event will not wait)
      return Promise.resolve();
    }
    inflight = (async () => {
      let outcome: RunOutcome;
      try {
        outcome = await options.run();
      } catch {
        outcome = 'failed';
      }
      if (outcome === 'stop') {
        stop();
        return;
      }
      failures = outcome === 'failed' ? failures + 1 : 0;
      schedule();
    })().finally(() => {
      inflight = null;
      if (rerun) {
        rerun = false;
        scheduleDebounce();
      }
    });
    return inflight;
  }

  const onOnline = () => {
    failures = 0;
    void execute(true);
  };

  function stop() {
    started = false;
    clear(timer);
    clear(debounce);
    timer = debounce = null;
    failures = 0;
    blockedUntil = 0;
    rerun = false;
    target?.removeEventListener('online', onOnline);
  }

  return {
    start() {
      if (started) return;
      started = true;
      target?.addEventListener('online', onOnline);
      void execute(false);
    },
    stop,
    notifyChange: scheduleDebounce,
    syncNow() {
      clear(debounce);
      debounce = null;
      return execute(true);
    },
    get started() {
      return started;
    },
    get failures() {
      return failures;
    },
  };
}
