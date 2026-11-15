// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryDeviceCredentials } from '../../adapters/memory-device-credentials';
import { createFakeSyncServer } from '../../test-support/fake-sync-server';
import { createTestWorld } from '../../test-support/compose';
import { composeSyncService } from '../composition-root';
import { ProfileProvider } from '../profile-context';
import { SyncBridge } from './SyncBridge';
import { SyncProvider } from './sync-context';
import type { SyncService } from './sync-service';

function fakeService() {
  let listener: ((ids: readonly string[]) => void) | null = null;
  const service = {
    notifyLocalChange: vi.fn(),
    onRemoteChanges: (l: (ids: readonly string[]) => void) => {
      listener = l;
      return () => {
        listener = null;
      };
    },
  } as unknown as SyncService;
  return { service, emit: (ids: string[]) => listener?.(ids) };
}

async function mountBridge() {
  const world = createTestWorld();
  const app = await world.app('live', { role: 'astronaut' });
  await app.state().saveMissionConfig({ launchDate: '2026-06-15', transitDays: 210, destination: 'Mars' });
  const session = await world.profileSession('live');
  await session.services.profiles.upsert(app.profile);
  const fake = fakeService();
  const onActiveChanged = vi.fn();
  const switchProfile = vi.fn();
  render(
    <SyncProvider service={fake.service}>
      <ProfileProvider value={{ services: session.services, active: app.profile, onActiveChanged, switchProfile }}>
        <SyncBridge store={app.store} onActiveChanged={onActiveChanged} />
      </ProfileProvider>
    </SyncProvider>,
  );
  return { app, session, fake, onActiveChanged, switchProfile };
}

describe('SyncBridge', () => {
  it('tells the sync service when the signed-in profile writes something', async () => {
    const m = await mountBridge();
    await m.app.state().submitCheckIn({ values: { heartRate: 61 }, context: 'rest', symptomatic: false });
    expect(m.fake.service.notifyLocalChange).toHaveBeenCalled();
  });

  it('does not treat the one-second link tick as a write', async () => {
    const m = await mountBridge();
    await m.app.state().tick();
    await m.app.state().tick();
    expect(m.fake.service.notifyLocalChange).not.toHaveBeenCalled();
  });

  it('re-reads the app after a pull changed the signed-in profile, and ignores other profiles', async () => {
    const m = await mountBridge();
    const refresh = vi.spyOn(m.app.store.getState(), 'refresh');
    m.fake.emit(['someone-else']);
    await Promise.resolve();
    expect(refresh).not.toHaveBeenCalled();

    m.fake.emit([m.app.profile.id]);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    // The re-read is not a local write: it must not trigger another push.
    expect(m.fake.service.notifyLocalChange).not.toHaveBeenCalled();
  });

  it('picks up a rename or role change of the signed-in profile made on the server', async () => {
    const m = await mountBridge();
    await m.session.services.profiles.upsert({ ...m.app.profile, name: 'Renamed remotely', updatedAt: '2026-07-01T00:00:00.000Z' });
    m.fake.emit([m.app.profile.id]);
    await vi.waitFor(() => expect(m.onActiveChanged).toHaveBeenCalledWith(expect.objectContaining({ name: 'Renamed remotely' })));
  });

  it('sends the user back to the gate when the signed-in profile was deleted elsewhere', async () => {
    const m = await mountBridge();
    await m.session.services.profiles.softDelete(m.app.profile.id, '2026-07-01T00:00:00.000Z');
    m.fake.emit([m.app.profile.id]);
    await vi.waitFor(() => expect(m.switchProfile).toHaveBeenCalledWith());
  });
});

describe('composeSyncService', () => {
  const deps = async (mode: 'live' | 'demo') => {
    const world = createTestWorld();
    return { world, session: await world.profileSession(mode) };
  };

  it('is off without an API url, and never in DEMO', async () => {
    const live = await deps('live');
    expect(await composeSyncService(live.session.services, { ...live.world.options, apiUrl: null })).toBeNull();
    expect(live.session.sync).toBeNull(); // VITE_API_URL is not set in tests

    const demo = await deps('demo');
    expect(
      await composeSyncService(demo.session.services, {
        ...demo.world.options,
        apiUrl: 'https://api.example.test',
        deviceCredentials: createMemoryDeviceCredentials(),
      }),
    ).toBeNull();
  });

  it('is on in LIVE when an API url is configured', async () => {
    const live = await deps('live');
    const service = await composeSyncService(live.session.services, {
      ...live.world.options,
      apiUrl: 'https://api.example.test',
      deviceCredentials: createMemoryDeviceCredentials(),
    });
    expect(service).not.toBeNull();
  });

  it('syncs the LIVE profile databases through the composed record stores', async () => {
    const live = await deps('live');
    const server = createFakeSyncServer();
    const device = server.addDevice();
    const credentials = createMemoryDeviceCredentials();
    await credentials.set({ deviceId: device.deviceId, token: device.token, deviceName: 'x', enrolledAt: '2026-06-01T00:00:00.000Z' });
    const service = (await composeSyncService(live.session.services, {
      ...live.world.options,
      apiUrl: 'https://api.example.test',
      syncGateway: device.gateway,
      deviceCredentials: credentials,
    }))!;
    await live.session.services.profiles.upsert({ id: 'p1', name: 'A', role: 'cmo', createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z', deleted: false });
    await service.start();
    await vi.waitFor(() => expect(service.getStatus().lastSyncAt).not.toBeNull());
    expect(server.profiles.has('p1')).toBe(true);
    service.stop();
  });
});
