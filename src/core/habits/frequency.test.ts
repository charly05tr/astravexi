import { describe, expect, it } from 'vitest';
import { draftFromBlock, habitSourceKey } from './from-blocks';
import { frequencyLabel, normalizeFrequency } from './frequency';

const weekly = (times: number) => ({ kind: 'weekly', times });
const daily = { kind: 'daily' };

describe('normalizeFrequency', () => {
  it.each([
    ['Daily', daily],
    ['every day', daily],
    ['Every morning', daily],
    ['nightly', daily],
    ['twice a day', daily],
    ['3 times a day', daily],
    ['7 times a week', daily],
    ['3 times a week', weekly(3)],
    ['3x/week', weekly(3)],
    ['4 x per week', weekly(4)],
    ['3/week', weekly(3)],
    ['Three times per week', weekly(3)],
    ['twice a week', weekly(2)],
    ['twice weekly', weekly(2)],
    ['once a week', weekly(1)],
    ['Weekly', weekly(1)],
    ['weekdays', weekly(5)],
    ['Mon-Fri', weekly(5)],
    ['weekends', weekly(2)],
    ['every other day', weekly(3)],
    ['Mon, Wed, Fri', weekly(3)],
    ['Tuesdays and Thursdays', weekly(2)],
    ['every Sunday', weekly(1)],
  ])('reads %j', (text, expected) => {
    expect(normalizeFrequency(text)).toEqual(expected);
  });

  it('falls back to daily when it cannot read the text', () => {
    for (const text of ['', '   ', 'whenever you feel like it', 'as needed', 'sun exposure in the morning light']) {
      expect(normalizeFrequency(text), text).toEqual(daily);
    }
  });

  it('never returns a weekly target outside 1 to 6', () => {
    expect(normalizeFrequency('0 times a week')).toEqual(daily);
    expect(normalizeFrequency('12 times a week')).toEqual(daily);
  });

  it('labels both shapes', () => {
    expect(frequencyLabel({ kind: 'daily' })).toBe('Every day');
    expect(frequencyLabel({ kind: 'weekly', times: 1 })).toBe('Once a week');
    expect(frequencyLabel({ kind: 'weekly', times: 3 })).toBe('3 times a week');
  });
});

describe('draftFromBlock', () => {
  const newHabit = { type: 'new_habit', name: 'Evening wind-down', frequency: '3 times a week', timeOfDay: 'Before sleep', durationMinutes: 15 } as const;
  const change = { type: 'routine_change', what: 'Screen time', from: 'Phone in bed', to: 'Read a paper book', when: 'every evening' } as const;

  it('maps a new habit one to one and normalizes its frequency', () => {
    expect(draftFromBlock('rec-1', newHabit)).toMatchObject({
      name: 'Evening wind-down',
      frequency: { kind: 'weekly', times: 3 },
      frequencyText: '3 times a week',
      timeOfDay: 'Before sleep',
      durationMinutes: 15,
      note: null,
    });
  });

  it('maps a routine change to a habit named after the behavior it moves to', () => {
    expect(draftFromBlock('rec-1', change)).toMatchObject({
      name: 'Read a paper book',
      frequency: { kind: 'daily' },
      timeOfDay: 'every evening',
      durationMinutes: null,
      note: 'Screen time: instead of Phone in bed',
    });
  });

  it('gives the same block the same key, ignoring case and spacing, and different blocks or recommendations other keys', () => {
    const key = habitSourceKey('rec-1', newHabit);
    expect(habitSourceKey('rec-1', { ...newHabit, name: '  evening   WIND-down ' })).toBe(key);
    expect(habitSourceKey('rec-1', { ...newHabit, durationMinutes: 30 })).toBe(key); // the identity is what it is, not how long
    expect(habitSourceKey('rec-2', newHabit)).not.toBe(key);
    expect(habitSourceKey('rec-1', { ...newHabit, name: 'Stretch' })).not.toBe(key);
    expect(habitSourceKey('rec-1', change)).not.toBe(key);
  });
});
