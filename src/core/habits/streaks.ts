import type { MissionDay } from '../health/model';
import type { HabitFrequency } from './model';

export const DAYS_PER_WEEK = 7;
/** A daily habit earns a streak bonus every this many consecutive days. */
export const DAILY_MILESTONE = 7;
/** A weekly habit earns a streak bonus every this many consecutive weeks that met the target. */
export const WEEKLY_MILESTONE = 4;

/** Mission weeks are fixed blocks of seven days counted from day 1. */
export const weekOf = (day: MissionDay): number => Math.floor((day - 1) / DAYS_PER_WEEK);
export const weekStart = (week: number): MissionDay => week * DAYS_PER_WEEK + 1;
export const weekEnd = (week: number): MissionDay => weekStart(week) + DAYS_PER_WEEK - 1;

export interface StreakInfo {
  /** Consecutive days (daily habit) or weeks (weekly habit). */
  current: number;
  best: number;
  unit: 'day' | 'week';
}

/** How many completions a habit needs in a mission week to meet its target. */
export const weeklyTarget = (frequency: HabitFrequency): number =>
  frequency.kind === 'daily' ? DAYS_PER_WEEK : frequency.times;

/** Lengths of every maximal run of consecutive integers in `values` (a set). */
function runs(values: ReadonlySet<number>): number[] {
  const lengths: number[] = [];
  for (const v of values) {
    if (values.has(v - 1)) continue; // not the start of a run
    let n = 0;
    while (values.has(v + n)) n += 1;
    lengths.push(n);
  }
  return lengths;
}

/** The units (days or weeks) in which the habit was done (daily) or met its weekly target (weekly). */
function metUnits(frequency: HabitFrequency, completionDays: readonly MissionDay[]): Set<number> {
  const days = new Set(completionDays);
  if (frequency.kind === 'daily') return days;
  const perWeek = new Map<number, number>();
  for (const day of days) perWeek.set(weekOf(day), (perWeek.get(weekOf(day)) ?? 0) + 1);
  return new Set([...perWeek].filter(([, count]) => count >= frequency.times).map(([week]) => week));
}

/**
 * Current and best streak of one habit. Today (or the current week) not being done yet does not break the
 * current streak: it counts back from yesterday (or from last week) until the unit is done.
 */
export function computeStreak(frequency: HabitFrequency, completionDays: readonly MissionDay[], today: MissionDay): StreakInfo {
  const met = metUnits(frequency, completionDays);
  const unit = frequency.kind === 'daily' ? 'day' : 'week';
  const now = frequency.kind === 'daily' ? today : weekOf(today);
  let cursor = met.has(now) ? now : now - 1;
  let current = 0;
  while (met.has(cursor)) {
    current += 1;
    cursor -= 1;
  }
  return { current, best: Math.max(0, ...runs(met)), unit };
}

/** How many streak milestones the habit's history has earned: every full 7 days (daily) or 4 weeks (weekly). */
export function milestonesEarned(frequency: HabitFrequency, completionDays: readonly MissionDay[]): number {
  const size = frequency.kind === 'daily' ? DAILY_MILESTONE : WEEKLY_MILESTONE;
  return runs(metUnits(frequency, completionDays)).reduce((sum, length) => sum + Math.floor(length / size), 0);
}

/** Completions a habit has in the mission week of `day`. */
export function completionsInWeek(completionDays: readonly MissionDay[], day: MissionDay): number {
  const week = weekOf(day);
  return new Set(completionDays.filter((d) => weekOf(d) === week)).size;
}

/** Whether the habit met its target in `week`. */
export function metInWeek(frequency: HabitFrequency, completionDays: readonly MissionDay[], week: number): boolean {
  return completionsInWeek(completionDays, weekStart(week)) >= weeklyTarget(frequency);
}
