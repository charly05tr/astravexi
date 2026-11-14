import type { WallClock } from '../adapters/wall-clock';
import type { Deps } from '../core/use-cases/session';
import type { DemoDeps } from './demo/demo-use-cases';

/** Meta key of the LIVE mission config in the LIVE database. */
export const MISSION_META_KEY = 'mission';

export interface LiveAdapters {
  mode: 'live';
  deps: Deps & { clock: WallClock };
  /** False until the user saves a mission config (first-run setup); defaults apply meanwhile. */
  hasMissionConfig: boolean;
  /** False when IndexedDB is unavailable: the memory store is in use and entries will not be kept. */
  storageAvailable: boolean;
}

export interface DemoAdapters {
  mode: 'demo';
  deps: DemoDeps;
  storageAvailable: boolean;
}

/** The adapter set for one mode. Only the composition root builds it. */
export type Adapters = LiveAdapters | DemoAdapters;
