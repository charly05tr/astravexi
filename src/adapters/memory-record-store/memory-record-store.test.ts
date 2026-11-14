import { describe, expect, it } from 'vitest';
import { recordStoreContract } from '../record-store.contract';
import { createMemoryRecordStore } from './index';
import { reading } from '../../test-support/builders';

recordStoreContract('memory', async () => createMemoryRecordStore());

describe('memory record store', () => {
  it('is flagged as not persistent', () => {
    expect(createMemoryRecordStore().persistent).toBe(false);
  });

  it('returns copies: mutating a loaded record does not change the store', async () => {
    const store = createMemoryRecordStore();
    await store.addReadings([reading('heartRate', 60, 1, { id: 'r1' })]);
    const snap = await store.load();
    snap.manualReadings[0]!.value = 999;
    expect((await store.load()).manualReadings[0]!.value).toBe(60);
  });
});
