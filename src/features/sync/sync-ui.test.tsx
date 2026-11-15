// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryDeviceCredentials } from '../../adapters/memory-device-credentials';
import { createMemoryProfileStore } from '../../adapters/memory-profile-store';
import { createMemoryRecordStore } from '../../adapters/memory-record-store';
import { createSyncService } from '../../app/sync/sync-service';
import type { SyncService } from '../../app/sync/sync-service';
import type { SyncGateway } from '../../core/ports';
import { SyncRateLimitError } from '../../core/sync/errors';
import { createFakeSyncServer } from '../../test-support/fake-sync-server';
import { mountApp } from '../../test-support/mount';

const services: SyncService[] = [];

function makeService(gateway?: SyncGateway) {
  const server = createFakeSyncServer();
  const dbs = new Map<string, ReturnType<typeof createMemoryRecordStore>>();
  const service = createSyncService({
    gateway: gateway ?? server.gatewayWithEnrollment('GOOD-CODE'),
    credentials: createMemoryDeviceCredentials(),
    profiles: createMemoryProfileStore(),
    openRecords: async (id) => {
      let s = dbs.get(id);
      if (!s) dbs.set(id, (s = createMemoryRecordStore(id)));
      return s;
    },
    nowIso: () => new Date().toISOString(),
    scheduler: { target: null, isOnline: () => true },
  });
  services.push(service);
  return { service, server };
}

afterEach(() => {
  for (const s of services.splice(0)) s.stop();
});

const trigger = () => screen.getByRole('button', { name: /^profile menu/i });

async function openMenu(user: Awaited<ReturnType<typeof mountApp>>['user']) {
  if (trigger().getAttribute('aria-expanded') !== 'true') await user.click(trigger());
  return within(screen.getByRole('menu'));
}

async function goSync(user: Awaited<ReturnType<typeof mountApp>>['user']) {
  await user.click((await openMenu(user)).getByRole('menuitem', { name: /mission control sync/i }));
}

describe('sync UI', () => {
  it('is entirely absent when no sync service exists (VITE_API_URL unset)', async () => {
    const m = await mountApp('live', { role: 'cmo', sync: null });
    const menu = await openMenu(m.user);
    expect(menu.queryByRole('menuitem', { name: /mission control sync/i })).toBeNull();
    expect(screen.queryByTestId('sync-status')).toBeNull();
    expect(trigger().querySelector('.sync-dot')).toBeNull();
  });

  it('is offered to a CMO only', async () => {
    const { service } = makeService();
    await service.start();
    const m = await mountApp('live', { role: 'astronaut', sync: service });
    const menu = await openMenu(m.user);
    expect(menu.queryByRole('menuitem', { name: /mission control sync/i })).toBeNull();
  });

  it('shows the enrollment form with the secure-context note when not enrolled', async () => {
    const { service } = makeService();
    await service.start();
    const m = await mountApp('live', { role: 'cmo', sync: service });
    await goSync(m.user);
    expect(await screen.findByRole('heading', { name: 'Mission control sync' })).toBeInTheDocument();
    const form = screen.getByRole('form', { name: /enroll this device/i });
    expect(within(form).getByLabelText('Enrollment code')).toBeInTheDocument();
    expect(within(form).getByLabelText('Device name')).toBeInTheDocument();
    expect(screen.getByText(/https \(or on localhost\)/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sync now/i })).toBeNull();
  });

  it('shows a clear error for an invalid or expired code and stays on the form', async () => {
    const { service } = makeService();
    await service.start();
    const m = await mountApp('live', { role: 'cmo', sync: service });
    await goSync(m.user);
    await m.user.type(screen.getByLabelText('Enrollment code'), 'WRONG');
    await m.user.type(screen.getByLabelText('Device name'), 'CMO laptop');
    await m.user.click(screen.getByRole('button', { name: 'Enroll device' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid, already used or expired/i);
    expect(screen.getByLabelText('Enrollment code')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('button', { name: /sync now/i })).toBeNull();
  });

  it('asks for both fields before calling the server', async () => {
    const { service, server } = makeService();
    await service.start();
    const m = await mountApp('live', { role: 'cmo', sync: service });
    await goSync(m.user);
    await m.user.click(screen.getByRole('button', { name: 'Enroll device' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/enter the enrollment code/i);
    expect(server.log.push).toEqual([]);
  });

  it('shows a clear error when enrollment is rate limited', async () => {
    const { service } = makeService({
      enroll: () => Promise.reject(new SyncRateLimitError()),
      push: () => Promise.reject(new Error('unused')),
      pull: () => Promise.reject(new Error('unused')),
    });
    await service.start();
    const m = await mountApp('live', { role: 'cmo', sync: service });
    await goSync(m.user);
    await m.user.type(screen.getByLabelText('Enrollment code'), 'ANY');
    await m.user.type(screen.getByLabelText('Device name'), 'Laptop');
    await m.user.click(screen.getByRole('button', { name: 'Enroll device' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/too many attempts/i);
  });

  it('enrolls, then shows the device, the last sync, "Sync now" and "Disconnect", and the menu status', async () => {
    const { service } = makeService();
    await service.start();
    const m = await mountApp('live', { role: 'cmo', sync: service });
    await goSync(m.user);
    await m.user.type(screen.getByLabelText('Enrollment code'), 'GOOD-CODE');
    await m.user.type(screen.getByLabelText('Device name'), 'CMO laptop');
    await m.user.click(screen.getByRole('button', { name: 'Enroll device' }));

    expect(await screen.findByText('CMO laptop')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/synced just now/i));
    expect(screen.queryByLabelText('Enrollment code')).toBeNull();

    // The status shows in the user menu too, and as a dot on the account button.
    const menu = await openMenu(m.user);
    expect(menu.getByTestId('sync-status')).toHaveTextContent(/synced just now/i);
    expect(trigger().querySelector('.sync-dot--ok')).not.toBeNull();
  });

  it('disconnects after a confirmation and returns to the form', async () => {
    const { service } = makeService();
    await service.start();
    await service.enroll({ code: 'GOOD-CODE', name: 'CMO laptop' });
    const m = await mountApp('live', { role: 'cmo', sync: service });
    await goSync(m.user);
    await m.user.click(await screen.findByRole('button', { name: 'Disconnect' }));
    await m.user.click(screen.getByRole('button', { name: 'Yes, disconnect' }));
    expect(await screen.findByRole('form', { name: /enroll this device/i })).toBeInTheDocument();
    expect(service.getStatus().enrolled).toBe(false);
  });

  it('explains a revoked device and offers to enroll again', async () => {
    const { service, server } = makeService();
    await service.start();
    await service.enroll({ code: 'GOOD-CODE', name: 'CMO laptop' });
    await waitFor(() => expect(service.getStatus().lastSyncAt).not.toBeNull());
    server.revoke('token-1');
    const m = await mountApp('live', { role: 'cmo', sync: service });
    await goSync(m.user);
    await m.user.click(await screen.findByRole('button', { name: 'Sync now' }));
    expect(await screen.findByText(/this device was disconnected from mission control/i)).toBeInTheDocument();
    expect(screen.getByRole('form', { name: /enroll this device/i })).toBeInTheDocument();
  });
});
