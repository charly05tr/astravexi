import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { medication, medicationStoreContract } from '../medication-store.contract';
import { openDexieMedicationStore } from './index';

let counter = 0;
const uniqueName = () => `astravexi-medical-test-${(counter += 1)}`;

medicationStoreContract('dexie (fake-indexeddb)', () => openDexieMedicationStore(uniqueName()));

it('persists across reopen', async () => {
  const name = uniqueName();
  const first = await openDexieMedicationStore(name);
  await first.putMedication(medication('kept'));
  const reopened = await openDexieMedicationStore(name);
  expect((await reopened.listMedications()).map((m) => m.id)).toEqual(['kept']);
  expect(reopened.persistent).toBe(true);
});
