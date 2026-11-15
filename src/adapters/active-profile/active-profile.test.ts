import { expect, it } from 'vitest';
import { createActiveProfile } from './index';

const fakeStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
};

it('gets, sets and clears the active profile id', () => {
  const pref = createActiveProfile(fakeStorage(), 'k');
  expect(pref.get()).toBeNull();
  pref.set('abc');
  expect(pref.get()).toBe('abc');
  pref.clear();
  expect(pref.get()).toBeNull();
});

it('survives blocked storage by keeping the value in memory', () => {
  const blocked = () => {
    throw new Error('blocked');
  };
  const pref = createActiveProfile({ getItem: blocked, setItem: blocked, removeItem: blocked }, 'k');
  pref.set('abc');
  expect(pref.get()).toBe('abc');
  pref.clear();
  expect(pref.get()).toBeNull();
});
