import type { MissionDay } from '../health/model';
import type { BadgeId, Habit, HabitBadge, HabitCompletion, HabitSnapshot } from './model';
import { BADGE_IDS } from './model';
import { completionsInWeek, computeStreak, metInWeek, milestonesEarned, weekEnd, weekOf, weekStart, weeklyTarget } from './streaks';
import type { StreakInfo } from './streaks';

export const POINTS_PER_COMPLETION = 10;
export const POINTS_PER_MILESTONE = 5;

/** Total points needed to reach each level; level 1 starts at 0. The last level is the cap. */
export const LEVEL_THRESHOLDS: readonly number[] = [0, 50, 150, 300, 500, 800, 1200, 1800, 2500, 3500];

export interface BadgeDefinition {
  id: BadgeId;
  label: string;
  description: string;
}

export const BADGES: Readonly<Record<BadgeId, BadgeDefinition>> = {
  first_habit: { id: 'first_habit', label: 'First habit', description: 'Saved your first habit.' },
  first_completion: { id: 'first_completion', label: 'First check-off', description: 'Checked off a habit for the first time.' },
  streak_7: { id: 'streak_7', label: '7-day streak', description: 'Kept a daily habit going for 7 days in a row.' },
  perfect_week: { id: 'perfect_week', label: 'Perfect week', description: 'Every active habit met its target in one week.' },
};

export interface LevelProgress {
  level: number;
  points: number;
  /** Points at which this level started. */
  levelStart: number;
  /** Points needed for the next level; null at the last level. */
  nextLevelAt: number | null;
  /** Share of the way to the next level, 0 to 1 (1 at the last level). */
  fraction: number;
}

export function levelProgress(points: number): LevelProgress {
  const safe = Math.max(0, Math.floor(points));
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i += 1) if (safe >= LEVEL_THRESHOLDS[i]!) level = i + 1;
  const levelStart = LEVEL_THRESHOLDS[level - 1]!;
  const nextLevelAt = LEVEL_THRESHOLDS[level] ?? null;
  const fraction = nextLevelAt === null ? 1 : (safe - levelStart) / (nextLevelAt - levelStart);
  return { level, points: safe, levelStart, nextLevelAt, fraction };
}

const daysByHabit = (completions: readonly HabitCompletion[]): Map<string, MissionDay[]> => {
  const map = new Map<string, MissionDay[]>();
  for (const c of completions) map.set(c.habitId, [...(map.get(c.habitId) ?? []), c.day]);
  return map;
};

/**
 * Points are derived from the check-offs, never stored: 10 per completion plus 5 for every streak milestone
 * (7 days for a daily habit, 4 weeks for a weekly one). Undoing a check-off therefore takes its points back.
 * Archived habits keep their points; a deleted habit takes its completions with it.
 */
export function totalPoints(habits: readonly Habit[], completions: readonly HabitCompletion[]): number {
  const days = daysByHabit(completions);
  let points = 0;
  for (const habit of habits) {
    const done = days.get(habit.id) ?? [];
    points += new Set(done).size * POINTS_PER_COMPLETION + milestonesEarned(habit.frequency, done) * POINTS_PER_MILESTONE;
  }
  return points;
}

/** Whether every active habit that existed at the start of `week` met its target in it (and there is at least one). */
function perfectWeek(habits: readonly Habit[], byHabit: ReadonlyMap<string, MissionDay[]>, week: number): boolean {
  const due = habits.filter((h) => !h.archived && h.createdDay <= weekStart(week));
  return due.length > 0 && due.every((h) => metInWeek(h.frequency, byHabit.get(h.id) ?? [], week));
}

/** The badges the current data has earned. Pure: persisting them (once) is the use-case's job. */
export function earnedBadges(habits: readonly Habit[], completions: readonly HabitCompletion[], today: MissionDay): BadgeId[] {
  const byHabit = daysByHabit(completions);
  const earned = new Set<BadgeId>();
  if (habits.length > 0) earned.add('first_habit');
  if (completions.length > 0) earned.add('first_completion');
  for (const habit of habits) {
    if (habit.frequency.kind !== 'daily') continue;
    if (computeStreak(habit.frequency, byHabit.get(habit.id) ?? [], today).best >= 7) earned.add('streak_7');
  }
  const weeks = new Set<number>([weekOf(today)]);
  for (const c of completions) weeks.add(weekOf(c.day));
  for (const week of weeks) if (week <= weekOf(today) && perfectWeek(habits, byHabit, week)) earned.add('perfect_week');
  return BADGE_IDS.filter((id) => earned.has(id));
}

/** Badges that are earned now but not stored yet, in catalog order. */
export function newBadges(earned: readonly BadgeId[], stored: readonly HabitBadge[]): BadgeId[] {
  const have = new Set(stored.map((b) => b.id));
  return earned.filter((id) => !have.has(id));
}

export interface HabitView {
  habit: Habit;
  doneToday: boolean;
  streak: StreakInfo;
  /** Completions so far in the current mission week. */
  weekDone: number;
  /** Completions the current week needs: 7 for a daily habit, N for a weekly one. */
  weekTarget: number;
  /** The seven days of the current week, oldest first, for the week strip. */
  week: Array<{ day: MissionDay; done: boolean; isToday: boolean; future: boolean }>;
}

export interface HabitsView {
  today: MissionDay;
  active: HabitView[];
  archived: HabitView[];
  progress: LevelProgress;
  badges: Array<BadgeDefinition & { earned: boolean; unlockedDay: MissionDay | null }>;
}

/** Everything the habits screen shows, derived from the stored rows and today's mission day. Pure. */
export function deriveHabitsView(data: HabitSnapshot, today: MissionDay): HabitsView {
  const byHabit = daysByHabit(data.completions);
  const start = weekStart(weekOf(today));
  const view = (habit: Habit): HabitView => {
    const done = byHabit.get(habit.id) ?? [];
    const doneSet = new Set(done);
    return {
      habit,
      doneToday: doneSet.has(today),
      streak: computeStreak(habit.frequency, done, today),
      weekDone: completionsInWeek(done, today),
      weekTarget: weeklyTarget(habit.frequency),
      week: Array.from({ length: weekEnd(weekOf(today)) - start + 1 }, (_, i) => {
        const day = start + i;
        return { day, done: doneSet.has(day), isToday: day === today, future: day > today };
      }),
    };
  };
  const ordered = [...data.habits].sort((a, b) => a.createdDay - b.createdDay || a.name.localeCompare(b.name));
  const stored = new Map(data.badges.map((b) => [b.id, b]));
  return {
    today,
    active: ordered.filter((h) => !h.archived).map(view),
    archived: ordered.filter((h) => h.archived).map(view),
    progress: levelProgress(totalPoints(data.habits, data.completions)),
    badges: BADGE_IDS.map((id) => ({ ...BADGES[id], earned: stored.has(id), unlockedDay: stored.get(id)?.unlockedDay ?? null })),
  };
}
