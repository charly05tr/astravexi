import { describe, expect, it } from 'vitest';
import type { OutboxMessage, Reading } from '../core/health/model';
import type { RecordStore } from '../core/ports';
import { emptyChanges } from '../core/sync/model';
import { ack, reading } from '../test-support/builders';

const message = (id: string, dedupeKey: string, state: OutboxMessage['state'] = 'queued'): OutboxMessage => ({
  id,
  dedupeKey,
  zoneId: 'heart',
  groupId: 'g1',
  createdAt: 100,
  to: 'flightSurgeon',
  state,
  payload: {
    profileId: 'p-test',
    source: 'MANUAL',
    trigger: [],
    zoneTiers: {} as OutboxMessage['payload']['zoneTiers'],
  },
  updatedAt: '2026-06-01T00:00:00.000Z',
});

/** The same behavior is required of the in-memory and the Dexie store. */
export function recordStoreContract(label: string, create: () => Promise<RecordStore>) {
  describe(`RecordStore contract: ${label}`, () => {
    it('starts empty', async () => {
      const store = await create();
      expect(await store.load()).toEqual({ manualReadings: [], decisions: [], acks: [], outbox: [] });
    });

    it('stores manual readings, decisions and acknowledgements', async () => {
      const store = await create();
      const r: Reading = reading('heartRate', 64, 3, { id: 'r1' });
      await store.addReadings([r]);
      await store.addDecision({
        id: 'd1',
        recommendationId: 'rec',
        findingKey: 'k',
        decision: 'dismissed',
        t: 5,
        updatedAt: '2026-06-01T00:00:00.000Z',
      });
      await store.addAck(ack('heart', 'g1', 7));
      await store.addAck(ack('heart', 'g1', 7)); // same (zone, group): one record
      const snap = await store.load();
      expect(snap.manualReadings).toEqual([r]);
      expect(snap.decisions).toHaveLength(1);
      expect(snap.acks).toHaveLength(1);
    });

    it('acknowledging the same (zone, group) under another id still stores one record', async () => {
      const store = await create();
      await store.addAck(ack('heart', 'g1', 7));
      await store.addAck({ ...ack('heart', 'g1', 9), id: 'another-uuid' });
      await store.addAck({ ...ack('heart', 'g2', 9), id: 'third-uuid' });
      const acks = (await store.load()).acks;
      expect(acks.map((a) => a.id).sort()).toEqual(['ack:heart:g1', 'third-uuid']);
    });

    it('putOutboxIfAbsent is idempotent by dedupeKey', async () => {
      const store = await create();
      expect(await store.putOutboxIfAbsent(message('m1', 'heart:g1'))).toBe(true);
      expect(await store.putOutboxIfAbsent(message('m2', 'heart:g1'))).toBe(false);
      expect(await store.putOutboxIfAbsent(message('m3', 'heart:g2'))).toBe(true);
      expect((await store.load()).outbox.map((m) => m.id).sort()).toEqual(['m1', 'm3']);
    });

    it('updateOutbox writes the given messages', async () => {
      const store = await create();
      await store.putOutboxIfAbsent(message('m1', 'heart:g1'));
      await store.updateOutbox([message('m1', 'heart:g1', 'sent')]);
      expect((await store.load()).outbox[0]?.state).toBe('sent');
    });

    it('keeps meta values by key', async () => {
      const store = await create();
      expect(await store.getMeta('clock')).toBeUndefined();
      await store.setMeta('clock', { day: 150, minute: 1 });
      expect(await store.getMeta('clock')).toEqual({ day: 150, minute: 1 });
    });

    describe('sync', () => {
      const T1 = '2026-06-01T10:00:00.000Z';
      const T2 = '2026-06-01T11:00:00.000Z';
      const T3 = '2026-06-01T12:00:00.000Z';
      const at = (r: Reading, updatedAt: string): Reading => ({ ...r, updatedAt });

      it('changedSince(null) returns every row of every kind, and meta rows with their key', async () => {
        const store = await create();
        await store.addReadings([at(reading('heartRate', 64, 3, { id: 'r1' }), T1)]);
        await store.addDecision({ id: 'd1', recommendationId: 'x', findingKey: 'k', decision: 'accepted', t: 1, updatedAt: T1 });
        await store.addAck({ ...ack('heart', 'g1', 7), updatedAt: T1 });
        await store.putOutboxIfAbsent(message('m1', 'heart:g1'));
        await store.setMeta('mission', { destination: 'Mars' });
        const all = await store.changedSince(null);
        expect(all.manualReadings.map((r) => r.id)).toEqual(['r1']);
        expect(all.decisions.map((d) => d.id)).toEqual(['d1']);
        expect(all.acks).toHaveLength(1);
        expect(all.outbox.map((m) => m.id)).toEqual(['m1']);
        expect(all.meta).toEqual([expect.objectContaining({ key: 'mission', value: { destination: 'Mars' } })]);
      });

      it('changedSince(t) keeps rows at or after t (the boundary is included) and drops older ones', async () => {
        const store = await create();
        await store.addReadings([
          at(reading('heartRate', 60, 1, { id: 'old' }), T1),
          at(reading('heartRate', 61, 2, { id: 'edge' }), T2),
          at(reading('heartRate', 62, 3, { id: 'new' }), T3),
        ]);
        const changed = await store.changedSince(T2);
        expect(changed.manualReadings.map((r) => r.id).sort()).toEqual(['edge', 'new']);
        expect(await store.changedSince('2030-01-01T00:00:00.000Z')).toEqual(emptyChanges());
      });

      it('applyRemote is last-write-wins: inserts, replaces with a newer row, never overwrites a newer or equal one', async () => {
        const store = await create();
        const base = at(reading('heartRate', 60, 1, { id: 'r1' }), T2);
        await store.addReadings([base]);
        const incoming = (value: number, updatedAt: string): Reading => ({ ...base, value, updatedAt });

        expect(await store.applyRemote({ ...emptyChanges(), manualReadings: [incoming(99, T1)] })).toBe(0); // older
        expect(await store.applyRemote({ ...emptyChanges(), manualReadings: [incoming(98, T2)] })).toBe(0); // equal
        expect((await store.load()).manualReadings[0]?.value).toBe(60);

        expect(await store.applyRemote({ ...emptyChanges(), manualReadings: [incoming(70, T3)] })).toBe(1); // newer
        expect((await store.load()).manualReadings[0]?.value).toBe(70);

        const fresh = { ...base, id: 'r2', updatedAt: T1 };
        expect(await store.applyRemote({ ...emptyChanges(), manualReadings: [fresh] })).toBe(1); // absent
        expect((await store.load()).manualReadings).toHaveLength(2);
      });

      it('applyRemote compares instants, not strings (the server writes microseconds)', async () => {
        const store = await create();
        await store.addReadings([at(reading('heartRate', 60, 1, { id: 'r1' }), '2026-06-01T10:00:00.123Z')]);
        const same = { ...reading('heartRate', 99, 1, { id: 'r1' }), updatedAt: '2026-06-01T10:00:00.123000Z' };
        expect(await store.applyRemote({ ...emptyChanges(), manualReadings: [same] })).toBe(0);
      });

      it('applyRemote is idempotent', async () => {
        const store = await create();
        const changes = { ...emptyChanges(), manualReadings: [at(reading('glucose', 90, 1, { id: 'g' }), T1)] };
        expect(await store.applyRemote(changes)).toBe(1);
        expect(await store.applyRemote(changes)).toBe(0);
        expect((await store.load()).manualReadings).toHaveLength(1);
      });

      it('applyRemote skips an ack for an already acknowledged (zone, group) under another id, and a taken dedupeKey', async () => {
        const store = await create();
        await store.addAck({ ...ack('heart', 'g1', 7), updatedAt: T1 });
        await store.putOutboxIfAbsent(message('m1', 'heart:g1'));
        const n = await store.applyRemote({
          ...emptyChanges(),
          acks: [{ ...ack('heart', 'g1', 9), id: 'remote-ack', updatedAt: T3 }],
          outbox: [{ ...message('remote-m', 'heart:g1'), updatedAt: T3 }],
        });
        expect(n).toBe(0);
        const snap = await store.load();
        expect(snap.acks.map((a) => a.id)).toEqual(['ack:heart:g1']);
        expect(snap.outbox.map((m) => m.id)).toEqual(['m1']);
      });

      it('applyRemote stores decisions, acks, outbox messages and meta that are new here', async () => {
        const store = await create();
        const n = await store.applyRemote({
          manualReadings: [],
          decisions: [{ id: 'd9', recommendationId: 'x', findingKey: 'k', decision: 'dismissed', t: 1, updatedAt: T1 }],
          acks: [{ ...ack('brain', 'g2', 3), id: 'a9', updatedAt: T1 }],
          outbox: [{ ...message('m9', 'brain:g2'), updatedAt: T1 }],
          meta: [{ key: 'mission', value: { destination: 'Moon' }, updatedAt: T1 }],
        });
        expect(n).toBe(4);
        const snap = await store.load();
        expect(snap.decisions.map((d) => d.id)).toEqual(['d9']);
        expect(snap.acks.map((a) => a.id)).toEqual(['a9']);
        expect(snap.outbox.map((m) => m.id)).toEqual(['m9']);
        expect(await store.getMeta('mission')).toEqual({ destination: 'Moon' });
        // An older meta value does not win.
        await store.applyRemote({
          ...emptyChanges(),
          meta: [{ key: 'mission', value: 'stale', updatedAt: '2020-01-01T00:00:00.000Z' }],
        });
        expect(await store.getMeta('mission')).toEqual({ destination: 'Moon' });
      });
    });

    it('clearAll empties every table and the meta', async () => {
      const store = await create();
      await store.addReadings([reading('glucose', 90, 1)]);
      await store.putOutboxIfAbsent(message('m1', 'heart:g1'));
      await store.setMeta('clock', 1);
      await store.clearAll();
      expect(await store.load()).toEqual({ manualReadings: [], decisions: [], acks: [], outbox: [] });
      expect(await store.getMeta('clock')).toBeUndefined();
    });
  });
}
