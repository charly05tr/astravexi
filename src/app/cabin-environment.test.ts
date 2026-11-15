import { describe, expect, it } from 'vitest';
import type { Co2Reference } from '../core/environment/co2';
import type { CabinReferenceSource } from '../core/ports';
import { PermissionError } from '../core/profiles/policy';
import { createTestWorld } from '../test-support/compose';

const REFERENCE: Co2Reference = {
  mission: 'RR-19',
  from: '2019-12-03T10:24:00Z',
  to: '2020-01-07T20:10:00Z',
  count: 10192,
  meanPpm: 2562,
  medianPpm: 2516,
  maxPpm: 3581,
  thresholdPpm: 2986,
  sourceUrl: 'https://visualization.osdr.nasa.gov/eda/',
};
const working: CabinReferenceSource = { fetchReference: async () => REFERENCE };

describe('cabin environment use-case', () => {
  it.each(['astronaut', 'flightSurgeon'] as const)('refuses a %s', async (role) => {
    const world = createTestWorld();
    world.cabin.source = working;
    const app = await world.app('demo', { role });
    await expect(app.state().loadCabinEnvironment()).rejects.toBeInstanceOf(PermissionError);
  });

  it('DEMO: compares the simulated value with the NASA threshold', async () => {
    const world = createTestWorld();
    world.cabin.source = working;
    const app = await world.app('demo', { role: 'cmo' });
    const view = await app.state().loadCabinEnvironment();
    expect(view.reference.status).toBe('live');
    expect(view.simulated?.readings).toHaveLength(192);
    expect(view.assessment).toMatchObject({ thresholdPpm: 2986, valuePpm: view.simulated!.latest.ppm });
    const analysis = await app.state().loadCabinAnalysis();
    const card = analysis.variables.find((v) => v.def.id === 'co2')!;
    expect(view.simulated!.latest.ppm).toBe(card.latest); // one source of truth with the cabin variable card
    expect(view.simulated!.readings.map((r) => r.ppm)).toEqual(card.trend);
    expect(view.assessment!.deltaPpm).toBe(Math.round(view.simulated!.latest.ppm - 2986));
  });

  it('LIVE: shows no simulated values, only the reference', async () => {
    const world = createTestWorld();
    world.cabin.source = working;
    const app = await world.app('live', { role: 'cmo' });
    const view = await app.state().loadCabinEnvironment();
    expect(view.simulated).toBeNull();
    expect(view.assessment).toBeNull();
    expect(view.reference.status).toBe('live');
  });

  it('falls back to the cached reference when NASA is unreachable, and says so', async () => {
    const world = createTestWorld();
    world.cabin.source = working;
    const app = await world.app('demo', { role: 'cmo' });
    await app.state().loadCabinEnvironment(); // saves the cache
    world.wait(3600);
    world.cabin.source = { fetchReference: async () => Promise.reject(new Error('NASA OSDR could not be reached.')) };
    const view = await app.state().loadCabinEnvironment();
    expect(view.reference).toMatchObject({ status: 'cached', reference: REFERENCE });
    expect(view.assessment?.thresholdPpm).toBe(2986);
  });

  it('reports the reference as unavailable, never a made-up one, when there is no cache', async () => {
    const world = createTestWorld();
    const app = await world.app('demo', { role: 'cmo' });
    const view = await app.state().loadCabinEnvironment();
    expect(view.reference).toEqual({ status: 'unavailable', message: 'NASA OSDR could not be reached.' });
    expect(view.assessment).toBeNull();
    expect(view.simulated).not.toBeNull();
  });
it('cache-first: answers from the saved copy without asking NASA, and flags it stale after a day', async () => {
    const world = createTestWorld();
    world.cabin.source = working;
    const app = await world.app('demo', { role: 'cmo' });
    await app.state().loadCabinEnvironment(); // saves the cache
    let calls = 0;
    world.cabin.source = { fetchReference: async () => { calls += 1; return REFERENCE; } };
    const fresh = await app.state().loadCabinEnvironment({ cacheFirst: true });
    expect(fresh.reference).toMatchObject({ status: 'saved', stale: false, reference: REFERENCE });
    expect(fresh.assessment?.thresholdPpm).toBe(2986);
    world.wait(25 * 3600);
    const old = await app.state().loadCabinEnvironment({ cacheFirst: true });
    expect(old.reference).toMatchObject({ status: 'saved', stale: true });
    expect(calls).toBe(0);
  });

  it('cache-first falls through to NASA when nothing is saved', async () => {
    const world = createTestWorld();
    world.cabin.source = working;
    const app = await world.app('demo', { role: 'cmo' });
    const view = await app.state().loadCabinEnvironment({ cacheFirst: true });
    expect(view.reference.status).toBe('live');
  });
});
