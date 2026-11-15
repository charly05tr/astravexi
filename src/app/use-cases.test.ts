import { describe, expect, it } from 'vitest';
import { createMemoryRecordStore } from '../adapters/memory-record-store';
import type { RecordStore } from '../core/ports';
import { toActor } from '../core/profiles/model';
import { DB_NAME } from './mode';
import { createTestWorld, testProfile } from '../test-support/compose';
import { FIRST_DAY } from '../adapters/seeded-history';
import type { Reading, ZoneId } from '../core/health/model';

const statuses = (zones: Record<ZoneId, { status: string }>) =>
  Object.fromEntries(Object.entries(zones).map(([id, z]) => [id, z.status]));

const SEED_STATUSES = {
  brain: 'caution',
  heart: 'notice',
  immune: 'none',
  metabolism: 'none',
  eyes: 'unmonitored',
  bone: 'unmonitored',
};

/** Counts calls on the store methods we care about. */
function spy(store: RecordStore) {
  const calls = { clearAll: 0, updateOutbox: [] as string[][], putOutboxIfAbsent: [] as boolean[] };
  const wrapped: RecordStore = {
    ...store,
    clearAll: () => {
      calls.clearAll += 1;
      return store.clearAll();
    },
    updateOutbox: (messages) => {
      calls.updateOutbox.push(messages.map((m) => m.id));
      return store.updateOutbox(messages);
    },
    putOutboxIfAbsent: async (m) => {
      const stored = await store.putOutboxIfAbsent(m);
      calls.putOutboxIfAbsent.push(stored);
      return stored;
    },
  };
  return { wrapped, calls };
}

const bp = (systolic: number, diastolic: number) => ({ values: { bpSystolic: systolic, bpDiastolic: diastolic } });

describe('DEMO hydrate', () => {
  it('starts at day 150 with the seeded statuses and an empty outbox', async () => {
    const world = createTestWorld();
    const { state } = await world.app('demo');
    const s = state();
    expect(s.status).toBe('ready');
    expect(s.mission.today).toBe(150);
    expect(statuses(s.session!.evaluation.zones)).toEqual(SEED_STATUSES);
    expect(s.session!.outbox).toEqual([]);
    expect(s.session!.synthetic.length).toBeGreaterThan(0);
  });

  it('opens only the DEMO database', async () => {
    const world = createTestWorld();
    await world.app('demo');
    expect(world.opened).toEqual([DB_NAME.demo]);
  });

  it('never stores synthetic history', async () => {
    const world = createTestWorld();
    await world.app('demo');
    const snap = await world.databases.get(DB_NAME.demo)!.load();
    expect(snap.manualReadings).toEqual([]);
  });
});

describe('check-in and outbox', () => {
  it('BP 185/125 gives heart Warning and exactly one outbox message', async () => {
    const world = createTestWorld();
    const { state } = await world.app('demo');
    const result = await state().submitCheckIn(bp(185, 125));
    expect(result.ok).toBe(true);
    const s = state().session!;
    expect(s.evaluation.zones.heart.status).toBe('warning');
    expect(s.outbox).toHaveLength(1);
    expect(s.outbox[0]).toMatchObject({ zoneId: 'heart', state: 'queued', payload: { source: 'MANUAL' } });
  });

  it('no duplicate message after re-hydrating from the same database', async () => {
    const world = createTestWorld();
    const first = await world.app('demo');
    await first.state().submitCheckIn(bp(185, 125));
    const { wrapped, calls } = spy(world.databases.get(DB_NAME.demo)!);
    world.databases.set(DB_NAME.demo, wrapped);
    const second = await world.app('demo'); // a reload: new adapters, same database
    expect(second.state().session!.outbox).toHaveLength(1);
    expect(second.state().session!.evaluation.zones.heart.status).toBe('warning');
    expect(calls.putOutboxIfAbsent).toEqual([]); // nothing new was even attempted
    expect((await wrapped.load()).outbox).toHaveLength(1);
  });

  it('stores the check-in as MANUAL on the current mission day, as one group', async () => {
    const world = createTestWorld();
    const { state } = await world.app('demo');
    const out = await state().submitCheckIn({ values: { heartRate: 64, temperature: 37.7 }, symptomatic: true });
    if (!out.ok) throw new Error('expected ok');
    const manual = state().session!.manual;
    expect(manual).toHaveLength(2);
    expect(new Set(manual.map((r) => r.groupId))).toEqual(new Set([out.groupId]));
    expect(manual.every((r) => r.source === 'MANUAL' && r.day === 150 && r.symptomatic)).toBe(true);
    expect(manual.find((r) => r.indicatorId === 'temperature')!.value).toBe(377); // stored units
  });

  it('rejects out-of-range input whole and stores nothing', async () => {
    const world = createTestWorld();
    const { state } = await world.app('demo');
    const before = statuses(state().session!.evaluation.zones);
    const out = await state().submitCheckIn({ values: { temperature: 50, heartRate: 64 } });
    expect(out).toMatchObject({ ok: false, errors: { temperature: expect.any(String) } });
    expect(state().session!.manual).toEqual([]);
    expect((await world.databases.get(DB_NAME.demo)!.load()).manualReadings).toEqual([]);
    expect(statuses(state().session!.evaluation.zones)).toEqual(before);
  });

  it('rejects an empty entry and a non-numeric value', async () => {
    const world = createTestWorld();
    const { state } = await world.app('demo');
    expect(await state().submitCheckIn({ values: {} })).toMatchObject({ ok: false, errors: { form: expect.any(String) } });
    expect(await state().submitCheckIn({ values: { heartRate: Number.NaN } })).toMatchObject({ ok: false });
  });

  it('stores context on context-aware readings only: 40.5 C after exercise is not a Warning', async () => {
    const world = createTestWorld();
    const { state } = await world.app('demo');
    await state().submitCheckIn({ values: { temperature: 40.5, glucose: 92 }, context: 'exercise' });
    const manual = state().session!.manual;
    expect(manual.find((r) => r.indicatorId === 'temperature')!.context).toBe('exercise');
    expect(manual.find((r) => r.indicatorId === 'glucose')!.context).toBe('rest');
    expect(state().session!.evaluation.zones.immune.status).toBe('none');
    expect(state().session!.outbox).toEqual([]);
  });

  it('a Warning that appears during a blackout starts held, then is sent when the link returns', async () => {
    const world = createTestWorld();
    const { state } = await world.app('demo');
    await state().setBlackout(true);
    await state().submitCheckIn(bp(185, 125));
    expect(state().session!.outbox[0]!.state).toBe('held');
    await state().setBlackout(false);
    const sent = state().session!.outbox[0]!;
    expect(sent.state).toBe('sent');
    expect(sent.oneWayDelayMin).toBe(12);
    expect(sent.replyPossibleAt).toBe(sent.sentAt! + 24);
  });

  it('Send now freezes the delay at send time; reply becomes possible after 2D mission minutes', async () => {
    const world = createTestWorld();
    const { state } = await world.app('demo');
    await state().submitCheckIn(bp(185, 125));
    await state().setDelay(20);
    await state().sendNow(state().session!.outbox[0]!.id);
    await state().setDelay(3); // later changes do not touch a sent message
    const sent = state().session!.outbox[0]!;
    expect(sent).toMatchObject({ state: 'sent', oneWayDelayMin: 20 });
    world.wait(39); // 39 real seconds = 39 mission minutes: not yet T+40
    await state().tick();
    expect(state().session!.outbox[0]!.state).toBe('sent');
    world.wait(1);
    await state().tick();
    expect(state().session!.outbox[0]!.state).toBe('replyPossible');
  });

  it('clamps the delay to 0-22 minutes', async () => {
    const world = createTestWorld();
    const { state } = await world.app('demo');
    await state().setDelay(99);
    expect(state().link.oneWayDelayMin).toBe(22);
    await state().setDelay(-4);
    expect(state().link.oneWayDelayMin).toBe(0);
  });

  it('persists only on change: idle ticks write nothing, a state change writes only that message', async () => {
    const world = createTestWorld();
    const spies: Array<ReturnType<typeof spy>> = [];
    world.instrument('demo', (base) => {
      const s = spy(base);
      spies.push(s);
      return s.wrapped;
    });
    const { state } = await world.app('demo');
    const calls = spies[0]!.calls;
    await state().submitCheckIn(bp(185, 125));
    await state().tick();
    await state().tick();
    expect(calls.updateOutbox).toEqual([]);
    await state().sendNow(state().session!.outbox[0]!.id);
    expect(calls.updateOutbox).toHaveLength(1);
    expect(calls.updateOutbox[0]).toHaveLength(1);
    await state().tick();
    expect(calls.updateOutbox).toHaveLength(1);
  });
});

describe('acknowledge', () => {
  it('releases the latch for the whole (zone, group): both crisis rules, outbox message stays', async () => {
    const world = createTestWorld();
    const { state } = await world.app('demo');
    const first = await state().submitCheckIn(bp(185, 125));
    if (!first.ok) throw new Error('expected ok');
    world.wait(300);
    await state().submitCheckIn(bp(130, 80)); // normal re-measure
    const heart = state().session!.evaluation.zones.heart;
    expect(heart.status).toBe('warning'); // latched
    expect(heart.findings.filter((f) => f.latched).map((f) => f.ruleId).sort()).toEqual([
      'bp-crisis-diastolic',
      'bp-crisis-systolic',
    ]);

    state().setActor(toActor(testProfile('cmo')));
    await state().acknowledge('heart', first.groupId);
    const after = state().session!;
    expect(after.evaluation.zones.heart.status).toBe('notice'); // back to its data-derived status
    expect(after.evaluation.zones.heart.findings.some((f) => f.latched)).toBe(false);
    expect(after.outbox).toHaveLength(1);
    expect(after.acks).toHaveLength(1);
  });

  it('acknowledging twice stores one acknowledgement', async () => {
    const world = createTestWorld();
    const { state } = await world.app('demo');
    const first = await state().submitCheckIn(bp(185, 125));
    if (!first.ok) throw new Error('expected ok');
    state().setActor(toActor(testProfile('cmo')));
    await state().acknowledge('heart', first.groupId);
    await state().acknowledge('heart', first.groupId);
    expect(state().session!.acks).toHaveLength(1);
    expect((await world.databases.get(DB_NAME.demo)!.load()).acks).toHaveLength(1);
  });
});

describe('recommendation decisions', () => {
  it('are logged and never change a tier', async () => {
    const world = createTestWorld();
    const { state } = await world.app('demo');
    const before = statuses(state().session!.evaluation.zones);
    await state().decideRecommendation({ recommendationId: 'sleep-window', findingKey: 'k', decision: 'dismissed' });
    await state().decideRecommendation({ recommendationId: 'sleep-window', findingKey: 'k', decision: 'accepted' });
    expect(state().session!.decisions.map((d) => d.decision)).toEqual(['dismissed', 'accepted']);
    expect(statuses(state().session!.evaluation.zones)).toEqual(before);
    expect((await world.databases.get(DB_NAME.demo)!.load()).decisions).toHaveLength(2);
  });
});

describe('advance one day', () => {
  it('extends the history by one day without changing earlier days, keeps MANUAL entries', async () => {
    const world = createTestWorld();
    const { state } = await world.app('demo');
    await state().submitCheckIn({ values: { glucose: 92 } });
    const before = state().session!.synthetic;
    await state().advanceDay();
    const s = state();
    expect(s.mission.today).toBe(151);
    expect(s.session!.evaluation.asOf.day).toBe(151);
    const after = s.session!.synthetic;
    expect(after.length).toBe(before.length + 7);
    expect(after.slice(0, before.length)).toEqual(before);
    const days = (rs: readonly Reading[]) => [...new Set(rs.map((r) => r.day))];
    expect(days(after)[0]).toBe(FIRST_DAY);
    expect(days(after).at(-1)).toBe(151);
    expect(s.session!.manual).toHaveLength(1);
  });

  it('is deterministic: two runs give identical day-151 statuses', async () => {
    const run = async () => {
      const world = createTestWorld();
      const { state } = await world.app('demo');
      await state().advanceDay();
      return state().session!.evaluation;
    };
    const a = await run();
    const b = await run();
    expect(statuses(a.zones)).toEqual(statuses(b.zones));
    expect(a.zones.brain.status).toBe('caution');
  });

  it('persists the day: a reload resumes day 151', async () => {
    const world = createTestWorld();
    const first = await world.app('demo');
    await first.state().advanceDay();
    const reloaded = await world.app('demo');
    expect(reloaded.state().mission.today).toBe(151);
  });

  it('re-evaluation after advancing does not duplicate an existing Warning message', async () => {
    const world = createTestWorld();
    const { state } = await world.app('demo');
    await state().submitCheckIn(bp(185, 125));
    await state().advanceDay();
    expect(state().session!.outbox).toHaveLength(1);
  });
});

describe('reset demo', () => {
  it('restores the seed state, day 150 and the empty outbox', async () => {
    const world = createTestWorld();
    const { state } = await world.app('demo');
    await state().submitCheckIn(bp(185, 125));
    await state().advanceDay();
    await state().resetDemo();
    const s = state();
    expect(s.mission.today).toBe(150);
    expect(s.generation).toBe(1);
    expect(statuses(s.session!.evaluation.zones)).toEqual(SEED_STATUSES);
    expect(s.session).toMatchObject({ manual: [], acks: [], decisions: [], outbox: [] });
    const snap = await world.databases.get(DB_NAME.demo)!.load();
    expect(snap).toEqual({ manualReadings: [], decisions: [], acks: [], outbox: [] });
  });

  it('leaves LIVE data untouched and never calls clearAll on the LIVE store', async () => {
    const world = createTestWorld();
    const liveSpy = spy(createMemoryRecordStore(world.dbName('live')));
    world.instrument('live', () => liveSpy.wrapped);
    const live = await world.app('live');
    await live.state().submitCheckIn({ values: { heartRate: 64 } });

    const demo = await world.app('demo');
    await demo.state().submitCheckIn(bp(185, 125));
    await demo.state().resetDemo();

    expect(liveSpy.calls.clearAll).toBe(0);
    const liveSnap = await world.databases.get(world.dbName('live'))!.load();
    expect(liveSnap.manualReadings).toHaveLength(1);
    expect(liveSnap.manualReadings[0]).toMatchObject({ indicatorId: 'heartRate', value: 64 });
  });

  it('is refused in LIVE mode', async () => {
    const world = createTestWorld();
    const { state } = await world.app('live');
    await expect(state().resetDemo()).rejects.toThrow(/DEMO only/);
    await expect(state().advanceDay()).rejects.toThrow(/DEMO only/);
  });

  it('a tick in flight cannot bring messages back (generation guard + serial queue)', async () => {
    const world = createTestWorld();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    let armed = false;
    world.instrument('demo', (store) => ({
      ...store,
      updateOutbox: async (messages) => {
        if (armed) await gate;
        return store.updateOutbox(messages);
      },
    }));
    const { state } = await world.app('demo');
    await state().submitCheckIn(bp(185, 125));
    armed = true;

    const inFlight = state().setBlackout(true); // tick: queued -> held, blocks in updateOutbox
    await new Promise((r) => setTimeout(r, 0));
    const queued = state().tick(); // waiting behind the in-flight tick
    const reset = state().resetDemo();
    armed = false;
    release();
    await Promise.all([inFlight, queued, reset]);

    expect(state().session!.outbox).toEqual([]);
    expect(state().link.blackout).toBe(false);
    expect((await world.databases.get(DB_NAME.demo)!.load()).outbox).toEqual([]);
  });

  it('a tick that was queued before the reset is discarded', async () => {
    const world = createTestWorld();
    const { state } = await world.app('demo');
    await state().submitCheckIn(bp(185, 125));
    const ticks = [state().tick(), state().tick()];
    const reset = state().resetDemo();
    await Promise.all([...ticks, reset]);
    expect(state().session!.outbox).toEqual([]);
    expect((await world.databases.get(DB_NAME.demo)!.load()).outbox).toEqual([]);
  });

  it('a check-in submitted before the reset is discarded, not resurrected', async () => {
    const world = createTestWorld();
    const { state } = await world.app('demo');
    const pending = state().submitCheckIn(bp(185, 125));
    const reset = state().resetDemo();
    const [result] = await Promise.all([pending, reset]);
    expect(result.ok).toBe(false);
    expect(state().session!.manual).toEqual([]);
  });
});

describe('LIVE mode', () => {
  it('opens only the LIVE database and starts empty: no synthetic data, zones read noData', async () => {
    const world = createTestWorld();
    const { state } = await world.app('live');
    expect(world.opened).toEqual([world.dbName('live')]);
    const s = state();
    expect(s.session!.synthetic).toEqual([]);
    expect(s.mission).toMatchObject({ today: 1, transitDays: 210, destination: 'Mars', scaleLabel: 'real minutes' });
    expect(s.hasMissionConfig).toBe(false);
    expect(statuses(s.session!.evaluation.zones)).toEqual({
      brain: 'noData',
      heart: 'noData',
      immune: 'noData',
      metabolism: 'noData',
      eyes: 'unmonitored',
      bone: 'unmonitored',
    });
    expect(s.session!.outbox).toEqual([]);
  });

  it('BP 185/125 on day 1: heart Warning, one queued message, temperature baseline building', async () => {
    const world = createTestWorld();
    const { state } = await world.app('live');
    await state().submitCheckIn({ values: { ...bp(185, 125).values, temperature: 37.2 } });
    const s = state().session!;
    expect(s.evaluation.zones.heart.status).toBe('warning');
    expect(s.outbox).toHaveLength(1);
    expect(s.evaluation.indicatorStatus.temperature.baseline).toBe('building');
  });

  it('a saved mission config sets the day from the real date and survives a reload', async () => {
    const world = createTestWorld(new Date(2026, 5, 11, 9, 0).getTime());
    const { state } = await world.app('live');
    await state().saveMissionConfig({ launchDate: '2026-06-01', transitDays: 180, destination: 'Mars' });
    expect(state().mission).toMatchObject({ today: 11, transitDays: 180 });
    expect(state().hasMissionConfig).toBe(true);
    const reloaded = await world.app('live');
    expect(reloaded.state().mission).toMatchObject({ today: 11, transitDays: 180 });
    expect(reloaded.state().hasMissionConfig).toBe(true);
  });

  it('re-evaluates on a day rollover', async () => {
    const world = createTestWorld(new Date(2026, 5, 15, 23, 59, 0).getTime());
    const { state } = await world.app('live');
    expect(state().mission.today).toBe(1);
    world.wait(120);
    await state().tick();
    expect(state().mission.today).toBe(2);
    expect(state().session!.evaluation.asOf.day).toBe(2);
  });
});

describe('storage fallback', () => {
  it('reports when the memory fallback is in use', async () => {
    const { composeAdapters } = await import('./composition-root');
    const { testProfile } = await import('../test-support/compose');
    const adapters = await composeAdapters('live', testProfile(), {
      open: async (name) => ({ store: createMemoryRecordStore(name), storageAvailable: false }),
    });
    expect(adapters.storageAvailable).toBe(false);
  });
});
