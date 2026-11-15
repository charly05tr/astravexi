import { describe, expect, it } from 'vitest';
import { toActor } from '../core/profiles/model';
import { PermissionError } from '../core/profiles/policy';
import { createTestWorld } from '../test-support/compose';
import type { TestWorld } from '../test-support/compose';
import { DEMO_ASTRONAUT_ID, DEMO_CREW_EXTRAS } from './demo/demo-profiles';
import { DB_NAME, demoCrewDbName, liveDbName } from './mode';

const bp = (sys: number, dia: number) => ({ values: { bpSystolic: sys, bpDiastolic: dia } });

/** A LIVE device with a CMO and two astronauts; Ada records a Warning, Bo nothing. */
async function liveCrew(world: TestWorld) {
  const { services, enter } = await world.profileSession('live');
  const chief = await services.create(null, { name: 'Chief', role: 'cmo' });
  if (!chief.ok) throw new Error('expected ok');
  const ada = await services.create(toActor(chief.profile), { name: 'Ada', role: 'astronaut' });
  const bo = await services.create(toActor(chief.profile), { name: 'Bo', role: 'astronaut' });
  if (!ada.ok || !bo.ok) throw new Error('expected ok');
  const cmoApp = await enter(chief.profile);
  await cmoApp.getState().hydrate();
  return { services, enter, chief: chief.profile, ada: ada.profile, bo: bo.profile, cmoApp };
}

describe('crew review (LIVE)', () => {
  it('evaluates every astronaut against their own records and leaves out a CMO with no records', async () => {
    const world = createTestWorld();
    const { enter, ada, bo, cmoApp } = await liveCrew(world);
    const adaApp = await enter(ada);
    await adaApp.getState().hydrate();
    await adaApp.getState().submitCheckIn(bp(185, 125));
    const boApp = await enter(bo);
    await boApp.getState().hydrate();
    await boApp.getState().submitCheckIn({ values: { heartRate: 62 } });

    const review = await cmoApp.getState().loadCrew();
    expect(review.unavailable).toEqual([]);
    expect(review.members.map((m) => m.name).sort()).toEqual(['Ada', 'Bo']);
    const adaView = review.members.find((m) => m.name === 'Ada')!;
    const boView = review.members.find((m) => m.name === 'Bo')!;
    expect(adaView.evaluation.zones.heart.status).toBe('warning');
    expect(boView.evaluation.zones.heart.status).not.toBe('warning'); // Ada's reading never leaks into Bo
    expect(adaView.lastReadingT).not.toBeNull();
    expect(JSON.stringify(review)).not.toMatch(/"pin"/);
  });

  it('shows a CMO or flight surgeon who has recorded something', async () => {
    const world = createTestWorld();
    const { chief, cmoApp } = await liveCrew(world);
    const store = world.databases.get(liveDbName(chief.id))!;
    await store.addReadings([
      { id: 'r1', indicatorId: 'heartRate', value: 60, day: 1, t: 5, source: 'MANUAL', context: 'rest', symptomatic: false, groupId: 'g1' },
    ]);
    const names = (await cmoApp.getState().loadCrew()).members.map((m) => [m.name, m.role]);
    expect(names).toContainEqual(['Chief', 'cmo']);
  });

  it('acknowledges for the given crew member, not for the acting CMO', async () => {
    const world = createTestWorld();
    const { enter, ada, bo, chief, cmoApp } = await liveCrew(world);
    const adaApp = await enter(ada);
    await adaApp.getState().hydrate();
    const out = await adaApp.getState().submitCheckIn(bp(185, 125));
    if (!out.ok) throw new Error('expected ok');
    world.wait(3600);
    await adaApp.getState().submitCheckIn(bp(130, 80)); // a normal re-measure: the Warning stays latched
    const before = (await cmoApp.getState().loadCrew()).members.find((m) => m.name === 'Ada')!;
    expect(before.evaluation.zones.heart.status).toBe('warning');

    const after = await cmoApp.getState().acknowledgeCrewMember(ada.id, 'heart', out.groupId);
    expect(after!.evaluation.zones.heart.status).not.toBe('warning');
    const acks = (await world.databases.get(liveDbName(ada.id))!.load()).acks;
    expect(acks).toHaveLength(1);
    expect(acks[0]!.by).toEqual({ profileId: chief.id, role: 'cmo' });
    expect((await world.databases.get(liveDbName(bo.id))!.load()).acks).toEqual([]);
    expect((await world.databases.get(liveDbName(chief.id))!.load()).acks).toEqual([]);

    // Idempotent by (zone, group).
    await cmoApp.getState().acknowledgeCrewMember(ada.id, 'heart', out.groupId);
    expect((await world.databases.get(liveDbName(ada.id))!.load()).acks).toHaveLength(1);
  });

  it('returns null for an unknown or deleted profile', async () => {
    const world = createTestWorld();
    const { services, bo, chief, cmoApp } = await liveCrew(world);
    expect(await cmoApp.getState().acknowledgeCrewMember('nobody', 'heart', 'g')).toBeNull();
    await services.profiles.softDelete(bo.id, '2026-06-02T00:00:00.000Z');
    expect(await cmoApp.getState().acknowledgeCrewMember(bo.id, 'heart', 'g')).toBeNull();
    expect((await cmoApp.getState().loadCrew()).members.map((m) => m.name)).not.toContain('Bo');
    expect(chief.role).toBe('cmo');
  });

  it('reports a member whose records cannot be read instead of dropping them silently', async () => {
    const world = createTestWorld();
    const { ada } = await liveCrew(world);
    const failing = await world.app('live', { role: 'cmo' });
    const base = failing.adapters.crew.open;
    failing.adapters.crew.open = async (p) => {
      if (p.id === ada.id) throw new Error('boom');
      return base(p);
    };
    const review = await failing.state().loadCrew();
    expect(review.unavailable).toEqual([{ profileId: ada.id, name: 'Ada' }]);
  });

  it('is refused for an astronaut, for loading and for acknowledging', async () => {
    const world = createTestWorld();
    const { ada, enter } = await liveCrew(world);
    const adaApp = await enter(ada);
    await adaApp.getState().hydrate();
    await expect(adaApp.getState().loadCrew()).rejects.toBeInstanceOf(PermissionError);
    await expect(adaApp.getState().acknowledgeCrewMember(ada.id, 'heart', 'g')).rejects.toBeInstanceOf(PermissionError);
  });
});

describe('crew review (DEMO)', () => {
  it('has three synthetic astronauts with their own histories, and no row for the demo CMO', async () => {
    const world = createTestWorld();
    const { services, enter } = await world.profileSession('demo');
    const cmo = (await services.profiles.list()).find((p) => p.role === 'cmo')!;
    const cmoApp = await enter(cmo);
    await cmoApp.getState().hydrate();

    const review = await cmoApp.getState().loadCrew();
    expect(review.members.map((m) => m.profileId)).toEqual([DEMO_ASTRONAUT_ID, ...DEMO_CREW_EXTRAS.map((c) => c.id)]);
    const names = review.members.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length); // each crew member appears exactly once
    const brain = review.members.map((m) => m.evaluation.zones.brain.status);
    expect(brain[0]).toBe('caution'); // the demo astronaut keeps the persona's drift
    expect(brain[2]).toBe('none'); // the calm crewmate has none
  });

  it('acknowledges an extra demo crew member in its own database, and Reset demo empties it', async () => {
    const world = createTestWorld();
    const { services, enter } = await world.profileSession('demo');
    const cmo = (await services.profiles.list()).find((p) => p.role === 'cmo')!;
    const cmoApp = await enter(cmo);
    await cmoApp.getState().hydrate();
    const extra = DEMO_CREW_EXTRAS[0]!;
    await cmoApp.getState().loadCrew(); // opens the extra databases
    const store = world.databases.get(demoCrewDbName(extra.id))!;
    expect(store).toBeDefined();

    await cmoApp.getState().acknowledgeCrewMember(extra.id, 'heart', 'seed:150');
    expect((await store.load()).acks).toHaveLength(1);
    expect((await world.databases.get(DB_NAME.demo)!.load()).acks).toEqual([]);

    await cmoApp.getState().resetDemo();
    expect((await store.load()).acks).toEqual([]);
  });
});
