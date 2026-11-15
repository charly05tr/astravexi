import type { DeviceCredentialStore } from '../../core/ports';
import { initialSyncState } from '../../core/sync/model';
import type { DeviceCredentials, SyncState } from '../../core/sync/model';

const copy = <T>(value: T): T => structuredClone(value);

/** In-memory credentials: used in tests. Nothing survives a reload, so the app never uses it for real. */
export function createMemoryDeviceCredentials(): DeviceCredentialStore {
  let credentials: DeviceCredentials | null = null;
  let state: SyncState = initialSyncState();
  return {
    async get() {
      return credentials ? copy(credentials) : null;
    },
    async set(next) {
      credentials = copy(next);
    },
    async clear() {
      credentials = null;
      state = initialSyncState();
    },
    async getState() {
      return copy(state);
    },
    async setState(next) {
      state = copy(next);
    },
  };
}
