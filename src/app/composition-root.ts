import { DemoClock } from '../adapters/demo-clock';
import type { DemoClockPosition } from '../adapters/demo-clock';
import { openDexieRecordStore } from '../adapters/dexie-record-store';
import { emptyHistory } from '../adapters/empty-history';
import { createMemoryRecordStore } from '../adapters/memory-record-store';
import { createModePreference } from '../adapters/mode-preference';
import { seededHistory } from '../adapters/seeded-history';
import { WallClock, defaultMissionConfig } from '../adapters/wall-clock';
import { brand } from '../brand/brand.config';
import type { BrandConfig } from '../brand/brand.types';
import type { MissionConfig } from '../adapters/wall-clock';
import type { ModePreference, RecordStore } from '../core/ports';
import { knowledge } from '../knowledge';
import { MISSION_META_KEY } from './adapters';
import type { Adapters } from './adapters';
import { CLOCK_META_KEY } from './demo/demo-use-cases';
import { DB_NAME, MODE_STORAGE_KEY, isAppMode } from './mode';
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

export interface ComposeOptions {
  nowMs?: () => number;
  /** Injected in tests; defaults to Dexie with memory fallback. */
  open?: (name: string, wipeOnSchemaError: boolean) => Promise<StoreOpenResult>;
}

/**
 * Builds the adapter set for ONE mode. LIVE opens `astravexi-live` and DEMO opens `astravexi-demo`;
 * nothing is shared between them, and the core never learns which mode it runs in.
 */
export async function composeAdapters(mode: AppMode, options: ComposeOptions = {}): Promise<Adapters> {
  const nowMs = options.nowMs ?? Date.now;
  const open = options.open ?? openStore;

  if (mode === 'demo') {
    const { store, storageAvailable } = await open(DB_NAME.demo, true);
    const saved = await store.getMeta<DemoClockPosition>(CLOCK_META_KEY);
    return {
      mode,
      storageAvailable,
      deps: {
        store,
        clock: new DemoClock(saved, nowMs), // re-anchors: no time passes while the tab was closed
        history: seededHistory,
        knowledge,
        seed: DEMO_SEED,
        crewMember: 'Demo crew member',
      },
    };
  }

  const { store, storageAvailable } = await open(DB_NAME.live, false);
  const saved = await store.getMeta<MissionConfig>(MISSION_META_KEY);
  return {
    mode,
    storageAvailable,
    hasMissionConfig: saved !== undefined,
    deps: {
      store,
      clock: new WallClock(saved ?? defaultMissionConfig(nowMs()), nowMs),
      history: emptyHistory,
      knowledge,
      seed: 0,
      crewMember: 'Crew member',
    },
  };
}

export function createBrowserModePreference(): ModePreference<AppMode> {
  let storage: Storage | undefined;
  try {
    storage = typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    storage = undefined; // access itself can throw when storage is blocked
  }
  return createModePreference<AppMode>(storage, MODE_STORAGE_KEY, isAppMode);
}
