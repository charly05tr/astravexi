import { describe, expect, it, vi } from 'vitest';
import { createMemoryDeviceCredentials } from '../../adapters/memory-device-credentials';
import { createMemoryProfileStore } from '../../adapters/memory-profile-store';
import { createMemoryRecordStore } from '../../adapters/memory-record-store';
import type { RecordStore } from '../../core/ports';
import { SyncRateLimitError, SyncUnavailableError, SyncValidationError } from '../../core/sync/errors';
import { enrollDevice } from '../../core/sync/enroll';
import { createFakeSyncServer } from '../../test-support/fake-sync-server';
import { createSyncService } from './sync-service';

function setup() {
  const server = createFakeSyncServer();
  const gateway = server.gatewayWithEnrollment('GOOD-CODE');
  const credentials = createMemoryDeviceCredentials();
  const profiles = createMemoryProfileStore();
  const dbs = new Map<string, RecordStore>();
  const service = createSyncService({
    gateway,
    credentials,
    profiles,
    openRecords: async (id) => {
      let s = dbs.get(id);
      if (!s) dbs.set(id, (s = createMemoryRecordStore(id)));
      return s;
    },
    nowIso: () => new Date().toISOString(),
    scheduler: { target: null, isOnline: () => true },
  });
  return { server, service, credentials, profiles, gateway };
}

describe('enrollDevice', () => {
  const deps = (gateway: Parameters<typeof enrollDevice>[0]['gateway']) => ({
    gateway,
    credentials: createMemoryDeviceCredentials(),
    nowIso: () => '2026-06-01T10:00:00.000Z',
  });

  it('stores the credentials on success', async () => {
    const server = createFakeSyncServer();
    const d = deps(server.gatewayWithEnrollment('OK'));
    const result = await enrollDevice(d, { code: ' OK ', name: ' CMO laptop ' });
    expect(result).toMatchObject({ ok: true, credentials: { deviceName: 'CMO laptop', enrolledAt: '2026-06-01T10:00:00.000Z' } });
    expect(await d.credentials.get()).toMatchObject({ deviceName: 'CMO laptop' });
  });

  it('validates the input before calling the server', async () => {
    const enroll = vi.fn();
    const d = deps({ enroll, push: vi.fn(), pull: vi.fn() });
    expect(await enrollDevice(d, { code: '  ', name: 'x' })).toMatchObject({ ok: false, reason: 'input' });
    expect(await enrollDevice(d, { code: 'c', name: '' })).toMatchObject({ ok: false, reason: 'input' });
    expect(await enrollDevice(d, { code: 'c', name: 'x'.repeat(121) })).toMatchObject({ ok: false, reason: 'input' });
    expect(enroll).not.toHaveBeenCalled();
  });

  it.each([
    [new SyncValidationError('Invalid or expired enrollment code.'), 'invalid_code', /invalid, already used or expired/i],
    [new SyncRateLimitError(), 'rate_limited', /too many attempts/i],
    [new SyncUnavailableError(), 'unavailable', /could not reach/i],
  ])('maps %s to a clear message and stores nothing', async (error, reason, message) => {
    const d = deps({ enroll: async () => Promise.reject(error), push: vi.fn(), pull: vi.fn() });
    const result = await enrollDevice(d, { code: 'c', name: 'n' });
    expect(result).toMatchObject({ ok: false, reason });
    expect(!result.ok && result.error).toMatch(message);
    expect(await d.credentials.get()).toBeNull();
  });
});

describe('sync service', () => {
  it('starts not enrolled, enrolls, syncs right away and exposes the status', async () => {
    const { service, server, profiles } = setup();
    await profiles.upsert({ id: 'p1', name: 'Ada', role: 'cmo', createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z', deleted: false });
    await service.start();
    expect(service.getStatus()).toMatchObject({ ready: true, enrolled: false });

    const bad = await service.enroll({ code: 'WRONG', name: 'Laptop' });
    expect(bad).toMatchObject({ ok: false, reason: 'invalid_code' });
    expect(service.getStatus().enrolled).toBe(false);

    const good = await service.enroll({ code: 'GOOD-CODE', name: 'Laptop' });
    expect(good.ok).toBe(true);
    await vi.waitFor(() => expect(service.getStatus().lastSyncAt).not.toBeNull());
    expect(service.getStatus()).toMatchObject({ enrolled: true, deviceName: 'Laptop', error: null, syncing: false, pending: false });
    expect(server.profiles.has('p1')).toBe(true);
    service.stop();
  });

  it('a revoked device ends up disconnected with a clear status', async () => {
    const { service, server } = setup();
    await service.start();
    await service.enroll({ code: 'GOOD-CODE', name: 'Laptop' });
    await vi.waitFor(() => expect(service.getStatus().lastSyncAt).not.toBeNull());
    server.revoke('token-1');
    await service.syncNow();
    const status = service.getStatus();
    expect(status.enrolled).toBe(false);
    expect(status.error).toMatchObject({ code: 'disconnected' });
    service.stop();
  });

  it('disconnect forgets the credentials and stops syncing', async () => {
    const { service, credentials, server } = setup();
    await service.start();
    await service.enroll({ code: 'GOOD-CODE', name: 'Laptop' });
    await vi.waitFor(() => expect(service.getStatus().lastSyncAt).not.toBeNull());
    await service.disconnect();
    expect(await credentials.get()).toBeNull();
    expect(service.getStatus()).toMatchObject({ enrolled: false, lastSyncAt: null, error: null });
    const calls = server.log.pull.length;
    await service.syncNow();
    expect(server.log.pull.length).toBe(calls);
    service.stop();
  });

  it('syncNow never throws, even when the server is down; the error lands in the status', async () => {
    const { service, server } = setup();
    await service.start();
    await service.enroll({ code: 'GOOD-CODE', name: 'Laptop' });
    await vi.waitFor(() => expect(service.getStatus().lastSyncAt).not.toBeNull());
    server.failNext(server.unavailable());
    await expect(service.syncNow()).resolves.toBeUndefined();
    expect(service.getStatus().error).toMatchObject({ code: 'unavailable' });
    service.stop();
  });

  it('notifyLocalChange marks the status pending until the next good sync', async () => {
    const { service } = setup();
    await service.start();
    await service.enroll({ code: 'GOOD-CODE', name: 'Laptop' });
    await vi.waitFor(() => expect(service.getStatus().lastSyncAt).not.toBeNull());
    service.notifyLocalChange();
    expect(service.getStatus().pending).toBe(true);
    await service.syncNow();
    expect(service.getStatus().pending).toBe(false);
    service.stop();
  });

  it('tells subscribers which profiles a pull changed', async () => {
    const { service, server } = setup();
    await service.start();
    await service.enroll({ code: 'GOOD-CODE', name: 'Laptop' });
    await vi.waitFor(() => expect(service.getStatus().lastSyncAt).not.toBeNull());
    const seen: string[][] = [];
    service.onRemoteChanges((ids) => seen.push([...ids]));
    server.seedProfile('device-1', { id: 'remote', name: 'R', role: 'astronaut', created_at: '2026-06-01T00:00:00.000Z', updated_at: '2026-06-01T00:00:00.000Z', deleted: false });
    await service.syncNow();
    expect(seen).toEqual([['remote']]);
    service.stop();
  });
});
