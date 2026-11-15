import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { Co2Reference } from '../../core/environment/co2';
import type { CabinReferenceCache } from '../../core/ports';
import { createMemoryReferenceCache } from './index';

interface CachedRow {
  key: string;
  reference: Co2Reference;
  fetchedAt: string;
}

class EnvironmentDb extends Dexie {
  reference!: Table<CachedRow, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ reference: 'key' });
  }
}

export const ENVIRONMENT_DB_NAME = 'astravexi-environment';
const KEY = 'nasa-osdr-co2';

/** Keeps the last good NASA reference in its own database. Falls back to memory when IndexedDB is unavailable. */
export async function openEnvironmentCache(name: string = ENVIRONMENT_DB_NAME): Promise<CabinReferenceCache> {
  try {
    const db = new EnvironmentDb(name);
    await db.open();
    return {
      async load() {
        const row = await db.reference.get(KEY);
        return row ? { reference: row.reference, fetchedAt: row.fetchedAt } : null;
      },
      async save(reference, fetchedAt) {
        await db.reference.put({ key: KEY, reference, fetchedAt });
      },
    };
  } catch {
    return createMemoryReferenceCache();
  }
}
