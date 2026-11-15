import { describe, expect, it } from 'vitest';
import { advanceT, clampT, dataKey, dayTicks, lastIndexAtOrBefore, missionTimeLabel, stepToReading, visibleAt } from './timeline';

const reading = (t: number) => ({ t });

describe('visibleAt', () => {
  const all = [10, 20, 20, 35, 60].map(reading);

  it('shows exactly the items stamped at or before t', () => {
    expect(visibleAt(all, 9)).toEqual([]);
    expect(visibleAt(all, 10).map((r) => r.t)).toEqual([10]);
    expect(visibleAt(all, 34).map((r) => r.t)).toEqual([10, 20, 20]);
    expect(visibleAt(all, 1000)).toHaveLength(5);
  });

  it('is monotonic: whatever is visible at t is visible at every later t, and hidden again when seeking back', () => {
    let previous = new Set<number>();
    for (let t = 0; t <= 70; t += 1) {
      const now = new Set(visibleAt(all, t).map((r) => all.indexOf(r)));
      for (const i of previous) expect(now.has(i), `item ${i} at t=${t}`).toBe(true);
      expect(visibleAt(all, t).every((r) => r.t <= t)).toBe(true);
      previous = now;
    }
    expect(visibleAt(all, 70)).toHaveLength(5);
    expect(visibleAt(all, 15).map((r) => r.t)).toEqual([10]); // seeking back hides the rest
  });

  it('is deterministic: the same t gives the same answer, in any order of calls', () => {
    const a = visibleAt(all, 40);
    visibleAt(all, 5);
    expect(visibleAt(all, 40)).toEqual(a);
  });
});

describe('stepping and keys', () => {
  const times = [100, 200, 200, 300];

  it('finds the last value at or before t', () => {
    expect([50, 100, 150, 300, 999].map((t) => lastIndexAtOrBefore(times, t))).toEqual([-1, 0, 0, 3, 3]);
  });

  it('steps to the previous and next reading, clamped to the span', () => {
    expect(stepToReading(times, 150, 1, 0, 1000)).toBe(200);
    expect(stepToReading(times, 200, 1, 0, 1000)).toBe(300);
    expect(stepToReading(times, 300, 1, 0, 1000)).toBe(1000);
    expect(stepToReading(times, 200, -1, 0, 1000)).toBe(100);
    expect(stepToReading(times, 100, -1, 0, 1000)).toBe(0);
  });

  it('changes the data key exactly when a reading or a 15-minute cabin slot becomes visible', () => {
    expect(dataKey(times, 101)).toBe(dataKey(times, 104));
    expect(dataKey(times, 104)).not.toBe(dataKey(times, 105)); // slot 6 -> 7
    expect(dataKey(times, 199)).not.toBe(dataKey(times, 200));
  });

  it('advances at the given speed and stops at the end', () => {
    expect(advanceT(0, 1000, 60, 0, 10_000)).toBe(60);
    expect(advanceT(0, 500, 360, 0, 10_000)).toBe(180);
    expect(advanceT(9_990, 1000, 60, 0, 10_000)).toBe(10_000);
    expect(clampT(-5, 0, 10)).toBe(0);
  });

  it('writes day and clock time, and lists the day boundaries of the span', () => {
    expect(missionTimeLabel(149 * 1440 + 485)).toBe('Day 150, 08:05');
    expect(missionTimeLabel(0)).toBe('Day 1, 00:00');
    expect(dayTicks(1440, 4 * 1440)).toEqual([1440, 2880, 4320, 5760]);
  });
});
