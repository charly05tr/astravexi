import { createActiveProfile } from '../adapters/active-profile';
import { openDexieDeviceCredentials } from '../adapters/dexie-device-credentials';
import { createHttpSyncGateway } from '../adapters/http-sync-gateway';
import { DemoClock } from '../adapters/demo-clock';
import { createVisibleRecordStore } from '../adapters/visible-record-store';
import { playbackFor } from './playback/playback-controller';
import type { PlaybackOptions } from './playback/playback-controller';
import type { DemoClockPosition } from '../adapters/demo-clock';
import { openDexieMedicationStore } from '../adapters/dexie-medication-store';
import { openDexieProfileStore } from '../adapters/dexie-profile-store';
import { dexieDatabaseExists, openDexieRecordStore } from '../adapters/dexie-record-store';
import { emptyHistory } from '../adapters/empty-history';
import { createNasaOsdrEnvironment } from '../adapters/nasa-osdr-environment';
import { openEnvironmentCache } from '../adapters/nasa-osdr-environment/dexie-cache';
import { createSimulatedCabinTimeline, withScenarioEpisodes } from '../adapters/seeded-history/cabin-timeline';
import { crewIndexOf } from './demo/demo-scenario';
import type { DemoScenario } from './demo/demo-scenario';
import { createMemoryMedicationStore } from '../adapters/memory-medication-store';
import { createMemoryProfileStore } from '../adapters/memory-profile-store';
import { createMemoryRecordStore } from '../adapters/memory-record-store';
import { createModePreference } from '../adapters/mode-preference';
import { createPinHasher } from '../adapters/pin-hasher';
import { calmHistory, seededHistory } from '../adapters/seeded-history';

/** The DEMO histories carry the scripted attribution episodes (the base histories stay untouched). */
const demoHistory = withScenarioEpisodes(seededHistory);
const demoCalmHistory = withScenarioEpisodes(calmHistory);
import { WallClock, defaultMissionConfig } from '../adapters/wall-clock';
import { brand } from '../brand/brand.config';
import type { BrandConfig } from '../brand/brand.types';
import type { MissionConfig } from '../adapters/wall-clock';
import type {
  ActiveProfile,
  CabinReferenceCache,
  CabinReferenceSource,
  DeviceCredentialStore,
  MedicationStore,
  ModePreference,
  PinHasher,
  ProfileStore,
  RecordStore,
  SyncGateway,
} from '../core/ports';
import { toActor } from '../core/profiles/model';
import type { Actor, CrewProfile, Role } from '../core/profiles/model';
import type { CrewMemberData, CrewSource } from '../core/use-cases/crew';
import { createProfile } from '../core/use-cases/profiles';
import type { ProfileDeps, ProfileResult } from '../core/use-cases/profiles';
import { knowledge } from '../knowledge';
import { MISSION_META_KEY } from './adapters';
import type { Adapters } from './adapters';
import { createSyncService } from './sync/sync-service';
import type { SyncService } from './sync/sync-service';
import { DEMO_ASTRONAUT_ID, DEMO_CREW_EXTRAS, DEMO_SUBJECT_NAME, RETIRED_DEMO_CREW_IDS, demoProfiles } from './demo/demo-profiles';
import { seedDemoMedical } from './demo/demo-medical';
import { CLOCK_META_KEY } from './demo/demo-use-cases';
import { copyLegacyLiveData } from './legacy-live';
import {
  DB_NAME,
  LEGACY_LIVE_DB,
  MEDICAL_DB_NAME,
  MODE_STORAGE_KEY,
  PROFILES_DB_NAME,
  activeProfileKey,
  demoCrewDbName,
  isAppMode,
  liveDbName,
} from './mode';
import type { AppMode } from './mode';

export const DEMO_SEED = 20260;

/** The brand is chosen here and injected from main.tsx; no other module imports brand.config. */
export const brandConfig: BrandConfig = brand;

export interface StoreOpenResult {
  store: RecordStore;
  storageAvailable: boolean;
}

/** Opens the Dexie database for `name`, or falls back to memory (entries will not be kept). */
export async function openStore(name: string, wipeOnSchemaError: boolean): Promise<StoreOpenResult> {
  try {
    return { store: await openDexieRecordStore(name, { wipeOnSchemaError }), storageAvailable: true };
  } catch {
    return { store: createMemoryRecordStore(name), storageAvailable: false };
  }
}

export interface ProfileStoreOpenResult {
  store: ProfileStore;
  storageAvailable: boolean;
}

/** Opens the profile database for `name`, or falls back to memory (profiles will not be kept). */
export async function openProfileStore(name: string): Promise<ProfileStoreOpenResult> {
  try {
    return { store: await openDexieProfileStore(name), storageAvailable: true };
  } catch {
    return { store: createMemoryProfileStore(name), storageAvailable: false };
  }
}

/** Opens the medical database for `name`, or falls back to memory (entries will not be kept). */
export async function openMedicalStore(name: string): Promise<MedicationStore> {
  try {
    return await openDexieMedicationStore(name);
  } catch {
    return createMemoryMedicationStore(name);
  }
}

export interface ComposeOptions {
  nowMs?: () => number;
  /** DEMO only: an evaluation scenario (`?scenario=<id>`) replaces the demo crew history, the cabin and the clock. Ignored in LIVE. */
  scenario?: DemoScenario | null;
  /** Tests inject a scheduler here to drive scenario playback without real time. */
  playback?: PlaybackOptions;
  /** Injected in tests; defaults to Dexie with memory fallback. */
  open?: (name: string, wipeOnSchemaError: boolean) => Promise<StoreOpenResult>;
  /** The profile store the app already opened; the crew review reads the profile list from it. */
  profiles?: ProfileStore;
  /** Injected in tests; defaults to Dexie with memory fallback. */
  openProfiles?: (name: string) => Promise<ProfileStoreOpenResult>;
  /** Injected in tests; defaults to Dexie with memory fallback. */
  openMedical?: (name: string) => Promise<MedicationStore>;
  /** Injected in tests; defaults to NASA OSDR through the configured base URL. */
  cabinReference?: CabinReferenceSource;
  /** Injected in tests; defaults to a Dexie database of its own with memory fallback. */
  cabinCache?: CabinReferenceCache;
  /** Injected in tests; defaults to the platform's `crypto.randomUUID`. */
  newId?: () => string;
  /** Injected in tests; defaults to PBKDF2-SHA256 with 600k iterations. */
  pin?: PinHasher;
  /** Injected in tests; defaults to localStorage. */
  activeProfile?: ActiveProfile;
  /** Injected in tests; defaults to a Dexie existence check on the legacy LIVE database. */
  legacyLiveExists?: () => Promise<boolean>;
  /** Injected in tests; defaults to `VITE_API_URL`. Null or empty disables sync entirely. */
  apiUrl?: string | null;
  /** Injected in tests; defaults to the HTTP adapter on `apiUrl`. */
  syncGateway?: SyncGateway;
  /** Injected in tests; defaults to the device Dexie database. */
  deviceCredentials?: DeviceCredentialStore;
}

/**
 * Builds the adapter set for ONE mode and ONE profile. LIVE opens `astravexi-live-<profileId>` and DEMO opens
 * the shared `astravexi-demo`; nothing is shared between modes, and the core never learns which mode it runs
 * in. `profile` becomes the actor of every use-case.
 */
export async function composeAdapters(
  mode: AppMode,
  profile: CrewProfile,
  options: ComposeOptions = {},
): Promise<Adapters> {
  const nowMs = options.nowMs ?? Date.now;
  const scenario = mode === 'demo' ? (options.scenario ?? null) : null;
  // A scenario never touches the persisted DEMO data: everything it writes lives in memory for this page load.
  const playback = scenario ? playbackFor(scenario, options.playback) : null;
  const baseOpen =
    options.open ??
    (scenario ? async (name: string) => ({ store: createMemoryRecordStore(name), storageAvailable: true }) : openStore);
  // Under playback every store only shows what exists at the playback minute (check-ins, acks, messages stamped later are hidden).
  const open = playback
    ? async (name: string, wipe: boolean): Promise<StoreOpenResult> => {
        const opened = await baseOpen(name, wipe);
        return { ...opened, store: createVisibleRecordStore(opened.store, () => playback.clock.now()) };
      }
    : baseOpen;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const nowIso = () => new Date(nowMs()).toISOString();
  const actor = toActor(profile);
  const profiles =
    options.profiles ?? (await (options.openProfiles ?? openProfileStore)(PROFILES_DB_NAME[mode])).store;

  const medical = await (options.openMedical ?? openMedicalStore)(MEDICAL_DB_NAME[mode]);
  const environment = {
    reference: options.cabinReference ?? createNasaOsdrEnvironment(osdrConfig()),
    cache: options.cabinCache ?? (await openEnvironmentCache()),
    timeline: mode === 'demo' ? (scenario ? scenario.timeline : createSimulatedCabinTimeline(DEMO_SEED)) : null,
  };

  if (mode === 'demo') {
    await seedDemoMedical(medical, nowIso());
    const { store, storageAvailable } = await open(DB_NAME.demo, true);
    const saved = await store.getMeta<DemoClockPosition>(CLOCK_META_KEY);
    const extraStores = new Map<string, Promise<RecordStore>>();
    const extraStore = (id: string) => {
      let opened = extraStores.get(id);
      if (!opened) {
        opened = open(demoCrewDbName(id), true).then((r) => r.store);
        extraStores.set(id, opened);
      }
      return opened;
    };
    return {
      mode,
      storageAvailable,
      scenario: scenario ? { id: scenario.id, name: scenario.name, description: scenario.description, seed: scenario.seed } : null,
      playback,
      medical,
      environment,
      crew: {
        profiles,
        async open(p): Promise<CrewMemberData> {
          if (scenario) {
            const index = crewIndexOf(p.id);
            const own = p.id === DEMO_ASTRONAUT_ID ? store : await extraStore(p.id);
            return { store: own, history: index >= 0 ? scenario.historyFor(index, () => playback!.clock.now()) : emptyHistory, seed: 0 };
          }
          // The demo astronaut owns the DEMO database; the other demo profiles have no records of their own.
          if (p.id === DEMO_ASTRONAUT_ID) return { store, history: demoHistory, seed: DEMO_SEED };
          const extra = DEMO_CREW_EXTRAS.find((c) => c.id === p.id);
          return {
            store: await extraStore(p.id),
            history: extra ? (extra.scenario ? demoHistory : demoCalmHistory) : emptyHistory,
            seed: extra?.seed ?? 0,
          };
        },
      },
      async resetCrew() {
        for (const opened of extraStores.values()) await (await opened).clearAll();
      },
      deps: {
        store,
        // Re-anchors: no time passes while the tab was closed. A scenario starts (and resets) at its own position.
        clock: playback ? playback.clock : new DemoClock(saved, nowMs),
        history: scenario ? scenario.historyFor(0, () => playback!.clock.now()) : demoHistory,
        knowledge,
        seed: scenario ? 0 : DEMO_SEED,
        actor,
        // Both demo profiles look at the same synthetic crew member's data.
        subject: { profileId: DEMO_ASTRONAUT_ID, name: DEMO_SUBJECT_NAME },
        newId,
        nowIso,
      },
    };
  }

  const { store, storageAvailable } = await open(liveDbName(profile.id), false);
  const saved = await store.getMeta<MissionConfig>(MISSION_META_KEY);
  return {
    mode,
    storageAvailable,
    hasMissionConfig: saved !== undefined,
    medical,
    environment,
    crew: {
      profiles,
      // LIVE: each profile owns its database, so a member's records are exactly that database.
      async open(p): Promise<CrewMemberData> {
        return { store: p.id === profile.id ? store : (await open(liveDbName(p.id), false)).store, history: emptyHistory, seed: 0 };
      },
    } satisfies CrewSource,
    deps: {
      store,
      clock: new WallClock(saved ?? defaultMissionConfig(nowMs()), nowMs),
      history: emptyHistory,
      knowledge,
      seed: 0,
      actor,
      subject: { profileId: profile.id, name: profile.name },
      newId,
      nowIso,
    },
  };
}

export interface ProfileServices {
  mode: AppMode;
  profiles: ProfileStore;
  activeProfile: ActiveProfile;
  /** False when IndexedDB is unavailable: profiles live in memory and are lost on reload. */
  storageAvailable: boolean;
  /** What the profile use-cases need. */
  deps: ProfileDeps;
  /**
   * Creates a profile. In LIVE, the very first profile also adopts the pre-profile `astravexi-live` database
   * (when it has data), so nothing recorded before profiles existed is lost.
   */
  create(actor: Actor | null, input: { name: string; role: Role; pin?: string }): Promise<ProfileResult>;
  /**
   * Retries the legacy adoption for the oldest LIVE profile (a no-op once done, or for any other profile), so a
   * copy that failed once is attempted again on the next load.
   */
  adoptLegacyIfPending(profile: CrewProfile): Promise<void>;
}

/** Opens the profile database of one mode and, in DEMO, seeds the demo astronaut and CMO the first time. */
export async function composeProfileServices(mode: AppMode, options: ComposeOptions = {}): Promise<ProfileServices> {
  const nowMs = options.nowMs ?? Date.now;
  const nowIso = () => new Date(nowMs()).toISOString();
  const { store: profiles, storageAvailable } = await (options.openProfiles ?? openProfileStore)(PROFILES_DB_NAME[mode]);
  const activeProfile = options.activeProfile ?? createBrowserActiveProfile(mode);
  const deps: ProfileDeps = {
    profiles,
    pin: options.pin ?? createPinHasher(),
    newId: options.newId ?? (() => crypto.randomUUID()),
    nowIso,
  };

  if (mode === 'demo') {
    const first = (await profiles.list({ includeDeleted: true })).length === 0;
    // Idempotent per profile: a device that already has the first two demo profiles gains the extra crew,
    // and a demo profile that was deleted (its row stays) is not brought back.
    for (const p of demoProfiles(nowIso())) if (!(await profiles.get(p.id))) await profiles.upsert(p);
    for (const id of RETIRED_DEMO_CREW_IDS) {
      const old = await profiles.get(id);
      if (old && !old.deleted) await profiles.softDelete(id, nowIso());
    }
    if (first) activeProfile.set(DEMO_ASTRONAUT_ID); // the first demo visit goes straight in as the astronaut
  }

  return {
    mode,
    profiles,
    activeProfile,
    storageAvailable,
    deps,
    async create(actor, input) {
      const first = (await profiles.list({ includeDeleted: true })).length === 0;
      const result = await createProfile(deps, actor, input);
      if (result.ok && first && mode === 'live') await adoptLegacyLive(result.profile, options);
      return result;
    },
    async adoptLegacyIfPending(profile) {
      if (mode !== 'live') return;
      const [oldest] = await profiles.list({ includeDeleted: true });
      if (oldest?.id === profile.id) await adoptLegacyLive(profile, options);
    },
  };
}

/** NASA OSDR base URL and mission from the build; both optional (see the OSDR adapter for the defaults). */
function osdrConfig(): { baseUrl?: string; mission?: string } {
  const baseUrl = (import.meta.env.VITE_NASA_OSDR_BASE_URL as string | undefined)?.trim();
  const mission = (import.meta.env.VITE_NASA_OSDR_MISSION as string | undefined)?.trim();
  return { baseUrl: baseUrl || undefined, mission: mission || undefined };
}

/** The backend base URL from the build, or null when sync is not configured. */
export function configuredApiUrl(): string | null {
  const raw = import.meta.env.VITE_API_URL as string | undefined;
  const url = raw?.trim().replace(/\/+$/, '');
  return url ? url : null;
}

/**
 * Builds the sync service of the LIVE mode, or null when sync is off: DEMO never syncs, no `VITE_API_URL` means
 * the feature is absent, and without persistent storage there is nowhere to keep the device token or the data.
 */
export async function composeSyncService(services: ProfileServices, options: ComposeOptions = {}): Promise<SyncService | null> {
  if (services.mode !== 'live' || !services.storageAvailable) return null;
  const apiUrl = options.apiUrl === undefined ? configuredApiUrl() : options.apiUrl;
  if (!apiUrl && !options.syncGateway) return null;
  const credentials = options.deviceCredentials ?? (await openDexieDeviceCredentials().catch(() => null));
  if (!credentials) return null;
  const nowMs = options.nowMs ?? Date.now;
  const open = options.open ?? openStore;
  return createSyncService({
    gateway: options.syncGateway ?? createHttpSyncGateway({ baseUrl: apiUrl! }),
    credentials,
    profiles: services.profiles,
    async openRecords(profileId) {
      const { store, storageAvailable } = await open(liveDbName(profileId), false);
      if (!storageAvailable) throw new Error('Local storage is unavailable.');
      return store;
    },
    nowIso: () => new Date(nowMs()).toISOString(),
  });
}

/** Moves the pre-profile LIVE database into `profile`'s database. Never throws: a failure must not block sign-up. */
async function adoptLegacyLive(profile: CrewProfile, options: ComposeOptions): Promise<void> {
  try {
    const exists = await (options.legacyLiveExists ?? (() => dexieDatabaseExists(LEGACY_LIVE_DB)))();
    if (!exists) return;
    const open = options.open ?? openStore;
    const legacy = await open(LEGACY_LIVE_DB, false);
    const target = await open(liveDbName(profile.id), false);
    // Never copy into (or out of) the in-memory fallback: the data would vanish on reload and the legacy
    // database would be marked as migrated. Leave it pending for a later load with working storage.
    if (!legacy.storageAvailable || !target.storageAvailable) return;
    await copyLegacyLiveData(legacy.store, target.store, profile);
  } catch {
    // The legacy database is only read, never emptied, so the data is still there for a retry.
  }
}

function browserStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined; // access itself can throw when storage is blocked
  }
}

export function createBrowserActiveProfile(mode: AppMode): ActiveProfile {
  return createActiveProfile(browserStorage(), activeProfileKey(mode));
}

export function createBrowserModePreference(): ModePreference<AppMode> {
  return createModePreference<AppMode>(browserStorage(), MODE_STORAGE_KEY, isAppMode);
}
