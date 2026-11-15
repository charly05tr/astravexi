import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScheduler } from './scheduler';
import type { RunOutcome } from './scheduler';

function setup(outcomes: Array<RunOutcome | Error> = [], extra: { isOnline?: () => boolean } = {}) {
  const target = new EventTarget();
  const queue = [...outcomes];
  let running = 0;
  let maxRunning = 0;
  const run = vi.fn(async (): Promise<RunOutcome> => {
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    await Promise.resolve();
    running -= 1;
    const next = queue.shift() ?? 'ok';
    if (next instanceof Error) throw next;
    return next;
  });
  const scheduler = createScheduler({
    run,
    debounceMs: 5_000,
    intervalMs: 60_000,
    backoffBaseMs: 5_000,
    backoffMaxMs: 300_000,
    random: () => 1, // max jitter: the delay equals the capped step
    target,
    ...extra,
  });
  return { scheduler, run, target, maxRunning: () => maxRunning };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('sync scheduler', () => {
  it('runs on start, then every 60 s', async () => {
    const { scheduler, run } = setup();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(3);
    scheduler.stop();
  });

  it('debounces local writes: one run, 5 s after the last write', async () => {
    const { scheduler, run } = setup();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    run.mockClear();
    scheduler.notifyChange();
    await vi.advanceTimersByTimeAsync(3_000);
    scheduler.notifyChange(); // resets the debounce
    await vi.advanceTimersByTimeAsync(4_000);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_001);
    expect(run).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('syncs when the browser comes back online, ignoring a pending backoff', async () => {
    const { scheduler, run, target } = setup(['failed', 'failed']);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(scheduler.failures).toBe(1);
    run.mockClear();
    target.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('never overlaps two syncs (single flight), and follows up when a write came in meanwhile', async () => {
    let release: () => void = () => undefined;
    let calls = 0;
    let active = 0;
    let peak = 0;
    const scheduler = createScheduler({
      run: async () => {
        calls += 1;
        active += 1;
        peak = Math.max(peak, active);
        if (calls === 1) await new Promise<void>((r) => (release = r));
        active -= 1;
        return 'ok';
      },
      target: null,
      random: () => 1,
    });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    const joined = scheduler.syncNow(); // joins the run in flight
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toBe(1);
    release();
    await joined;
    await vi.advanceTimersByTimeAsync(5_001); // the write that arrived during the run gets its own debounced sync
    expect(calls).toBe(2);
    expect(peak).toBe(1);
    scheduler.stop();
  });

  it('backs off exponentially after failures, capped at 5 min, and resets after a success', async () => {
    const { scheduler, run } = setup(['failed', 'failed', 'failed', 'failed', 'failed', 'failed', 'failed', 'failed', 'ok']);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1); // failure 1 -> wait 5 s
    await vi.advanceTimersByTimeAsync(4_999);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(run).toHaveBeenCalledTimes(2); // failure 2 -> wait 10 s
    await vi.advanceTimersByTimeAsync(10_001);
    expect(run).toHaveBeenCalledTimes(3); // failure 3 -> 20 s
    await vi.advanceTimersByTimeAsync(20_001);
    expect(run).toHaveBeenCalledTimes(4); // 40 s
    await vi.advanceTimersByTimeAsync(40_001);
    expect(run).toHaveBeenCalledTimes(5); // 80 s
    await vi.advanceTimersByTimeAsync(80_001);
    expect(run).toHaveBeenCalledTimes(6); // 160 s
    await vi.advanceTimersByTimeAsync(160_001);
    expect(run).toHaveBeenCalledTimes(7); // 320 s capped to 300 s
    await vi.advanceTimersByTimeAsync(299_000);
    expect(run).toHaveBeenCalledTimes(7);
    await vi.advanceTimersByTimeAsync(1_001);
    expect(run).toHaveBeenCalledTimes(8);
    expect(scheduler.failures).toBe(8);
    await vi.advanceTimersByTimeAsync(300_001);
    expect(run).toHaveBeenCalledTimes(9); // the success
    expect(scheduler.failures).toBe(0);
    scheduler.stop();
  });

  it('applies jitter: the delay is between half and the full capped step', async () => {
    const draws = [0, 0.5];
    const run = vi.fn(async (): Promise<RunOutcome> => 'failed');
    const scheduler = createScheduler({ run, backoffBaseMs: 10_000, random: () => draws.shift() ?? 0, target: null });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(run).toHaveBeenCalledTimes(1); // first delay: 10 s * (0.5 + 0 * 0.5) = 5 s
    await vi.advanceTimersByTimeAsync(2);
    expect(run).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('a debounced write during a backoff does not defeat the backoff', async () => {
    const outcomes: RunOutcome[] = ['failed', 'ok'];
    const run = vi.fn(async (): Promise<RunOutcome> => outcomes.shift() ?? 'ok');
    const scheduler = createScheduler({ run, backoffBaseMs: 30_000, random: () => 1, target: null });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1); // failed: next attempt in 30 s
    scheduler.notifyChange();
    await vi.advanceTimersByTimeAsync(6_000); // the debounce fired, and held back
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(24_001); // the backoff timer syncs the pending writes
    expect(run).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('manual "Sync now" ignores the backoff', async () => {
    const { scheduler, run } = setup(['failed']);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    run.mockClear();
    await scheduler.syncNow();
    expect(run).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('a throwing run counts as a failure and never escapes', async () => {
    const { scheduler } = setup([new Error('boom')]);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(scheduler.failures).toBe(1);
    expect(scheduler.started).toBe(true);
    scheduler.stop();
  });

  it('stops for good when a run says so (device disconnected)', async () => {
    const { scheduler, run } = setup(['stop']);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(scheduler.started).toBe(false);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(run).toHaveBeenCalledTimes(1);
    scheduler.notifyChange();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('skips scheduled runs while offline without counting a failure, and resumes online', async () => {
    let online = false;
    const { scheduler, run, target } = setup([], { isOnline: () => online });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(run).not.toHaveBeenCalled();
    expect(scheduler.failures).toBe(0);
    online = true;
    target.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('stop() removes the online listener and the timers', async () => {
    const { scheduler, run, target } = setup();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.stop();
    run.mockClear();
    target.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(run).not.toHaveBeenCalled();
  });
});
