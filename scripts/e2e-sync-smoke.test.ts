/**
 * Opt-in end-to-end smoke test of the HTTP sync client against a REAL backend. It is not part of `npm test`
 * (the default vitest include is `src/**`). Run it with:
 *
 *   E2E_API_URL=http://127.0.0.1:8000 E2E_CODE_A=<code> E2E_CODE_B=<code> \
 *     npx vitest run --config scripts/vitest.e2e.config.ts
 *
 * Needs two fresh single-use codes (`python manage.py create_enrollment_code`). It enrolls two devices, pushes a
 * profile and records from the first, pulls them back into a clean "second install" of the same device, checks that
 * the other device sees nothing and cannot overwrite them, and exercises 400, 401 and 429.
 */
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createHttpSyncGateway } from '../src/adapters/http-sync-gateway';
import { createMemoryDeviceCredentials } from '../src/adapters/memory-device-credentials';
import { createMemoryProfileStore } from '../src/adapters/memory-profile-store';
import { createMemoryRecordStore } from '../src/adapters/memory-record-store';
import type { RecordStore } from '../src/core/ports';
import { runSync } from '../src/core/sync/engine';
import type { SyncDeps } from '../src/core/sync/engine';
import { enrollDevice } from '../src/core/sync/enroll';
import { SyncAuthError, SyncRateLimitError } from '../src/core/sync/errors';
import type { DeviceCredentials } from '../src/core/sync/model';
import type { CrewProfile } from '../src/core/profiles/model';
import type { Reading } from '../src/core/health/model';

const API = process.env.E2E_API_URL;
const CODE_A = process.env.E2E_CODE_A;
const CODE_B = process.env.E2E_CODE_B;
const enabled = Boolean(API && CODE_A && CODE_B);

const gateway = createHttpSyncGateway({ baseUrl: API ?? 'http://127.0.0.1:8000', timeoutMs: 10_000 });
const nowIso = () => new Date().toISOString();

/** A fresh install: empty profile store, empty record databases, its own credential store. */
async function install(credentials?: DeviceCredentials) {
  const creds = createMemoryDeviceCredentials();
  if (credentials) await creds.set(credentials);
  const profiles = createMemoryProfileStore();
  const dbs = new Map<string, RecordStore>();
  const records = (id: string) => {
    let s = dbs.get(id);
    if (!s) dbs.set(id, (s = createMemoryRecordStore(id)));
    return s;
  };
  const deps: SyncDeps = { gateway, credentials: creds, profiles, openRecords: async (id) => records(id), nowIso, pageSize: 100 };
  return { creds, profiles, records, deps, run: () => runSync(deps) };
}

const profile = (id: string): CrewProfile => ({
  id,
  name: 'Ada E2E',
  role: 'cmo',
  pin: { hash: 'must-not-leave-the-device', salt: 's', iterations: 1 },
  createdAt: nowIso(),
  updatedAt: nowIso(),
  deleted: false,
});

const reading = (id: string, value: number): Reading => ({
  id,
  indicatorId: 'heartRate',
  value,
  day: 1,
  t: 100,
  source: 'MANUAL',
  context: 'rest',
  symptomatic: false,
  groupId: 'g-e2e',
  updatedAt: nowIso(),
});

describe.skipIf(!enabled)('sync against the real backend', () => {
  it('enroll, push, pull back, isolation between devices, 400, 401, 429', async () => {
    const profileId = crypto.randomUUID();

    // --- Device A enrolls and pushes a profile + records (450 readings: three record batches) ---------------
    const enrollA = await enrollDevice({ gateway, credentials: createMemoryDeviceCredentials(), nowIso }, { code: CODE_A!, name: 'e2e device A' });
    expect(enrollA.ok).toBe(true);
    if (!enrollA.ok) return;
    const a = await install(enrollA.credentials);
    await a.profiles.upsert(profile(profileId));
    const store = a.records(profileId);
    const many = Array.from({ length: 450 }, (_, i) => reading(crypto.randomUUID(), 60 + (i % 20)));
    await store.addReadings(many);
    await store.addAck({
      id: crypto.randomUUID(),
      zoneId: 'heart',
      groupId: 'g-e2e',
      by: { profileId, role: 'cmo' },
      t: 5,
      updatedAt: nowIso(),
    });
    await store.setMeta('mission', { launchDate: '2026-06-15', transitDays: 210, destination: 'Mars' });

    const pushed = await a.run();
    expect(pushed).toMatchObject({ outcome: 'ok' });
    expect(pushed.pushed).toBe(1 + 450 + 1 + 1);
    const stateA = await a.creds.getState();
    expect(stateA.issues).toEqual({ forbidden: null, rejectedFuture: null });
    expect(stateA.lastSince).not.toBeNull();

    // --- A clean second install of the SAME device pulls it all back (paged by 100) -------------------------
    const clone = await install(enrollA.credentials);
    const pulled = await clone.run();
    expect(pulled.outcome).toBe('ok');
    expect(pulled.changedProfileIds).toEqual([profileId]);
    const restored = await clone.profiles.get(profileId);
    expect(restored).toMatchObject({ id: profileId, name: 'Ada E2E', role: 'cmo', deleted: false });
    expect(restored?.pin).toBeUndefined(); // the PIN never left device A
    const snap = await clone.records(profileId).load();
    expect(snap.manualReadings).toHaveLength(450);
    expect(snap.acks).toHaveLength(1);
    expect(await clone.records(profileId).getMeta('mission')).toEqual({ launchDate: '2026-06-15', transitDays: 210, destination: 'Mars' });
    // Same values, same timestamps: LWW compares equal instants and a second pull changes nothing.
    expect(snap.manualReadings.map((r) => r.id).sort()).toEqual(many.map((r) => r.id).sort());
    expect((await clone.run()).pulled).toBe(0);

    // --- Device B cannot see A's data, and cannot overwrite it ---------------------------------------------
    const enrollB = await enrollDevice({ gateway, credentials: createMemoryDeviceCredentials(), nowIso }, { code: CODE_B!, name: 'e2e device B' });
    expect(enrollB.ok).toBe(true);
    if (!enrollB.ok) return;
    const b = await install(enrollB.credentials);
    expect((await b.run()).pulled).toBe(0);
    expect(await b.profiles.list({ includeDeleted: true })).toEqual([]);
    await b.profiles.upsert({ ...profile(profileId), name: 'Hijack', updatedAt: new Date(Date.now() + 1000).toISOString() });
    await b.records(profileId).addReadings([reading(crypto.randomUUID(), 99)]);
    const hijack = await b.run();
    expect(hijack.outcome).toBe('ok');
    const stateB = await b.creds.getState();
    expect(stateB.issues.forbidden?.count).toBe(2); // the profile and its record
    expect((await b.profiles.get(profileId))?.name).toBe('Hijack'); // local stays local
    expect((await clone.profiles.get(profileId))?.name).toBe('Ada E2E');
    await clone.run();
    expect((await clone.profiles.get(profileId))?.name).toBe('Ada E2E'); // the server copy is untouched
    expect((await clone.records(profileId).load()).manualReadings).toHaveLength(450);

    // --- A later edit on A reaches the clone (LWW, newer wins) ---------------------------------------------
    await a.profiles.upsert({ ...(await a.profiles.get(profileId))!, name: 'Ada renamed', updatedAt: new Date(Date.now() + 2000).toISOString() });
    expect((await a.run()).outcome).toBe('ok');
    const edited = await clone.run();
    expect(edited.changedProfileIds).toEqual([profileId]);
    expect((await clone.profiles.get(profileId))?.name).toBe('Ada renamed');

    // --- 400: a used code ----------------------------------------------------------------------------------
    const reuse = await enrollDevice({ gateway, credentials: createMemoryDeviceCredentials(), nowIso }, { code: CODE_A!, name: 'again' });
    expect(reuse).toMatchObject({ ok: false, reason: 'invalid_code' });

    // --- 401: an unknown (revoked) token clears the credentials --------------------------------------------
    await expect(gateway.pull('definitely-not-a-token', {})).rejects.toBeInstanceOf(SyncAuthError);
    const ghost = await install({ deviceId: 'x', token: 'definitely-not-a-token', deviceName: 'ghost', enrolledAt: nowIso() });
    const revoked = await ghost.run();
    expect(revoked.outcome).toBe('disconnected');
    expect(await ghost.creds.get()).toBeNull();

    // --- 429: the enroll throttle (10/hour per IP) ---------------------------------------------------------
    let limited: unknown;
    for (let i = 0; i < 15 && !limited; i += 1) {
      await gateway.enroll({ code: `bad-${i}`, name: 'x' }).catch((e: unknown) => {
        if (e instanceof SyncRateLimitError) limited = e;
      });
    }
    expect(limited).toBeInstanceOf(SyncRateLimitError);
    const throttled = await enrollDevice({ gateway, credentials: createMemoryDeviceCredentials(), nowIso }, { code: 'x', name: 'x' });
    expect(throttled).toMatchObject({ ok: false, reason: 'rate_limited' });
  }, 60_000);
});
