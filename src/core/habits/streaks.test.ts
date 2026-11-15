import { describe, expect, it } from 'vitest';
import { computeStreak, milestonesEarned, weekEnd, weekOf, weekStart } from './streaks';

const daily = { kind: 'daily' } as const;
const weekly = (times: number) => ({ kind: 'weekly', times }) as const;
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('mission weeks', () => {
  it('counts seven-day blocks from day 1', () => {
    expect([weekOf(1), weekOf(7), weekOf(8), weekOf(150)]).toEqual([0, 0, 1, 21]);
    expect([weekStart(21), weekEnd(21)]).toEqual([148, 154]);
  });
});

describe('daily streaks', () => {
  it('is zero with no completions', () => {
    expect(computeStreak(daily, [], 150)).toEqual({ current: 0, best: 0, unit: 'day' });
  });

  it('counts consecutive days ending today', () => {
    expect(computeStreak(daily, [148, 149, 150], 150)).toMatchObject({ current: 3, best: 3 });
  });

  it('keeps the streak when today is not done yet (it counts back from yesterday)', () => {
    expect(computeStreak(daily, [148, 149], 150)).toMatchObject({ current: 2, best: 2 });
  });

  it('breaks the streak after a missed day, and remembers the best run', () => {
    expect(computeStreak(daily, [140, 141, 142, 143, 144, 148, 149], 150)).toMatchObject({ current: 2, best: 5 });
    expect(computeStreak(daily, [140, 141, 142, 143, 144, 149], 151)).toMatchObject({ current: 0, best: 5 });
  });

  it('counts a completion once per day', () => {
    expect(computeStreak(daily, [150, 150, 149], 150)).toMatchObject({ current: 2, best: 2 });
  });
});

describe('weekly streaks', () => {
  // Week 21 is days 148-154; week 20 is 141-147; week 19 is 134-140.
  it('counts consecutive weeks that met the target', () => {
    const days = [134, 136, 138, 141, 143, 145, 148, 150, 152];
    expect(computeStreak(weekly(3), days, 152)).toEqual({ current: 3, best: 3, unit: 'week' });
  });

  it('keeps the streak while the current week is still in progress', () => {
    const days = [134, 136, 138, 141, 143, 145, 148]; // this week: 1 of 3 so far
    expect(computeStreak(weekly(3), days, 149)).toMatchObject({ current: 2, best: 2 });
  });

  it('breaks the streak when a past week fell short', () => {
    const days = [134, 136, 138, 141, 143, 148, 150, 152]; // week 20 had only 2
    expect(computeStreak(weekly(3), days, 152)).toMatchObject({ current: 1, best: 1 });
    expect(computeStreak(weekly(3), [134, 136, 138, 141, 143], 152)).toMatchObject({ current: 0, best: 1 });
  });

  it('a week that overshoots its target still counts once', () => {
    expect(computeStreak(weekly(2), range(141, 147), 147)).toMatchObject({ current: 1, best: 1 });
  });
});

describe('milestones', () => {
  it('awards one per full 7 days of a daily run, per run', () => {
    expect(milestonesEarned(daily, range(1, 6))).toBe(0);
    expect(milestonesEarned(daily, range(1, 7))).toBe(1);
    expect(milestonesEarned(daily, [...range(1, 14), ...range(20, 26)])).toBe(3);
  });

  it('awards one per full 4 weeks of a weekly run', () => {
    const week = (w: number) => [weekStart(w), weekStart(w) + 2];
    expect(milestonesEarned(weekly(2), [0, 1, 2].flatMap(week))).toBe(0);
    expect(milestonesEarned(weekly(2), [0, 1, 2, 3].flatMap(week))).toBe(1);
  });
});
