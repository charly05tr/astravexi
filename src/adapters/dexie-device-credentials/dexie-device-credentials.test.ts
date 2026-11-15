import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { credentials, deviceCredentialsContract } from '../device-credentials.contract';
import { openDexieDeviceCredentials } from './index';

let counter = 0;
const uniqueName = () => `astravexi-device-test-${(counter += 1)}`;

deviceCredentialsContract('dexie (fake-indexeddb)', () => openDexieDeviceCredentials(uniqueName()));

it('persists across reopen', async () => {
  const name = uniqueName();
  await (await openDexieDeviceCredentials(name)).set(credentials);
  expect(await (await openDexieDeviceCredentials(name)).get()).toEqual(credentials);
});
