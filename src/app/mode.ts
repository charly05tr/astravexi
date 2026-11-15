import type { ModePreference } from '../core/ports';

export type AppMode = 'live' | 'demo';

export const MODE_STORAGE_KEY = 'astravexi.mode';
export const DB_NAME: Record<AppMode, string> = {
  live: 'astravexi-live',
  demo: 'astravexi-demo',
};

/** Pre-profile LIVE database. New data goes to `liveDbName(profileId)`; this one is only read once, to adopt it. */
export const LEGACY_LIVE_DB = DB_NAME.live;

/** LIVE keeps one record database per profile. */
export const liveDbName = (profileId: string) => `astravexi-live-${profileId}`;

/** DEMO keeps one extra database per synthetic crew member besides the demo astronaut (who owns `DB_NAME.demo`). */
export const demoCrewDbName = (profileId: string) => `astravexi-demo-crew-${profileId}`;

export const PROFILES_DB_NAME: Record<AppMode, string> = {
  live: 'astravexi-live-profiles',
  demo: 'astravexi-demo-profiles',
};

/** The medical kit and records of a mode, shared by every profile of that mode. */
export const MEDICAL_DB_NAME: Record<AppMode, string> = {
  live: 'astravexi-live-medical',
  demo: 'astravexi-demo-medical',
};

export const activeProfileKey = (mode: AppMode) => `astravexi.profile.${mode}`;

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
