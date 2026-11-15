import { describe, expect, it } from 'vitest';
import type { DeviceCredentialStore } from '../core/ports';
import { initialSyncState } from '../core/sync/model';
import type { DeviceCredentials } from '../core/sync/model';

export const credentials: DeviceCredentials = {
  deviceId: 'dev-1',
  token: 'secret-token',
  deviceName: 'CMO laptop',
  enrolledAt: '2026-06-01T10:00:00.000Z',
};

/** The same behavior is required of the in-memory and the Dexie credential store. */
export function deviceCredentialsContract(label: string, create: () => Promise<DeviceCredentialStore>) {
  describe(`DeviceCredentialStore contract: ${label}`, () => {
    it('starts not enrolled, with a clean sync state', async () => {
      const store = await create();
      expect(await store.get()).toBeNull();
      expect(await store.getState()).toEqual(initialSyncState());
    });

    it('stores and returns the credentials', async () => {
      const store = await create();
      await store.set(credentials);
      expect(await store.get()).toEqual(credentials);
    });

    it('stores and returns the sync state', async () => {
      const store = await create();
      const state = {
        ...initialSyncState(),
        lastSince: '2026-06-01T10:00:00.000000Z',
        pushed: { profiles: '2026-06-01T09:00:00.000Z', records: { p1: '2026-06-01T09:30:00.000Z' } },
      };
      await store.setState(state);
      expect(await store.getState()).toEqual(state);
    });

    it('clear removes the credentials and resets the sync state, watermarks included', async () => {
      const store = await create();
      await store.set(credentials);
      await store.setState({ ...initialSyncState(), lastSince: 'x', lastSyncAt: 'y' });
      await store.clear();
      expect(await store.get()).toBeNull();
      expect(await store.getState()).toEqual(initialSyncState());
    });
  });
}
