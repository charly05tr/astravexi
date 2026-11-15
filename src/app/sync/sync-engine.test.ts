import { describe, expect, it } from 'vitest';
import { createMemoryDeviceCredentials } from '../../adapters/memory-device-credentials';
import { createMemoryProfileStore } from '../../adapters/memory-profile-store';
import { createMemoryRecordStore } from '../../adapters/memory-record-store';
import type { SyncGateway } from '../../core/ports';
import type { RecordStore } from '../../core/ports';
import type { CrewProfile } from '../../core/profiles/model';
import { runSync } from '../../core/sync/engine';
import type { SyncDeps } from '../../core/sync/engine';
import { createFakeSyncServer } from '../../test-support/fake-sync-server';
import type { FakeSyncServer } from '../../test-support/fake-sync-server';
import { ack, reading } from '../../test-support/builders';

const T = (n: number) => `2026-06-01T10:${String(n).padStart(2, '0')}:00.000Z`;

const profile = (id: string, over: Partial<CrewProfile> = {}): CrewProfile => ({
  id,
  name: `Name ${id}`,
  role: 'astronaut',
  createdAt: T(0),
  updatedAt: T(1),
  deleted: false,
  ...over,
});

const stamped = (id: string, value: number, updatedAt: string) => ({
  ...reading('heartRate', value, 1, { id }),
  updatedAt,
});

/** One device: its own profile store, record databases, credentials and a gateway to the shared fake server. */
async function makeDevice(server: FakeSyncServer, options: { gateway?: (g: SyncGateway) => SyncGateway; now?: () => string; batchSize?: number } = {}) {
  const enrolled = server.addDevice();
  const profiles = createMemoryProfileStore();
  const credentials = createMemoryDeviceCredentials();
  await credentials.set({ deviceId: enrolled.deviceId, token: enrolled.token, deviceName: 'Laptop', enrolledAt: T(0) });
  const databases = new Map<string, RecordStore>();
  const records = (id: string) => {
    let store = databases.get(id);
    if (!store) {
      store = createMemoryRecordStore(id);
      databases.set(id, store);
    }
    return store;
  };
  const deps: SyncDeps = {
    gateway: options.gateway?.(enrolled.gateway) ?? enrolled.gateway,
    credentials,
    profiles,
    openRecords: async (id) => records(id),
    nowIso: options.now ?? (() => '2026-06-01T13:00:00.000Z'),
    batchSize: options.batchSize,
    pageSize: undefined,
  };
  return { ...enrolled, profiles, credentials, records, deps, run: () => runSync(deps) };
}

describe('sync engine: push', () => {
  it('maps profiles and records to the wire format, keys meta rows by key, and never sends a PIN', async () => {
    const server = createFakeSyncServer();
    const d = await makeDevice(server);
    await d.profiles.upsert(profile('p1', { pin: { hash: 'h', salt: 's', iterations: 1 }, role: 'cmo' }));
    const r = d.records('p1');
    await r.addReadings([stamped('r1', 64, T(5))]);
    await r.addAck({ ...ack('heart', 'g1', 3), id: 'a1', updatedAt: T(6) });
    await r.setMeta('mission', { destination: 'Mars' });

    const result = await d.run();
    expect(result.outcome).toBe('ok');

    const [first] = server.log.push;
    expect(first!.profiles).toEqual([
      { id: 'p1', name: 'Name p1', role: 'cmo', created_at: T(0), updated_at: T(1), deleted: false },
    ]);
    expect(JSON.stringify(server.log.push)).not.toContain('"pin"');
    const sent = server.log.push.flatMap((p) => p.records);
    expect(sent).toContainEqual({
      profile: 'p1',
      kind: 'manualReading',
      client_id: 'r1',
      payload: stamped('r1', 64, T(5)),
      client_updated_at: T(5),
      deleted: false,
    });
    expect(sent.find((x) => x.kind === 'ack')).toMatchObject({ client_id: 'a1', client_updated_at: T(6) });
    expect(sent.find((x) => x.kind === 'meta')).toMatchObject({
      client_id: 'mission',
      payload: { key: 'mission', value: { destination: 'Mars' } },
      deleted: false,
    });
    expect(server.records.size).toBe(3);
  });

  it('sends soft-deleted profiles as tombstones', async () => {
    const server = createFakeSyncServer();
    const d = await makeDevice(server);
    await d.profiles.upsert(profile('p1', { deleted: true, updatedAt: T(9) }));
    await d.run();
    expect(server.profiles.get('p1')!.wire.deleted).toBe(true);
  });

  it('batches in chunks of at most 200 (profiles first, then records)', async () => {
    const server = createFakeSyncServer();
    const d = await makeDevice(server);
    await d.profiles.upsert(profile('p1'));
    await d.records('p1').addReadings(Array.from({ length: 450 }, (_, i) => stamped(`r${i}`, 60, T(2))));
    await d.run();
    expect(server.log.push.map((p) => [p.profiles.length, p.records.length])).toEqual([
      [1, 0],
      [0, 200],
      [0, 200],
      [0, 50],
    ]);
    expect(server.records.size).toBe(450);
  });

  it('caps an oversized batchSize at 200', async () => {
    const server = createFakeSyncServer();
    const d = await makeDevice(server, { batchSize: 5000 });
    await d.profiles.upsert(profile('p1'));
    await d.records('p1').addReadings(Array.from({ length: 201 }, (_, i) => stamped(`r${i}`, 60, T(2))));
    await d.run();
    expect(Math.max(...server.log.push.map((p) => p.records.length))).toBe(200);
  });

  it('pushes only what changed since the watermark (the boundary row is retried: a same-millisecond write must not be lost)', async () => {
    const server = createFakeSyncServer();
    const d = await makeDevice(server);
    await d.profiles.upsert(profile('p1'));
    await d.records('p1').addReadings([stamped('old', 60, T(2)), stamped('edge', 61, T(3))]);
    await d.run();
    server.log.push.length = 0;

    await d.run(); // nothing new: only the rows at the watermark are re-sent, and the server says stale
    const resent = server.log.push.flatMap((p) => p.records.map((r) => r.client_id));
    expect(resent).toEqual(['edge']);
    server.log.push.length = 0;

    await d.records('p1').addReadings([stamped('fresh', 62, T(4))]);
    await d.run();
    expect(server.log.push.flatMap((p) => p.records.map((r) => r.client_id)).sort()).toEqual(['edge', 'fresh']);
    expect(server.records.size).toBe(3);
  });

  it('keeps one watermark per profile', async () => {
    const server = createFakeSyncServer();
    const d = await makeDevice(server);
    await d.profiles.upsert(profile('a'));
    await d.profiles.upsert(profile('b', { createdAt: T(1) }));
    await d.records('a').addReadings([stamped('ra', 60, T(8))]);
    await d.records('b').addReadings([stamped('rb', 60, T(2))]);
    await d.run();
    const state = await d.credentials.getState();
    expect(state.pushed.records).toEqual({ a: T(8), b: T(2) });
    expect(state.pushed.profiles).toBe(T(1));
  });

  it('records a stale answer as fine: no issue is raised', async () => {
    const server = createFakeSyncServer();
    const d = await makeDevice(server);
    await d.profiles.upsert(profile('p1'));
    await d.records('p1').addReadings([stamped('r1', 60, T(5))]);
    await d.run();
    // The server now holds a newer copy; pushing an older local edit yields `stale`.
    server.seedRecord(d.deviceId, {
      profile: 'p1',
      kind: 'manualReading',
      client_id: 'r1',
      payload: stamped('r1', 99, T(30)),
      client_updated_at: T(30),
      deleted: false,
    });
    await d.records('p1').addReadings([stamped('r1', 61, T(6))]);
    const result = await d.run();
    expect(result.outcome).toBe('ok');
    expect((await d.credentials.getState()).issues).toEqual({ forbidden: null, rejectedFuture: null });
    // ...and the pull brought the server copy, which is newer.
    expect((await d.records('p1').load()).manualReadings[0]!.value).toBe(99);
  });

  it('records forbidden items in the sync state and does not retry them', async () => {
    const server = createFakeSyncServer();
    const other = server.addDevice();
    server.seedProfile(other.deviceId, { id: 'shared', name: 'Theirs', role: 'cmo', created_at: T(0), updated_at: T(1), deleted: false });
    const d = await makeDevice(server);
    await d.profiles.upsert(profile('shared', { updatedAt: T(20) }));
    await d.records('shared').addReadings([stamped('r1', 60, T(21))]);

    const result = await d.run();
    expect(result.outcome).toBe('ok');
    const { issues } = await d.credentials.getState();
    expect(issues.forbidden).toMatchObject({ kind: 'forbidden', count: 2, sample: { profileId: 'shared' } });
    expect(server.profiles.get('shared')!.wire.name).toBe('Theirs');
    expect(issues.rejectedFuture).toBeNull();
  });

  it('records rejected_future (the device clock is ahead), keeps the rows pending, and clears the issue once accepted', async () => {
    const server = createFakeSyncServer();
    const d = await makeDevice(server);
    await d.profiles.upsert(profile('p1'));
    const future = new Date(server.now() + 3_600_000).toISOString();
    await d.records('p1').addReadings([stamped('ok', 60, T(2)), stamped('future', 61, future)]);

    await d.run();
    let state = await d.credentials.getState();
    expect(state.issues.rejectedFuture).toMatchObject({ kind: 'rejected_future', count: 1, sample: { recordKind: 'manualReading', clientId: 'future' } });
    expect(state.pushed.records.p1).toBeUndefined(); // not advanced: the rows are retried
    expect(server.records.size).toBe(1);

    server.setClock(server.now() + 2 * 3_600_000); // the server (or the device clock) catches up
    await d.run();
    state = await d.credentials.getState();
    expect(state.issues.rejectedFuture).toBeNull();
    expect(state.pushed.records.p1).toBe(future);
    expect(server.records.size).toBe(2);
  });

  it('does not let a second device see the first one\'s data', async () => {
    const server = createFakeSyncServer();
    const a = await makeDevice(server);
    await a.profiles.upsert(profile('p1'));
    await a.records('p1').addReadings([stamped('r1', 60, T(2))]);
    await a.run();

    const b = await makeDevice(server);
    await b.run();
    expect(await b.profiles.list({ includeDeleted: true })).toEqual([]);
    expect((await b.records('p1').load()).manualReadings).toEqual([]);

    // And b cannot overwrite it either.
    await b.profiles.upsert(profile('p1', { name: 'Hijack', updatedAt: T(40) }));
    await b.run();
    expect(server.profiles.get('p1')!.wire.name).toBe('Name p1');
  });
});

describe('sync engine: pull', () => {
  it('creates profiles that arrive from the server and are missing locally (without a PIN)', async () => {
    const server = createFakeSyncServer();
    const d = await makeDevice(server);
    server.seedProfile(d.deviceId, { id: 'remote', name: 'Remote Ada', role: 'astronaut', created_at: T(1), updated_at: T(2), deleted: false });
    const result = await d.run();
    expect(result.changedProfileIds).toEqual(['remote']);
    expect(await d.profiles.get('remote')).toEqual(profile('remote', { name: 'Remote Ada', createdAt: T(1), updatedAt: T(2) }));
  });

  it('applies a remote profile edit when newer, keeps the local PIN, and never overwrites a newer local edit', async () => {
    const server = createFakeSyncServer();
    const d = await makeDevice(server);
    const pin = { hash: 'h', salt: 's', iterations: 1 };
    await d.profiles.upsert(profile('p1', { name: 'Local', pin, updatedAt: T(10) }));
    await d.run(); // server now has Local @T10

    server.seedProfile(d.deviceId, { id: 'p1', name: 'Remote newer', role: 'cmo', created_at: T(0), updated_at: T(20), deleted: false });
    await d.run();
    expect(await d.profiles.get('p1')).toMatchObject({ name: 'Remote newer', role: 'cmo', pin });

    // Local edit newer than what the server holds: it wins and is pushed; the pull never reverts it.
    await d.profiles.upsert({ ...(await d.profiles.get('p1'))!, name: 'Local newest', updatedAt: T(50) });
    await d.run();
    expect((await d.profiles.get('p1'))!.name).toBe('Local newest');
    expect(server.profiles.get('p1')!.wire.name).toBe('Local newest');
  });

  it('last-write-wins both ways for records: newer remote replaces local, older remote is ignored', async () => {
    const server = createFakeSyncServer();
    const d = await makeDevice(server);
    await d.profiles.upsert(profile('p1'));
    await d.records('p1').addReadings([stamped('mine-newer', 1, T(30)), stamped('theirs-newer', 2, T(10))]);
    const wire = (id: string, value: number, at: string) => ({
      profile: 'p1',
      kind: 'manualReading' as const,
      client_id: id,
      payload: stamped(id, value, at),
      client_updated_at: at,
      deleted: false,
    });
    server.seedRecord(d.deviceId, wire('mine-newer', 100, T(20))); // older than local
    server.seedRecord(d.deviceId, wire('theirs-newer', 200, T(40))); // newer than local
    server.seedRecord(d.deviceId, wire('brand-new', 300, T(5)));

    await d.run();
    const byId = Object.fromEntries((await d.records('p1').load()).manualReadings.map((r) => [r.id, r.value]));
    expect(byId).toEqual({ 'mine-newer': 1, 'theirs-newer': 200, 'brand-new': 300 });
    // The newer local row was pushed in the same run, replacing the server's older copy.
    expect((server.records.get(`p1\u0000manualReading\u0000mine-newer`)!.wire.payload as { value: number }).value).toBe(1);
  });

  it('ignores tombstones, unknown kinds and malformed payloads without failing the pull', async () => {
    const server = createFakeSyncServer();
    const d = await makeDevice(server);
    server.seedProfile(d.deviceId, { id: 'p1', name: 'A', role: 'astronaut', created_at: T(0), updated_at: T(1), deleted: false });
    const base = { profile: 'p1', client_updated_at: T(5), deleted: false };
    server.seedRecord(d.deviceId, { ...base, kind: 'routine', client_id: 'x', payload: {} });
    server.seedRecord(d.deviceId, { ...base, kind: 'manualReading', client_id: 'bad', payload: 'not an object' as unknown });
    server.seedRecord(d.deviceId, { ...base, kind: 'manualReading', client_id: 'gone', payload: stamped('gone', 1, T(5)), deleted: true });
    server.seedRecord(d.deviceId, { ...base, kind: 'manualReading', client_id: 'good', payload: stamped('good', 7, T(5)) });
    const result = await d.run();
    expect(result.outcome).toBe('ok');
    expect((await d.records('p1').load()).manualReadings.map((r) => r.id)).toEqual(['good']);
  });

  it('is idempotent: the 120 s overlap redelivers rows and nothing changes or duplicates', async () => {
    const server = createFakeSyncServer();
    const d = await makeDevice(server);
    server.seedProfile(d.deviceId, { id: 'p1', name: 'A', role: 'astronaut', created_at: T(0), updated_at: T(1), deleted: false });
    server.seedRecord(d.deviceId, { profile: 'p1', kind: 'manualReading', client_id: 'r', payload: stamped('r', 5, T(2)), client_updated_at: T(2), deleted: false });
    const first = await d.run();
    const second = await d.run();
    expect(first.pulled).toBe(2);
    expect(second.pulled).toBe(0);
    expect((await d.records('p1').load()).manualReadings).toHaveLength(1);
  });

  it('pages with the cursor while has_more, and stores next_since only after the last page', async () => {
    const server = createFakeSyncServer({ pageLimit: 2 });
    const d = await makeDevice(server);
    server.seedProfile(d.deviceId, { id: 'p1', name: 'A', role: 'astronaut', created_at: T(0), updated_at: T(1), deleted: false });
    for (let i = 0; i < 5; i += 1) {
      server.seedRecord(d.deviceId, { profile: 'p1', kind: 'manualReading', client_id: `r${i}`, payload: stamped(`r${i}`, i, T(2)), client_updated_at: T(2), deleted: false });
    }

    // The second page fails: everything fetched so far is applied, but the pull watermark must not move.
    server.failNext(null, server.unavailable());
    const failed = await d.run();
    expect(failed.outcome).toBe('error');
    expect(failed.error).toMatchObject({ code: 'unavailable' });
    expect((await d.credentials.getState()).lastSince).toBeNull();
    expect((await d.records('p1').load()).manualReadings).toHaveLength(2);

    server.log.pull.length = 0;
    const ok = await d.run();
    expect(ok.outcome).toBe('ok');
    expect((await d.records('p1').load()).manualReadings).toHaveLength(5);
    // First page: no cursor, no since. Following pages: cursor only (since is ignored with a cursor).
    expect(server.log.pull[0]).toMatchObject({ limit: 500 });
    expect(server.log.pull[0]!.cursor).toBeUndefined();
    expect(server.log.pull.length).toBeGreaterThan(1);
    for (const q of server.log.pull.slice(1)) {
      expect(q.cursor).toBeTruthy();
      expect(q.since).toBeUndefined();
    }
    const { lastSince } = await d.credentials.getState();
    expect(lastSince).not.toBeNull();

    // The next sync starts from the stored watermark.
    server.log.pull.length = 0;
    await d.run();
    expect(server.log.pull[0]!.since).toBe(lastSince);
  });

  it('does not loop forever on a cursor that does not advance', async () => {
    const server = createFakeSyncServer();
    const d = await makeDevice(server, {
      gateway: (g) => ({
        ...g,
        pull: async () => ({ profiles: [], records: [], has_more: true, next_cursor: null, next_since: 'x' }),
      }),
    });
    const result = await d.run();
    expect(result.outcome).toBe('error');
    expect((await d.credentials.getState()).lastSince).toBeNull();
  });

  it('pushes before it pulls', async () => {
    const server = createFakeSyncServer();
    const order: string[] = [];
    const d = await makeDevice(server, {
      gateway: (g) => ({
        ...g,
        push: (t, b) => (order.push('push'), g.push(t, b)),
        pull: (t, q) => (order.push('pull'), g.pull(t, q)),
      }),
    });
    await d.profiles.upsert(profile('p1'));
    await d.run();
    expect(order[0]).toBe('push');
    expect(order.at(-1)).toBe('pull');
  });
});

describe('sync engine: errors and state', () => {
  it('a 401 clears the credentials, resets the watermarks and reports "disconnected"', async () => {
    const server = createFakeSyncServer();
    const d = await makeDevice(server);
    await d.profiles.upsert(profile('p1'));
    await d.run();
    expect((await d.credentials.getState()).pushed.profiles).toBe(T(1));

    server.revoke(d.token);
    const result = await d.run();
    expect(result.outcome).toBe('disconnected');
    expect(result.error).toMatchObject({ code: 'disconnected' });
    expect(await d.credentials.get()).toBeNull();
    const state = await d.credentials.getState();
    expect(state.pushed).toEqual({ profiles: null, records: {} });
    expect(state.lastSince).toBeNull();
    expect(state.lastError).toMatchObject({ code: 'disconnected' });

    expect((await d.run()).outcome).toBe('not-enrolled');
  });

  it('a transient failure keeps the credentials and the progress, and records the error', async () => {
    const server = createFakeSyncServer();
    const d = await makeDevice(server);
    await d.profiles.upsert(profile('p1'));
    await d.records('p1').addReadings([stamped('r1', 60, T(2))]);
    server.failNext(null, null, server.unavailable()); // profiles ok, records ok, pull fails
    const result = await d.run();
    expect(result.outcome).toBe('error');
    expect(await d.credentials.get()).not.toBeNull();
    const state = await d.credentials.getState();
    expect(state.lastError).toMatchObject({ code: 'unavailable' });
    expect(state.pushed.records.p1).toBe(T(2));
    expect(state.lastSyncAt).toBeNull();
  });

  it('records lastSyncAt and clears the error after a good run', async () => {
    const server = createFakeSyncServer();
    const d = await makeDevice(server);
    server.failNext(server.unavailable());
    await d.run();
    expect((await d.credentials.getState()).lastError).not.toBeNull();
    await d.run();
    const state = await d.credentials.getState();
    expect(state.lastError).toBeNull();
    expect(state.lastSyncAt).toBe('2026-06-01T13:00:00.000Z');
  });

  it('does nothing when the device is not enrolled', async () => {
    const server = createFakeSyncServer();
    const d = await makeDevice(server);
    await d.credentials.clear();
    const result = await d.run();
    expect(result.outcome).toBe('not-enrolled');
    expect(server.log.push).toEqual([]);
    expect(server.log.pull).toEqual([]);
  });

  it('a storage failure is reported, not thrown', async () => {
    const server = createFakeSyncServer();
    const d = await makeDevice(server);
    await d.profiles.upsert(profile('p1'));
    d.deps.openRecords = async () => {
      throw new Error('Local storage is unavailable.');
    };
    const result = await runSync(d.deps);
    expect(result.outcome).toBe('error');
    expect(result.error).toMatchObject({ code: 'storage' });
  });

  it('does not write state back after a Disconnect that happened mid-run', async () => {
    const server = createFakeSyncServer();
    let disconnect: () => Promise<void> = async () => undefined;
    const d = await makeDevice(server, {
      gateway: (g) => ({
        ...g,
        pull: async (t, q) => {
          await disconnect();
          return g.pull(t, q);
        },
      }),
    });
    disconnect = () => d.credentials.clear();
    const result = await d.run();
    expect(result.outcome).toBe('ok');
    expect(await d.credentials.get()).toBeNull();
    expect((await d.credentials.getState()).lastSyncAt).toBeNull();
  });
});
