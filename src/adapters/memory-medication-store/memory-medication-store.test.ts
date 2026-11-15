import { expect, it } from 'vitest';
import { medication, medicationStoreContract } from '../medication-store.contract';
import { createMemoryMedicationStore } from './index';

medicationStoreContract('memory', async () => createMemoryMedicationStore());

it('hands out copies: mutating a result does not change the store', async () => {
  const store = createMemoryMedicationStore();
  await store.putMedication(medication('a'));
  const [row] = await store.listMedications();
  row!.name = 'Tampered';
  expect((await store.listMedications())[0]!.name).toBe('Med a');
});
