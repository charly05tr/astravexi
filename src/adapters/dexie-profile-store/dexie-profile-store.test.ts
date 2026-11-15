import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { profile, profileStoreContract } from '../profile-store.contract';
import { openDexieProfileStore } from './index';

let counter = 0;
const uniqueName = () => `astravexi-profiles-test-${(counter += 1)}`;

profileStoreContract('dexie (fake-indexeddb)', () => openDexieProfileStore(uniqueName()));

it('persists across reopen', async () => {
  const name = uniqueName();
  const first = await openDexieProfileStore(name);
  await first.upsert(profile('kept'));
  const reopened = await openDexieProfileStore(name);
  expect((await reopened.list()).map((p) => p.id)).toEqual(['kept']);
  expect(reopened.persistent).toBe(true);
});
