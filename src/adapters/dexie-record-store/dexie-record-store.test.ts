import 'fake-indexeddb/auto';
import Dexie from 'dexie';
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

describe('schema v1 -> v2 migration (sync-ready ids and updatedAt)', () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  /** Builds a database exactly as the pre-profile app left it, then closes it. */
  async function legacyDb(name: string) {
    const old = new Dexie(name);
    old.version(1).stores({
      manualReadings: 'id, day, indicatorId',
      decisions: 'id, t',
      acks: 'id',
      outbox: 'id, &dedupeKey, state',
      meta: 'key',
    });
    await old.open();
    await old.table('manualReadings').bulkPut([
      { ...reading('heartRate', 64, 2), id: 'ci:100:heartRate' },
      { ...reading('glucose', 90, 2), id: 'ci:100:glucose' },
    ]);
    await old.table('decisions').put({ id: 'dec:5:1', recommendationId: 'r', findingKey: 'k', decision: 'accepted', t: 5 });
    await old.table('acks').put({ id: 'ack:heart:g1', zoneId: 'heart', groupId: 'g1', by: 'cmo', t: 7 });
    await old.table('outbox').put({
      id: 'msg:heart:g1',
      dedupeKey: 'heart:g1',
      zoneId: 'heart',
      groupId: 'g1',
      createdAt: 9,
      to: 'flightSurgeon',
      state: 'queued',
      payload: { crewMember: 'Crew member', source: 'MANUAL', trigger: [], zoneTiers: {} },
    });
    await old.table('meta').put({ key: 'mission', value: { destination: 'Mars' } });
    old.close();
  }

  it('re-keys every row to a UUID, stamps updatedAt and keeps the content', async () => {
    const name = uniqueName();
    await legacyDb(name);
    const store = await openDexieRecordStore(name);
    const snap = await store.load();

    expect(snap.manualReadings).toHaveLength(2);
    expect(snap.manualReadings.map((r) => r.indicatorId).sort()).toEqual(['glucose', 'heartRate']);
    expect(snap.manualReadings.map((r) => r.value).sort()).toEqual([64, 90]);
    for (const row of [...snap.manualReadings, ...snap.decisions, ...snap.acks, ...snap.outbox]) {
      expect(row.id).toMatch(UUID);
      expect(row.updatedAt).toEqual(expect.any(String));
    }
    expect(snap.decisions[0]).toMatchObject({ recommendationId: 'r', decision: 'accepted', t: 5 });
    expect(snap.acks[0]).toMatchObject({ zoneId: 'heart', groupId: 'g1', by: { profileId: 'legacy', role: 'cmo' } });
    expect(snap.outbox[0]).toMatchObject({ dedupeKey: 'heart:g1', state: 'queued' });
    expect(snap.outbox[0]!.payload).toMatchObject({ profileId: 'legacy', crewMember: 'Crew member' });
    expect(await store.getMeta('mission')).toEqual({ destination: 'Mars' });
  });

  it('keeps putOutboxIfAbsent and the ack dedupe working on migrated rows', async () => {
    const name = uniqueName();
    await legacyDb(name);
    const store = await openDexieRecordStore(name);
    const [existing] = (await store.load()).outbox;
    expect(await store.putOutboxIfAbsent({ ...existing!, id: crypto.randomUUID() })).toBe(false);
    const [oldAck] = (await store.load()).acks;
    await store.addAck({ ...oldAck!, id: crypto.randomUUID() });
    expect((await store.load()).acks).toHaveLength(1);
  });

  it('a second open does not migrate again (ids stay stable)', async () => {
    const name = uniqueName();
    await legacyDb(name);
    const first = (await (await openDexieRecordStore(name)).load()).manualReadings.map((r) => r.id).sort();
    const second = (await (await openDexieRecordStore(name)).load()).manualReadings.map((r) => r.id).sort();
    expect(second).toEqual(first);
  });
});
