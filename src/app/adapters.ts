import type { WallClock } from '../adapters/wall-clock';
import type { MedicationStore } from '../core/ports';
import type { EnvironmentDeps } from '../core/use-cases/environment';
import type { CrewSource } from '../core/use-cases/crew';
import type { Deps } from '../core/use-cases/session';
import type { DemoDeps } from './demo/demo-use-cases';

/** Meta key of the LIVE mission config in the LIVE database. */
export const MISSION_META_KEY = 'mission';

/** The cabin CO2 ports: the NASA reference and its cache (both modes), and the simulated cabin timeline (DEMO only). */
export type EnvironmentAdapters = Pick<EnvironmentDeps, 'reference' | 'cache' | 'timeline'>;

export interface LiveAdapters {
  mode: 'live';
  deps: Deps & { clock: WallClock };
  /** False until the user saves a mission config (first-run setup); defaults apply meanwhile. */
  hasMissionConfig: boolean;
  /** Where the crew review reads every local profile's records. */
  crew: CrewSource;
  /** The medical kit and the crew's medication and allergy records. */
  medical: MedicationStore;
  /** Cabin CO2: only the NASA reference; there is no simulated cabin in LIVE. */
  environment: EnvironmentAdapters;
  /** False when IndexedDB is unavailable: the memory store is in use and entries will not be kept. */
  storageAvailable: boolean;
}

export interface DemoAdapters {
  mode: 'demo';
  deps: DemoDeps;
  /** Where the crew review reads every local profile's records. */
  crew: CrewSource;
  /** The medical kit and the crew's medication and allergy records, seeded with demo data. */
  medical: MedicationStore;
  /** Cabin CO2: the NASA reference plus the seeded simulated cabin. */
  environment: EnvironmentAdapters;
  /** Empties the databases of the extra demo crew members (the demo astronaut's is reset by `resetDemo`). */
  resetCrew(): Promise<void>;
  storageAvailable: boolean;
}

/** The adapter set for one mode. Only the composition root builds it. */
export type Adapters = LiveAdapters | DemoAdapters;
