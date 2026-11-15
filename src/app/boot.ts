import type { CrewProfile } from '../core/profiles/model';
import {
  composeAdapters,
  composeProfileServices,
  composeSyncService,
  createBrowserModePreference,
} from './composition-root';
import type { ComposeOptions, ProfileServices } from './composition-root';
import { resolveMode } from './mode';
import type { AppMode } from './mode';
import { createAppStore } from './store/app-store';
import type { AppStore } from './store/app-store';
import type { SyncService } from './sync/sync-service';

/** Profiles of the resolved mode, plus the way into the app once a profile is picked. */
export interface ProfileSession {
  services: ProfileServices;
  /** The device sync service; null in DEMO and whenever `VITE_API_URL` is not set. */
  sync: SyncService | null;
  /** Builds the adapters and the app store for `profile`. LIVE opens that profile's own database. */
  enter(profile: CrewProfile): Promise<AppStore>;
}

export type BootResult = { kind: 'choose'; choose(mode: AppMode): void } | { kind: 'ready'; session: ProfileSession };

/** Opens the profile services of `mode` and ties the "enter the app" step to them. */
export async function createProfileSession(mode: AppMode, options: ComposeOptions = {}): Promise<ProfileSession> {
  const services = await composeProfileServices(mode, options);
  return {
    services,
    sync: await composeSyncService(services, options),
    async enter(profile) {
      await services.adoptLegacyIfPending(profile);
      return createAppStore(await composeAdapters(mode, profile, { ...options, profiles: services.profiles }));
    },
  };
}

/**
 * Resolve the mode (URL override > persisted choice > ask), then open that mode's profiles. The app store
 * itself is built later, once a profile is picked: LIVE data is per profile.
 * A `?mode=` override is used for this load only; it never overwrites the persisted choice.
 */
export async function boot(search: string): Promise<BootResult> {
  const preference = createBrowserModePreference();
  const { mode } = resolveMode(search, preference);
  if (mode === null) {
    return {
      kind: 'choose',
      choose(chosen) {
        preference.set(chosen); // the explicit choice is the only thing that persists
        window.location.reload();
      },
    };
  }
  return { kind: 'ready', session: await createProfileSession(mode) };
}
