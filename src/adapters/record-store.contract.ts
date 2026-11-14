import { describe, expect, it } from 'vitest';
import type { OutboxMessage, Reading } from '../core/health/model';
import type { RecordStore } from '../core/ports';
import { ack, reading } from '../test-support/builders';

const message = (id: string, dedupeKey: string, state: OutboxMessage['state'] = 'queued'): OutboxMessage => ({
  id,
  dedupeKey,
  zoneId: 'heart',
  groupId: 'g1',
  createdAt: 100,
  to: 'flightSurgeon',
  state,
  payload: { crewMember: 'Test', source: 'MANUAL', trigger: [], zoneTiers: {} as OutboxMessage['payload']['zoneTiers'] },
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
      await store.addDecision({ id: 'd1', recommendationId: 'rec', findingKey: 'k', decision: 'dismissed', t: 5 });
      await store.addAck(ack('heart', 'g1', 7));
      await store.addAck(ack('heart', 'g1', 7)); // same (zone, group): one record
      const snap = await store.load();
      expect(snap.manualReadings).toEqual([r]);
      expect(snap.decisions).toHaveLength(1);
      expect(snap.acks).toHaveLength(1);
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
