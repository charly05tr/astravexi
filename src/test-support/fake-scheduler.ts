import type { PlaybackScheduler } from '../app/playback/playback-controller';

/** A scheduler the test drives: `run(ms)` moves time forward in small steps and lets pending promises settle between them. */
export function createFakeScheduler(stepMs = 50) {
  let ms = 0;
  let nextId = 1;
  const intervals = new Map<number, { fn: () => void; every: number; next: number }>();
  const timeouts = new Map<number, { fn: () => void; at: number }>();
  const scheduler: PlaybackScheduler = {
    nowMs: () => ms,
    setInterval(fn, every) {
      const id = nextId++;
      intervals.set(id, { fn, every, next: ms + every });
      return id;
    },
    clearInterval: (h) => void intervals.delete(h as number),
    setTimeout(fn, delay) {
      const id = nextId++;
      timeouts.set(id, { fn, at: ms + delay });
      return id;
    },
    clearTimeout: (h) => void timeouts.delete(h as number),
  };
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  return {
    scheduler,
    now: () => ms,
    async run(totalMs: number) {
      for (let spent = 0; spent < totalMs; spent += stepMs) {
        ms += stepMs;
        for (const [id, t] of [...timeouts]) {
          if (t.at <= ms) {
            timeouts.delete(id);
            t.fn();
          }
        }
        for (const i of [...intervals.values()]) {
          while (i.next <= ms) {
            i.next += i.every;
            i.fn();
          }
        }
        await settle();
      }
    },
  };
}
