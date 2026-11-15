import type { Block } from '../follow-up/blocks';
import { normalizeFrequency } from './frequency';
import type { Habit } from './model';

/** The block types an astronaut can turn into a habit. */
export type HabitBlock = Extract<Block, { type: 'new_habit' | 'routine_change' }>;

export const isHabitBlock = (block: Block): block is HabitBlock => block.type === 'new_habit' || block.type === 'routine_change';

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Stable identity of a suggestion block within one accepted recommendation. The same block saved twice (even
 * from a regenerated answer that repeats it) maps to the same key, so it is stored once.
 */
export function habitSourceKey(recommendationId: string, block: HabitBlock): string {
  const parts = block.type === 'new_habit' ? [block.name, block.frequency, block.timeOfDay] : [block.to, block.when];
  return [recommendationId, block.type, ...parts.map(norm)].join('|');
}

/** A short title for the checkbox label and the toast. */
export function habitBlockName(block: HabitBlock): string {
  return block.type === 'new_habit' ? block.name : block.to;
}

export type HabitDraft = Omit<Habit, 'id' | 'createdDay' | 'archived' | 'updatedAt' | 'origin'>;

/**
 * Maps a suggestion block to a habit. A new habit maps one to one. A routine change becomes a habit named after
 * the behavior it moves to ("to"); its schedule comes from "when", and what it replaces is kept as a note.
 */
export function draftFromBlock(recommendationId: string, block: HabitBlock): HabitDraft {
  const sourceKey = habitSourceKey(recommendationId, block);
  if (block.type === 'new_habit') {
    return {
      name: block.name,
      frequency: normalizeFrequency(block.frequency),
      frequencyText: block.frequency,
      timeOfDay: block.timeOfDay,
      durationMinutes: block.durationMinutes,
      note: null,
      sourceKey,
    };
  }
  return {
    name: block.to,
    frequency: normalizeFrequency(block.when),
    frequencyText: block.when,
    timeOfDay: block.when,
    durationMinutes: null,
    note: `${block.what}: instead of ${block.from}`,
    sourceKey,
  };
}
