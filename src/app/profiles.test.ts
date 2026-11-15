import { describe, expect, it } from 'vitest';
import { LEGACY_PROFILE_ID, toActor } from '../core/profiles/model';
import { PermissionError } from '../core/profiles/policy';
import type { OutboxMessage, Reading } from '../core/health/model';
import { ack, reading } from '../test-support/builders';
import { createTestWorld, testProfile } from '../test-support/compose';
import { DEMO_ASTRONAUT_ID, DEMO_CMO_ID, DEMO_CREW_EXTRAS, RETIRED_DEMO_CREW_IDS } from './demo/demo-profiles';
import { LEGACY_MIGRATED_META_KEY } from './legacy-live';
import { DB_NAME, liveDbName } from './mode';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const bp = (sys: number, dia: number) => ({ values: { bpSystolic: sys, bpDiastolic: dia } });

describe('role enforcement in the use-cases', () => {
  it('an astronaut cannot acknowledge: it rejects and stores nothing', async () => {
    const world = createTestWorld();
    const { state } = await world.app('demo', { role: 'astronaut' });
    const out = await state().submitCheckIn(bp(185, 125));
    if (!out.ok) throw new Error('expected ok');
    await expect(state().acknowledge('heart', out.groupId)).rejects.toBeInstanceOf(PermissionError);
    expect(state().session!.acks).toEqual([]);
    expect((await world.databases.get(DB_NAME.demo)!.load()).acks).toEqual([]);
  });

  it('a cmo and a flight surgeon can acknowledge, and `by` is their profile id plus role', async () => {
    for (const role of ['cmo', 'flightSurgeon'] as const) {
      const world = createTestWorld();
      const astro = await world.app('demo', { role: 'astronaut' });
      const out = await astro.state().submitCheckIn(bp(185, 125));
      if (!out.ok) throw new Error('expected ok');
      const reviewer = await world.app('demo', { role });
      await reviewer.state().acknowledge('heart', out.groupId);
      const [stored] = (await world.databases.get(DB_NAME.demo)!.load()).acks;
      expect(stored!.by).toEqual({ profileId: testProfile(role).id, role });
      expect(stored!.id).toMatch(UUID);
    }
  });

  it('a cmo and a flight surgeon cannot check in or decide on a recommendation', async () => {
    for (const role of ['cmo', 'flightSurgeon'] as const) {
      const world = createTestWorld();
      const { state } = await world.app('demo', { role });
      await expect(state().submitCheckIn(bp(120, 80))).rejects.toBeInstanceOf(PermissionError);
      await expect(
        state().decideRecommendation({ recommendationId: 'sleep-window', findingKey: 'k', decision: 'accepted' }),
      ).rejects.toBeInstanceOf(PermissionError);
      expect(state().session!.manual).toEqual([]);
      expect(state().session!.decisions).toEqual([]);
    }
  });

  it('setActor changes what later actions may do', async () => {
    const world = createTestWorld();
    const { state } = await world.app('demo', { role: 'cmo' });
    await expect(state().submitCheckIn(bp(120, 80))).rejects.toBeInstanceOf(PermissionError);
    state().setActor(toActor(testProfile('astronaut')));
    expect(state().actor.role).toBe('astronaut');
    expect(await state().submitCheckIn(bp(120, 80))).toMatchObject({ ok: true });
  });
});

describe('sync-ready records', () => {
  it('gives every stored record a UUID and an ISO updatedAt', async () => {
    const world = createTestWorld();
    const { state } = await world.app('demo');
    const out = await state().submitCheckIn({ values: { ...bp(185, 125).values, heartRate: 70 } });
    if (!out.ok) throw new Error('expected ok');
    await state().decideRecommendation({ recommendationId: 'sleep-window', findingKey: 'k', decision: 'accepted' });
    state().setActor(toActor(testProfile('cmo')));
    await state().acknowledge('heart', out.groupId);

    const snap = await world.databases.get(DB_NAME.demo)!.load();
    expect(snap.manualReadings).toHaveLength(3);
    const all = [...snap.manualReadings, ...snap.decisions, ...snap.acks, ...snap.outbox];
    expect(all).toHaveLength(6);
    for (const row of all) {
      expect(row.id).toMatch(UUID);
      expect(row.updatedAt).toMatch(ISO);
    }
    expect(new Set(all.map((r) => r.id)).size).toBe(all.length);
  });

  it('two decisions in the same minute get different ids (the old dec:t:n scheme could collide across sessions)', async () => {
    const world = createTestWorld();
    const a = await world.app('demo');
    await a.state().decideRecommendation({ recommendationId: 'r', findingKey: 'k', decision: 'accepted' });
    const b = await world.app('demo'); // a reload: the decision count restarts from what was stored
    await b.state().decideRecommendation({ recommendationId: 'r', findingKey: 'k', decision: 'dismissed' });
    const ids = (await world.databases.get(DB_NAME.demo)!.load()).decisions.map((d) => d.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('keeps one outbox message per (zone, group) with the UUID scheme, across reloads', async () => {
    const world = createTestWorld();
    const first = await world.app('demo');
    await first.state().submitCheckIn(bp(185, 125));
    const second = await world.app('demo'); // hydrates again and re-emits: the dedupe key blocks a duplicate
    await second.state().tick();
    const outbox = (await world.databases.get(DB_NAME.demo)!.load()).outbox;
    expect(outbox).toHaveLength(1);
    expect(second.state().session!.outbox).toHaveLength(1);
  });

  it('carries only the profile id in the outbox payload (the subject, not the viewer), never the display name', async () => {
    const world = createTestWorld();
    const live = await world.app('live', { profile: testProfile('astronaut', { id: 'p-ada', name: 'Ada' }) });
    await live.state().submitCheckIn(bp(185, 125));
    const [message] = (await world.databases.get(liveDbName('p-ada'))!.load()).outbox;
    expect(message!.payload.profileId).toBe('p-ada');
    expect(message!.payload).not.toHaveProperty('crewMember');
    expect(JSON.stringify(message!.payload)).not.toContain('Ada');

    const demo = await world.app('demo', { role: 'cmo' });
    await world.app('demo', { role: 'astronaut' }).then((a) => a.state().submitCheckIn(bp(185, 125)));
    expect(demo.adapters.deps.subject).toEqual({ profileId: DEMO_ASTRONAUT_ID, name: 'Demo astronaut' });
    const demoOutbox = (await world.databases.get(DB_NAME.demo)!.load()).outbox;
    expect(demoOutbox[0]!.payload).toMatchObject({ profileId: DEMO_ASTRONAUT_ID });
  });

  it('stamps updatedAt again when a message changes state', async () => {
    const world = createTestWorld();
    const { state } = await world.app('demo');
    await state().submitCheckIn(bp(185, 125));
    const queued = state().session!.outbox[0]!;
    world.wait(5);
    await state().sendNow(queued.id);
    const sent = (await world.databases.get(DB_NAME.demo)!.load()).outbox[0]!;
    expect(sent.state).toBe('sent');
    expect(sent.updatedAt > queued.updatedAt).toBe(true);
  });
});

describe('profiles in DEMO', () => {
  it('retires the extra crewmates saved under their old ids, so each name appears once', async () => {
    const world = createTestWorld();
    const first = await world.profileSession('demo');
    const extra = DEMO_CREW_EXTRAS[0]!;
    // A device that ran the earlier build: the same crewmate under a retired id.
    await first.services.profiles.upsert({
      id: RETIRED_DEMO_CREW_IDS[0]!,
      name: extra.name,
      role: 'astronaut',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
      deleted: false,
    });
    const again = await world.profileSession('demo');
    const names = (await again.services.profiles.list()).map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter((n) => n === extra.name)).toHaveLength(1);
    expect((await again.services.profiles.list()).map((p) => p.id)).not.toContain(RETIRED_DEMO_CREW_IDS[0]);
  });

  it('seeds a demo astronaut and a demo CMO once, and starts as the astronaut', async () => {
    const world = createTestWorld();
    const { services } = await world.profileSession('demo');
    const profiles = await services.profiles.list();
    expect(profiles.map((p) => [p.id, p.role])).toEqual([
      [DEMO_ASTRONAUT_ID, 'astronaut'],
      [DEMO_CMO_ID, 'cmo'],
      ...DEMO_CREW_EXTRAS.map((c) => [c.id, 'astronaut']), // synthetic crewmates for the crew dashboard
    ]);
    expect(profiles.every((p) => p.pin === undefined)).toBe(true);
    expect(services.activeProfile.get()).toBe(DEMO_ASTRONAUT_ID);

    const again = await world.profileSession('demo');
    expect(await again.services.profiles.list({ includeDeleted: true })).toHaveLength(2 + DEMO_CREW_EXTRAS.length); // no reseed
  });

  it('shares one database: the demo CMO sees and acknowledges what the demo astronaut recorded', async () => {
    const world = createTestWorld();
    const { services, enter } = await world.profileSession('demo');
    const [astro, cmo] = await services.profiles.list();

    const astroApp = await enter(astro!);
    await astroApp.getState().hydrate();
    const out = await astroApp.getState().submitCheckIn(bp(185, 125));
    if (!out.ok) throw new Error('expected ok');

    const cmoApp = await enter(cmo!);
    await cmoApp.getState().hydrate();
    expect(cmoApp.getState().actor).toMatchObject({ profileId: DEMO_CMO_ID, role: 'cmo' });
    expect(cmoApp.getState().session!.outbox).toHaveLength(1);
    await cmoApp.getState().acknowledge('heart', out.groupId);
    expect((await world.databases.get(DB_NAME.demo)!.load()).acks[0]!.by).toEqual({
      profileId: DEMO_CMO_ID,
      role: 'cmo',
    });
  });
});

describe('profiles in LIVE: one database each', () => {
  it('opens astravexi-live-<profileId> and keeps two profiles apart', async () => {
    const world = createTestWorld();
    const { services, enter } = await world.profileSession('live');
    await services.create(null, { name: 'Chief', role: 'cmo' }); // the first profile must be a CMO
    const ada = await services.create(null, { name: 'Ada', role: 'astronaut' });
    const bo = await services.create(null, { name: 'Bo', role: 'astronaut' });
    if (!ada.ok || !bo.ok) throw new Error('expected ok');

    const adaApp = await enter(ada.profile);
    await adaApp.getState().hydrate();
    await adaApp.getState().submitCheckIn({ values: { heartRate: 64 } });
    const boApp = await enter(bo.profile);
    await boApp.getState().hydrate();

    expect(world.opened).toContain(liveDbName(ada.profile.id));
    expect(world.opened).toContain(liveDbName(bo.profile.id));
    expect(boApp.getState().session!.manual).toEqual([]);
    expect((await world.databases.get(liveDbName(ada.profile.id))!.load()).manualReadings).toHaveLength(1);
    expect((await world.databases.get(liveDbName(bo.profile.id))!.load()).manualReadings).toHaveLength(0);
  });
});

describe('adopting the pre-profile LIVE database', () => {
  const message = (): OutboxMessage => ({
    id: 'legacy-msg',
    dedupeKey: 'heart:g1',
    zoneId: 'heart',
    groupId: 'g1',
    createdAt: 10,
    to: 'flightSurgeon',
    state: 'sent',
    payload: {
      profileId: LEGACY_PROFILE_ID,
      crewMember: 'Crew member', // written by an older build
      source: 'MANUAL',
      trigger: [],
      zoneTiers: {} as OutboxMessage['payload']['zoneTiers'],
    } as OutboxMessage['payload'],
    updatedAt: '2026-05-01T00:00:00.000Z',
  });

  async function worldWithLegacyData() {
    const world = createTestWorld();
    const { store } = await world.options.open!(DB_NAME.live, false);
    const r: Reading = { ...reading('heartRate', 64, 3, { id: 'legacy-r1' }), updatedAt: '2026-05-01T00:00:00.000Z' };
    await store.addReadings([r]);
    await store.addDecision({
      id: 'legacy-d1',
      recommendationId: 'rec',
      findingKey: 'k',
      decision: 'accepted',
      t: 5,
      updatedAt: '2026-05-01T00:00:00.000Z',
    });
    await store.addAck({ ...ack('heart', 'g1', 7), by: { profileId: LEGACY_PROFILE_ID, role: 'cmo' } });
    await store.putOutboxIfAbsent(message());
    await store.setMeta('mission', { launchDate: '2026-06-01', transitDays: 180, destination: 'Moon' });
    return { world, legacy: store };
  }

  it('moves readings, decisions, acks, outbox and the mission setup into the first profile', async () => {
    const { world, legacy } = await worldWithLegacyData();
    const { services, enter } = await world.profileSession('live');
    const result = await services.create(null, { name: 'Ada', role: 'cmo' });
    if (!result.ok) throw new Error('expected ok');
    const id = result.profile.id;

    const target = world.databases.get(liveDbName(id))!;
    const snap = await target.load();
    expect(snap.manualReadings.map((x) => x.id)).toEqual(['legacy-r1']);
    expect(snap.decisions.map((x) => x.id)).toEqual(['legacy-d1']);
    expect(snap.acks[0]!.by).toEqual({ profileId: id, role: 'cmo' }); // rewritten from the legacy placeholder
    expect(snap.outbox[0]!.payload.profileId).toBe(id);
    expect(snap.outbox[0]!.payload).not.toHaveProperty('crewMember'); // the display name is not carried over
    expect(await target.getMeta('mission')).toMatchObject({ destination: 'Moon' });

    // The legacy database is kept, only marked, and nothing is moved twice.
    expect(await legacy.getMeta(LEGACY_MIGRATED_META_KEY)).toBe(id);
    expect((await legacy.load()).manualReadings).toHaveLength(1);

    // Entering the app as that profile shows the old data and the saved mission.
    const app = await enter(result.profile);
    await app.getState().hydrate();
    expect(app.getState().session!.manual).toHaveLength(1);
    expect(app.getState().hasMissionConfig).toBe(true);
    expect(app.getState().mission.destination).toBe('Moon');
  });

  it('only the first profile adopts: a second one starts empty', async () => {
    const { world } = await worldWithLegacyData();
    const { services } = await world.profileSession('live');
    await services.create(null, { name: 'Ada', role: 'cmo' });
    const bo = await services.create(null, { name: 'Bo', role: 'astronaut' });
    if (!bo.ok) throw new Error('expected ok');
    expect(world.databases.get(liveDbName(bo.profile.id))).toBeUndefined();
  });

  it('retries on the next entry when the first copy failed, and never duplicates', async () => {
    const { world, legacy } = await worldWithLegacyData();
    let failures = 1;
    const original = world.options.open!;
    world.options.open = async (name, wipe) => {
      const opened = await original(name, wipe);
      if (name !== DB_NAME.live && failures > 0) {
        failures -= 1;
        throw new Error('disk full');
      }
      return opened;
    };
    const session = await world.profileSession('live'); // after the wrapper: sessions copy the options
    const result = await session.services.create(null, { name: 'Ada', role: 'cmo' });
    if (!result.ok) throw new Error('expected ok');
    expect(await legacy.getMeta(LEGACY_MIGRATED_META_KEY)).toBeUndefined(); // not marked: still pending

    await session.enter(result.profile); // next load: oldest profile, pending, retried
    await session.enter(result.profile); // and a further one is a no-op
    const snap = await world.databases.get(liveDbName(result.profile.id))!.load();
    expect(snap.manualReadings).toHaveLength(1);
    expect(snap.outbox).toHaveLength(1);
    expect(await legacy.getMeta(LEGACY_MIGRATED_META_KEY)).toBe(result.profile.id);
  });

  it('never copies into the memory fallback and does not mark the legacy database', async () => {
    const { world, legacy } = await worldWithLegacyData();
    let persistent = false;
    const original = world.options.open!;
    world.options.open = async (name, wipe) => {
      const opened = await original(name, wipe);
      return name === DB_NAME.live ? opened : { ...opened, storageAvailable: persistent };
    };
    const session = await world.profileSession('live');
    const result = await session.services.create(null, { name: 'Ada', role: 'cmo' });
    if (!result.ok) throw new Error('expected ok');
    expect((await world.databases.get(liveDbName(result.profile.id))!.load()).manualReadings).toHaveLength(0);
    expect(await legacy.getMeta(LEGACY_MIGRATED_META_KEY)).toBeUndefined();

    persistent = true; // storage works on the next load: the pending copy now goes through
    await session.enter(result.profile);
    expect((await world.databases.get(liveDbName(result.profile.id))!.load()).manualReadings).toHaveLength(1);
    expect(await legacy.getMeta(LEGACY_MIGRATED_META_KEY)).toBe(result.profile.id);
  });

  it('does nothing when the legacy database does not exist or is empty', async () => {
    const world = createTestWorld();
    const first = await world.profileSession('live');
    await first.services.create(null, { name: 'Ada', role: 'cmo' });
    expect([...world.databases.keys()]).toEqual([]); // nothing was opened or created

    const empty = createTestWorld();
    await empty.options.open!(DB_NAME.live, false); // exists, but holds nothing
    const second = await empty.profileSession('live');
    const result = await second.services.create(null, { name: 'Ada', role: 'cmo' });
    if (!result.ok) throw new Error('expected ok');
    expect(await (await empty.options.open!(DB_NAME.live, false)).store.getMeta(LEGACY_MIGRATED_META_KEY)).toBeUndefined();
  });
});
