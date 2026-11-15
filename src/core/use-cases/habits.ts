import { BADGES, earnedBadges, levelProgress, newBadges, totalPoints } from '../habits/gamification';
import type { BadgeDefinition } from '../habits/gamification';
import { draftFromBlock } from '../habits/from-blocks';
import type { HabitBlock } from '../habits/from-blocks';
import type { Habit, HabitBadge, HabitCompletion, HabitSnapshot } from '../habits/model';
import { assertCan } from '../profiles/policy';
import type { Deps } from './session';

/** Something the astronaut should be told about after a habit action. */
export type HabitEvent = { kind: 'badge'; badge: BadgeDefinition } | { kind: 'level-up'; level: number };

export interface HabitOutcome {
  data: HabitSnapshot;
  events: HabitEvent[];
}

export interface SaveHabitsResult extends HabitOutcome {
  /** Habits stored by this call. */
  saved: number;
  /** Blocks that were already saved earlier and were left alone. */
  skipped: number;
}

export interface ToggleResult extends HabitOutcome {
  /** True when the habit is now checked off for today; false when the check-off was undone (or nothing changed). */
  done: boolean;
}

export async function loadHabitData(deps: Deps): Promise<HabitSnapshot> {
  return deps.store.loadHabits();
}

/**
 * Stores any badge the data has newly earned (once, ever) and reports badges and level-ups. Points and levels are
 * derived from the check-offs, so a level-up is a comparison of the data before and after the action.
 */
async function settle(deps: Deps, before: HabitSnapshot, after: HabitSnapshot): Promise<HabitOutcome> {
  const today = deps.clock.today();
  const events: HabitEvent[] = [];
  const badges: HabitBadge[] = [...after.badges];
  for (const id of newBadges(earnedBadges(after.habits, after.completions, today), after.badges)) {
    const badge: HabitBadge = { id, unlockedDay: today, unlockedAt: deps.nowIso(), updatedAt: deps.nowIso() };
    if (await deps.store.putBadgeIfAbsent(badge)) {
      badges.push(badge);
      events.push({ kind: 'badge', badge: BADGES[id] });
    }
  }
  const was = levelProgress(totalPoints(before.habits, before.completions)).level;
  const now = levelProgress(totalPoints(after.habits, after.completions)).level;
  if (now > was) events.push({ kind: 'level-up', level: now });
  return { data: { ...after, badges }, events };
}

/**
 * Saves the selected suggestion blocks as habits of the current astronaut, with their provenance (the accepted
 * recommendation, the model and the save time). Idempotent: a block already saved is skipped, not duplicated.
 */
export async function saveHabits(
  deps: Deps,
  data: HabitSnapshot,
  input: { recommendationId: string; model: string; blocks: readonly HabitBlock[] },
): Promise<SaveHabitsResult> {
  assertCan(deps.actor.role, 'manageHabits');
  const today = deps.clock.today();
  const habits = [...data.habits];
  let saved = 0;
  let skipped = 0;
  for (const block of input.blocks) {
    const draft = draftFromBlock(input.recommendationId, block);
    const at = deps.nowIso();
    const habit: Habit = {
      ...draft,
      id: deps.newId(),
      createdDay: today,
      archived: false,
      updatedAt: at,
      origin: { recommendationId: input.recommendationId, model: input.model, createdAt: at },
    };
    if (await deps.store.putHabitIfAbsent(habit)) {
      habits.push(habit);
      saved += 1;
    } else {
      skipped += 1;
    }
  }
  const outcome = await settle(deps, data, { ...data, habits });
  return { ...outcome, saved, skipped };
}

/**
 * Checks a habit off for today, or undoes today's check-off. Only today can change: past days are history.
 * An archived or unknown habit is left alone.
 */
export async function toggleCompletion(deps: Deps, data: HabitSnapshot, habitId: string): Promise<ToggleResult> {
  assertCan(deps.actor.role, 'manageHabits');
  const habit = data.habits.find((h) => h.id === habitId);
  if (!habit || habit.archived) return { data, events: [], done: false };
  const day = deps.clock.today();
  const existing = data.completions.find((c) => c.habitId === habitId && c.day === day);
  if (existing) {
    await deps.store.removeCompletion(habitId, day);
    return { data: { ...data, completions: data.completions.filter((c) => c !== existing) }, events: [], done: false };
  }
  const at = deps.nowIso();
  const completion: HabitCompletion = { id: `${habitId}:${day}`, habitId, day, completedAt: at, updatedAt: at };
  await deps.store.putCompletion(completion);
  const after = { ...data, completions: [...data.completions, completion] };
  return { ...(await settle(deps, data, after)), done: true };
}

/** Archives (or restores) a habit. Its check-offs and points stay. */
export async function setHabitArchived(deps: Deps, data: HabitSnapshot, habitId: string, archived: boolean): Promise<HabitSnapshot> {
  assertCan(deps.actor.role, 'manageHabits');
  const habit = data.habits.find((h) => h.id === habitId);
  if (!habit || habit.archived === archived) return data;
  const next: Habit = { ...habit, archived, updatedAt: deps.nowIso() };
  await deps.store.updateHabit(next);
  return { ...data, habits: data.habits.map((h) => (h === habit ? next : h)) };
}

/** Deletes a habit and its check-offs for good. Badges already earned stay. */
export async function deleteHabit(deps: Deps, data: HabitSnapshot, habitId: string): Promise<HabitSnapshot> {
  assertCan(deps.actor.role, 'manageHabits');
  if (!data.habits.some((h) => h.id === habitId)) return data;
  await deps.store.deleteHabit(habitId);
  return {
    ...data,
    habits: data.habits.filter((h) => h.id !== habitId),
    completions: data.completions.filter((c) => c.habitId !== habitId),
  };
}
