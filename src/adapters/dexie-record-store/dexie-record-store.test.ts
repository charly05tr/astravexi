import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { recordStoreContract } from '../record-store.contract';
import { openDexieRecordStore } from './index';
import { reading } from '../../test-support/builders';

let counter = 0;
const uniqueName = () => `astravexi-test-${(counter += 1)}`;

recordStoreContract('dexie (fake-indexeddb)', () => openDexieRecordStore(uniqueName()));

describe('dexie record store', () => {
  it('persists across reopen', async () => {
    const name = uniqueName();
    const first = await openDexieRecordStore(name);
    await first.addReadings([reading('heartRate', 64, 2, { id: 'persisted' })]);
    await first.setMeta('mission', { launchDate: '2026-06-01' });
    const reopened = await openDexieRecordStore(name);
    expect((await reopened.load()).manualReadings.map((r) => r.id)).toEqual(['persisted']);
    expect(await reopened.getMeta('mission')).toEqual({ launchDate: '2026-06-01' });
    expect(reopened.persistent).toBe(true);
  });

  it('one database per mode: clearing the DEMO database leaves the LIVE database untouched', async () => {
    const live = await openDexieRecordStore('astravexi-live-iso');
    const demo = await openDexieRecordStore('astravexi-demo-iso');
    await live.addReadings([reading('heartRate', 64, 2, { id: 'live-1' })]);
    await demo.addReadings([reading('heartRate', 70, 2, { id: 'demo-1' })]);
    await demo.clearAll();
    expect((await demo.load()).manualReadings).toEqual([]);
    expect((await live.load()).manualReadings.map((r) => r.id)).toEqual(['live-1']);
  });
});
