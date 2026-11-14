import { describe, expect, it } from 'vitest';
import { createModePreference } from '../adapters/mode-preference';
import { MODE_STORAGE_KEY, isAppMode, resolveMode } from './mode';
import type { AppMode } from './mode';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}
const prefOf = (storage: ReturnType<typeof fakeStorage> | undefined) =>
  createModePreference<AppMode>(storage, MODE_STORAGE_KEY, isAppMode);

describe('resolveMode', () => {
  it('asks when there is no URL parameter and no persisted choice', () => {
    expect(resolveMode('', prefOf(fakeStorage()))).toEqual({ mode: null, source: 'none' });
  });

  it('uses the persisted choice', () => {
    const storage = fakeStorage({ [MODE_STORAGE_KEY]: 'live' });
    expect(resolveMode('', prefOf(storage))).toEqual({ mode: 'live', source: 'preference' });
  });

  it('?mode=demo overrides the persisted choice and does NOT overwrite it', () => {
    const storage = fakeStorage({ [MODE_STORAGE_KEY]: 'live' });
    const pref = prefOf(storage);
    expect(resolveMode('?mode=demo', pref)).toEqual({ mode: 'demo', source: 'url' });
    expect(storage.data[MODE_STORAGE_KEY]).toBe('live');
    expect(resolveMode('', pref).mode).toBe('live');
  });

  it('?mode=demo with no persisted choice does not persist one', () => {
    const storage = fakeStorage();
    resolveMode('?mode=demo', prefOf(storage));
    expect(storage.data).toEqual({});
  });

  it('ignores an invalid URL value and an invalid stored value', () => {
    const storage = fakeStorage({ [MODE_STORAGE_KEY]: 'banana' });
    expect(resolveMode('?mode=nope', prefOf(storage)).mode).toBeNull();
  });
});

describe('mode preference', () => {
  it('persists an explicit choice', () => {
    const storage = fakeStorage();
    prefOf(storage).set('demo');
    expect(storage.data[MODE_STORAGE_KEY]).toBe('demo');
  });

  it('falls back to memory when storage is missing or throws', () => {
    const none = prefOf(undefined);
    none.set('live');
    expect(none.get()).toBe('live');
    const throwing = createModePreference<AppMode>(
      {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
      MODE_STORAGE_KEY,
      isAppMode,
    );
    throwing.set('demo');
    expect(throwing.get()).toBe('demo');
  });
});
