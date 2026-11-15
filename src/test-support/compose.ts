import { createActiveProfile } from '../adapters/active-profile';
import { createMemoryProfileStore } from '../adapters/memory-profile-store';
import { createMemoryRecordStore } from '../adapters/memory-record-store';
import { createPinHasher } from '../adapters/pin-hasher';
import type { ActiveProfile, ProfileStore, RecordStore } from '../core/ports';
import type { CrewProfile, Role } from '../core/profiles/model';
import { composeAdapters } from '../app/composition-root';
import type { ComposeOptions, StoreOpenResult } from '../app/composition-root';
import { createProfileSession } from '../app/boot';
import type { AppMode } from '../app/mode';
import { DB_NAME, activeProfileKey, liveDbName } from '../app/mode';
import { createAppStore } from '../app/store/app-store';

const T0 = '2026-06-01T00:00:00.000Z';

/** A profile with a predictable id per role, so tests can name its database. */
export function testProfile(role: Role = 'astronaut', over: Partial<CrewProfile> = {}): CrewProfile {
  return { id: `test-${role}`, name: `Test ${role}`, role, createdAt: T0, updatedAt: T0, deleted: false, ...over };
}

/** A controllable wall time and a set of in-memory databases that outlive each composed app instance. */
export function createTestWorld(startMs = new Date(2026, 5, 15, 9, 0, 0).getTime()) {
  const time = { ms: startMs };
  const databases = new Map<string, RecordStore>();
  const profileStores = new Map<string, ProfileStore>();
  const activeProfiles = new Map<string, ActiveProfile>();
  const opened: string[] = [];
  const wrap = new Map<string, (s: RecordStore) => RecordStore>();

  const open = async (name: string): Promise<StoreOpenResult> => {
    opened.push(name);
    let store = databases.get(name);
    if (!store) {
      const base = createMemoryRecordStore(name);
      store = wrap.get(name)?.(base) ?? base;
      databases.set(name, store);
    }
    return { store, storageAvailable: true };
  };

  const options: ComposeOptions = {
    nowMs: () => time.ms,
    open,
    openProfiles: async (name) => {
      let store = profileStores.get(name);
      if (!store) {
        store = createMemoryProfileStore(name);
        profileStores.set(name, store);
      }
      return { store, storageAvailable: true };
    },
    pin: createPinHasher(1000),
    legacyLiveExists: async () => databases.has(DB_NAME.live),
  };
  const optionsFor = (mode: AppMode): ComposeOptions => {
    let active = activeProfiles.get(mode);
    if (!active) {
      active = createActiveProfile(undefined, activeProfileKey(mode));
      activeProfiles.set(mode, active);
    }
    return { ...options, activeProfile: active };
  };

  /** The database name a profile of this role gets in `mode`. */
  const dbName = (mode: AppMode, role: Role = 'astronaut') =>
    mode === 'demo' ? DB_NAME.demo : liveDbName(testProfile(role).id);

  async function app(mode: AppMode, opts: { role?: Role; profile?: CrewProfile } = {}) {
    const profile = opts.profile ?? testProfile(opts.role ?? 'astronaut');
    const adapters = await composeAdapters(mode, profile, options);
    const store = createAppStore(adapters);
    await store.getState().hydrate();
    return { adapters, store, profile, state: () => store.getState() };
  }

  return {
    time,
    databases,
    profileStores,
    opened,
    options,
    dbName,
    /** Wrap the database of `mode` (for LIVE: of the profile with `role`) before it is first opened. */
    instrument(mode: AppMode, wrapper: (s: RecordStore) => RecordStore, role: Role = 'astronaut') {
      wrap.set(dbName(mode, role), wrapper);
    },
    /** Advance real time by whole seconds. */
    wait(seconds: number) {
      time.ms += seconds * 1000;
    },
    app,
    /** The profile services and "enter the app" step of one mode, on the world's in-memory databases. */
    profileSession: (mode: AppMode) => createProfileSession(mode, optionsFor(mode)),
  };
}

export type TestWorld = ReturnType<typeof createTestWorld>;
