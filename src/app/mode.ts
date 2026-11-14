import type { ModePreference } from '../core/ports';

export type AppMode = 'live' | 'demo';

export const MODE_STORAGE_KEY = 'astravexi.mode';
export const DB_NAME: Record<AppMode, string> = {
  live: 'astravexi-live',
  demo: 'astravexi-demo',
};

export function isAppMode(value: unknown): value is AppMode {
  return value === 'live' || value === 'demo';
}

export interface ResolvedMode {
  mode: AppMode | null;
  source: 'url' | 'preference' | 'none';
}

/**
 * `?mode=live|demo` wins over the persisted choice. This function never writes: a URL override
 * does not overwrite the persisted choice. Only an explicit `preference.set` does.
 */
export function resolveMode(search: string, preference: ModePreference<AppMode>): ResolvedMode {
  const fromUrl = new URLSearchParams(search).get('mode');
  if (isAppMode(fromUrl)) return { mode: fromUrl, source: 'url' };
  const stored = preference.get();
  if (isAppMode(stored)) return { mode: stored, source: 'preference' };
  return { mode: null, source: 'none' };
}
