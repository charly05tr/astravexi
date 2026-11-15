import { describe, expect, it } from 'vitest';
import type { OutboxMessage, Reading } from '../../core/health/model';
import { createMemoryRecordStore } from '../memory-record-store';
import { createVisibleRecordStore } from './index';

const reading = (id: string, t: number): Reading => ({
  id,
  indicatorId: 'heartRate',
  value: 60,
  day: Math.floor(t / 1440) + 1,
  t,
  source: 'MANUAL',
  context: 'rest',
  symptomatic: false,
  groupId: `g${t}`,
  updatedAt: '2026-06-01T00:00:00.000Z',
});

const message = (over: Partial<OutboxMessage>): OutboxMessage => ({
  id: 'm',
  dedupeKey: 'heart:g1',
  zoneId: 'heart',
  groupId: 'g1',
  createdAt: 100,
  to: 'flightSurgeon',
  payload: { profileId: 'p', source: 'MANUAL', trigger: [], zoneTiers: {} as never },
  state: 'sent',
  sentAt: 120,
  oneWayDelayMin: 12,
  replyPossibleAt: 144,
  updatedAt: '2026-06-01T00:00:00.000Z',
  ...over,
});

describe('visible record store', () => {
  it('hides what is stamped after the playback minute and brings it back when the clock catches up', async () => {
    let now = 50;
    const inner = createMemoryRecordStore('scenario');
    const store = createVisibleRecordStore(inner, () => now);
    await store.addReadings([reading('a', 40), reading('b', 500)]);
    await store.putOutboxIfAbsent(message({}));
    expect((await store.load()).manualReadings.map((r) => r.id)).toEqual(['a']);
    expect((await store.load()).outbox).toEqual([]);
    now = 110; // created, not yet sent
    const queued = (await store.load()).outbox[0]!;
    expect(queued.state).toBe('queued');
    expect(queued.sentAt).toBeUndefined();
    now = 130; // sent, the reply is not possible yet
    expect((await store.load()).outbox[0]!.state).toBe('sent');
    now = 1000;
    const snapshot = await store.load();
    expect(snapshot.manualReadings.map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(snapshot.outbox[0]!.sentAt).toBe(120);
  });
});
