import { expect, it } from 'vitest';
import { profile, profileStoreContract } from '../profile-store.contract';
import { createMemoryProfileStore } from './index';

profileStoreContract('memory', async () => createMemoryProfileStore());

it('hands out copies: mutating a result does not change the store', async () => {
  const store = createMemoryProfileStore();
  await store.upsert(profile('a'));
  const [row] = await store.list();
  row!.name = 'Tampered';
  expect((await store.get('a'))?.name).toBe('Name a');
});
