import { describe, expect, it } from 'vitest';
import {
  BADGES,
  LEVEL_THRESHOLDS,
  POINTS_PER_COMPLETION,
  POINTS_PER_MILESTONE,
  deriveHabitsView,
  earnedBadges,
  levelProgress,
  newBadges,
  totalPoints,
} from './gamification';
import type { Habit, HabitBadge, HabitCompletion } from './model';
import { emptyHabitSnapshot } from './model';

const habit = (id: string, over: Partial<Habit> = {}): Habit => ({
  id,
  name: `Habit ${id}`,
  frequency: { kind: 'daily' },
  frequencyText: 'Daily',
  timeOfDay: null,
  durationMinutes: null,
  note: null,
  sourceKey: id,
  origin: { recommendationId: 'rec', model: 'm', createdAt: '2026-06-01T00:00:00.000Z' },
  createdDay: 1,
  archived: false,
  updatedAt: '2026-06-01T00:00:00.000Z',
  ...over,
});

const done = (habitId: string, ...days: number[]): HabitCompletion[] =>
  days.map((day) => ({ id: `${habitId}:${day}`, habitId, day, completedAt: 't', updatedAt: 't' }));
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('points', () => {
  it('gives 10 per completion', () => {
    expect(totalPoints([habit('a')], done('a', 1, 2, 3))).toBe(3 * POINTS_PER_COMPLETION);
  });

  it('adds 5 at every 7-day milestone of a daily habit', () => {
    expect(totalPoints([habit('a')], done('a', ...range(1, 7)))).toBe(7 * POINTS_PER_COMPLETION + POINTS_PER_MILESTONE);
    expect(totalPoints([habit('a')], done('a', ...range(1, 14)))).toBe(14 * POINTS_PER_COMPLETION + 2 * POINTS_PER_MILESTONE);
  });

  it('adds 5 for every 4 weeks of a weekly habit that met its target', () => {
    const w = habit('w', { frequency: { kind: 'weekly', times: 1 } });
    const days = [1, 8, 15, 22]; // one per week for four weeks
    expect(totalPoints([w], done('w', ...days))).toBe(4 * POINTS_PER_COMPLETION + POINTS_PER_MILESTONE);
  });

  it('takes the points back when a check-off disappears, and keeps those of archived habits', () => {
    expect(totalPoints([habit('a')], done('a', ...range(1, 6)))).toBe(60);
    expect(totalPoints([habit('a', { archived: true })], done('a', 1, 2))).toBe(20);
    expect(totalPoints([], done('gone', 1, 2))).toBe(0); // a deleted habit's rows do not count
  });
});

describe('levels', () => {
  it('starts at level 1 with a bar toward level 2', () => {
    expect(levelProgress(0)).toEqual({ level: 1, points: 0, levelStart: 0, nextLevelAt: LEVEL_THRESHOLDS[1], fraction: 0 });
    expect(levelProgress(25).fraction).toBeCloseTo(0.5);
  });

  it('moves up exactly at each threshold', () => {
    expect(levelProgress(49).level).toBe(1);
    expect(levelProgress(50).level).toBe(2);
    expect(levelProgress(149).level).toBe(2);
    expect(levelProgress(150).level).toBe(3);
  });

  it('caps at the last level with a full bar', () => {
    const top = LEVEL_THRESHOLDS.at(-1)!;
    expect(levelProgress(top + 10_000)).toMatchObject({ level: LEVEL_THRESHOLDS.length, nextLevelAt: null, fraction: 1 });
  });

  it('never goes below level 1 for odd input', () => {
    expect(levelProgress(-5).level).toBe(1);
    expect(levelProgress(12.9).points).toBe(12);
  });
});

describe('badges', () => {
  it('first_habit and first_completion', () => {
    expect(earnedBadges([], [], 150)).toEqual([]);
    expect(earnedBadges([habit('a')], [], 150)).toEqual(['first_habit']);
    expect(earnedBadges([habit('a')], done('a', 150), 150)).toEqual(['first_habit', 'first_completion']);
  });

  it('streak_7 needs seven consecutive days of a daily habit', () => {
    expect(earnedBadges([habit('a')], done('a', ...range(1, 6)), 6)).not.toContain('streak_7');
    expect(earnedBadges([habit('a')], done('a', ...range(1, 7)), 7)).toContain('streak_7');
    const w = habit('w', { frequency: { kind: 'weekly', times: 1 } });
    expect(earnedBadges([w], done('w', ...range(1, 7)), 7)).not.toContain('streak_7');
  });

  it('perfect_week needs every active habit to meet its target in one week', () => {
    const a = habit('a');
    const w = habit('w', { frequency: { kind: 'weekly', times: 2 } });
    const week = [...done('a', ...range(1, 7)), ...done('w', 2, 4)];
    expect(earnedBadges([a, w], week, 7)).toContain('perfect_week');
    // One habit short of its target: no perfect week.
    expect(earnedBadges([a, w], [...done('a', ...range(1, 7)), ...done('w', 2)], 7)).not.toContain('perfect_week');
    expect(earnedBadges([a, w], [...done('a', ...range(1, 6)), ...done('w', 2, 4)], 7)).not.toContain('perfect_week');
  });

  it('perfect_week ignores archived habits and habits saved after the week began', () => {
    const a = habit('a');
    const archived = habit('old', { archived: true });
    const late = habit('late', { createdDay: 5 });
    expect(earnedBadges([a, archived, late], done('a', ...range(1, 7)), 7)).toContain('perfect_week');
  });

  it('newBadges lists only what is not stored yet, so a badge unlocks once', () => {
    const stored: HabitBadge[] = [{ id: 'first_habit', unlockedDay: 1, unlockedAt: 't', updatedAt: 't' }];
    expect(newBadges(['first_habit', 'first_completion'], stored)).toEqual(['first_completion']);
    expect(newBadges(['first_habit'], stored)).toEqual([]);
  });

  it('has a label and description for each badge', () => {
    for (const b of Object.values(BADGES)) expect(b.label && b.description).toBeTruthy();
  });
});

describe('deriveHabitsView', () => {
  it('splits active from archived, orders by saved day, and shows the week with today marked', () => {
    const data = {
      ...emptyHabitSnapshot(),
      habits: [habit('b', { name: 'B', createdDay: 150 }), habit('a', { name: 'A', createdDay: 149 }), habit('z', { archived: true })],
      completions: done('a', 148, 149, 150),
    };
    const view = deriveHabitsView(data, 150);
    expect(view.active.map((v) => v.habit.id)).toEqual(['a', 'b']);
    expect(view.archived.map((v) => v.habit.id)).toEqual(['z']);
    const a = view.active[0]!;
    expect(a).toMatchObject({ doneToday: true, weekDone: 3, weekTarget: 7 });
    expect(a.streak.current).toBe(3);
    expect(a.week.map((d) => d.day)).toEqual(range(148, 154));
    expect(a.week.filter((d) => d.isToday).map((d) => d.day)).toEqual([150]);
    expect(a.week.filter((d) => d.future)).toHaveLength(4);
    expect(view.progress.points).toBe(30);
  });

  it('reports a streak that is still alive when today is not done', () => {
    const view = deriveHabitsView({ ...emptyHabitSnapshot(), habits: [habit('a')], completions: done('a', 148, 149) }, 150);
    expect(view.active[0]).toMatchObject({ doneToday: false });
    expect(view.active[0]!.streak.current).toBe(2);
  });

  it('lists every badge, marking the stored ones', () => {
    const data = { ...emptyHabitSnapshot(), badges: [{ id: 'first_habit', unlockedDay: 12, unlockedAt: 't', updatedAt: 't' }] as HabitBadge[] };
    const badges = deriveHabitsView(data, 150).badges;
    expect(badges).toHaveLength(4);
    expect(badges.find((b) => b.id === 'first_habit')).toMatchObject({ earned: true, unlockedDay: 12 });
    expect(badges.filter((b) => b.earned)).toHaveLength(1);
  });
});
