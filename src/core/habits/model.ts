import type { MissionDay } from '../health/model';

/** How often a habit is due: every day, or a number of times in each mission week (1 to 6). */
export type HabitFrequency = { kind: 'daily' } | { kind: 'weekly'; times: number };

/** Where a saved habit came from: the accepted recommendation and the model that proposed it. */
export interface HabitOrigin {
  recommendationId: string;
  model: string;
  /** ISO-8601 time the habit was saved. */
  createdAt: string;
}

export interface Habit {
  id: string;
  name: string;
  frequency: HabitFrequency;
  /** The wording the AI used for the frequency, kept for display next to the normalized value. */
  frequencyText: string;
  timeOfDay: string | null;
  durationMinutes: number | null;
  /** Extra context, e.g. the "from" behavior of a routine change. */
  note: string | null;
  /** Stable fingerprint of the suggestion block: saving the same block twice stores one habit. */
  sourceKey: string;
  origin: HabitOrigin;
  /** Mission day the habit was saved. */
  createdDay: MissionDay;
  archived: boolean;
  updatedAt: string;
}

/** One check-off. The id is `habitId:day`, so a habit has at most one completion per day. */
export interface HabitCompletion {
  id: string;
  habitId: string;
  day: MissionDay;
  /** ISO-8601 time of the check-off. */
  completedAt: string;
  updatedAt: string;
}

export const BADGE_IDS = ['first_habit', 'first_completion', 'streak_7', 'perfect_week'] as const;
export type BadgeId = (typeof BADGE_IDS)[number];

/** A badge the astronaut earned. Stored once; never removed, even if a check-off is later undone. */
export interface HabitBadge {
  id: BadgeId;
  unlockedDay: MissionDay;
  unlockedAt: string;
  updatedAt: string;
}

/** Everything the record store keeps for habits. Never synced: it stays on the device. */
export interface HabitSnapshot {
  habits: Habit[];
  completions: HabitCompletion[];
  badges: HabitBadge[];
}

export const emptyHabitSnapshot = (): HabitSnapshot => ({ habits: [], completions: [], badges: [] });
