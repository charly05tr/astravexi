import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { DeviceCredentialStore } from '../../core/ports';
import { initialSyncState } from '../../core/sync/model';
import type { DeviceCredentials, SyncState } from '../../core/sync/model';

/** The one device-wide database of LIVE sync. Profile databases are `astravexi-live-<uuid>`, so it cannot collide. */
export const DEVICE_DB_NAME = 'astravexi-live-device';

interface KvRow {
  key: string;
  value: unknown;
}

class DeviceDb extends Dexie {
  kv!: Table<KvRow, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({ kv: 'key' });
  }
}

const CREDENTIALS = 'credentials';
const STATE = 'state';

/** Opens the device database. Rejects when IndexedDB is unavailable; the caller then disables sync. */
export async function openDexieDeviceCredentials(name: string = DEVICE_DB_NAME): Promise<DeviceCredentialStore> {
  const db = new DeviceDb(name);
  await db.open();
  return {
    async get() {
      const row = await db.kv.get(CREDENTIALS);
      return (row?.value as DeviceCredentials | undefined) ?? null;
    },
    async set(credentials) {
      await db.kv.put({ key: CREDENTIALS, value: { ...credentials } });
    },
    async clear() {
      await db.transaction('rw', db.kv, async () => {
        await db.kv.delete(CREDENTIALS);
        await db.kv.put({ key: STATE, value: initialSyncState() });
      });
    },
    async getState() {
      const row = await db.kv.get(STATE);
      return { ...initialSyncState(), ...((row?.value as Partial<SyncState> | undefined) ?? {}) };
    },
    async setState(state) {
      await db.kv.put({ key: STATE, value: structuredClone(state) });
    },
  };
}
