import { describe, expect, it } from 'vitest';
import { createAppStore } from './store/app-store';
import { composeAdapters } from './composition-root';
import { DEMO_SCENARIO_LIST, loadDemoScenario, scenarioFromSearch } from './demo/demo-scenario';
import { catalogSeeds, REASON_CLASS, CATALOG } from '../eval/scenario-instance';
import type { VerdictReason } from '../core/attribution/model';
import type { EvalResults } from '../eval/results';
import committed from '../../reports/engine-eval/results.json';
import { createActiveProfile } from '../adapters/active-profile';
import { createProfileSession } from './boot';
import { activeProfileKey } from './mode';
import { createTestWorld } from '../test-support/compose';
import { seededMinute } from '../adapters/seeded-history';

const results = committed as unknown as EvalResults;
const CREW_NAMES = ['Demo astronaut', 'Demo astronaut 2', 'Demo astronaut 3'];

describe('DEMO scenario picker', () => {
  it('lists every evaluation scenario type, all with the declared demo seed', () => {
    expect(DEMO_SCENARIO_LIST.map((s) => s.id)).toEqual(CATALOG.scenarioTypes.map((t) => t.id));
    expect(new Set(DEMO_SCENARIO_LIST.map((s) => s.seed))).toEqual(new Set([catalogSeeds()[CATALOG.demoSeedIndex]]));
  });

  it('parses ?scenario= and ?seed=, and ignores anything unknown', () => {
    expect(scenarioFromSearch('?mode=demo&scenario=cabin-heat-crew')?.id).toBe('cabin-heat-crew');
    expect(scenarioFromSearch('?scenario=cabin-heat-crew&seed=1005')?.seed).toBe(1005);
    expect(scenarioFromSearch('?scenario=cabin-heat-crew&seed=7')?.seed).toBe(catalogSeeds()[0]);
    expect(scenarioFromSearch('?scenario=nope')).toBeNull();
    expect(scenarioFromSearch('?mode=demo')).toBeNull();
    expect(loadDemoScenario('nope')).toBeNull();
  });

  async function openAsCmo(search: string) {
    const world = createTestWorld();
    const scenario = scenarioFromSearch(search);
    const session = await createProfileSession('demo', {
      ...world.options,
      scenario,
      activeProfile: createActiveProfile(undefined, activeProfileKey('demo')),
    });
    const cmo = (await session.services.profiles.list()).find((p) => p.role === 'cmo')!;
    const store = await session.enter(cmo);
    await store.getState().hydrate();
    return { world, store, adapters: await composeAdapters('demo', cmo, { ...world.options, profiles: session.services.profiles, scenario }), scenario };
  }

  it('puts the demo clock on the last day of the event with every affected reading already stamped', async () => {
    for (const info of DEMO_SCENARIO_LIST) {
      const { adapters, scenario } = await openAsCmo(`?scenario=${info.id}`);
      expect(adapters.mode === 'demo' && adapters.scenario?.name).toBe(info.name);
      const clock = adapters.deps.clock;
      expect(clock.today()).toBe(scenario!.clock.day);
      expect(clock.now()).toBeGreaterThanOrEqual(seededMinute(clock.today(), 'heartRate') - 60);
    }
  });

  it('shows what the evaluation recorded for the same seed: same crew, same engine, same class', async () => {
    for (const info of DEMO_SCENARIO_LIST) {
      const { store } = await openAsCmo(`?scenario=${info.id}`);
      const view = await store.getState().loadCabinAnalysis();
      expect(view.simulated).toBe(true);
      const record = results.scenarios.find((r) => r.typeId === info.id && r.seed === info.seed)!;
      for (const a of record.anomalies.filter((x) => x.detected)) {
        const hits = view.analysis.findings
          .filter((f) => f.name === CREW_NAMES[a.person] && f.indicatorId === a.indicatorId && f.t >= (record.onsetDay! - 1) * 1440)
          .sort((x, y) => x.t - y.t);
        expect(hits.length, `${info.id} ${a.id}`).toBeGreaterThan(0);
        expect(REASON_CLASS[hits[0]!.reason as VerdictReason], `${info.id} ${a.id}`).toBe(
          REASON_CLASS[a.firstReason as VerdictReason],
        );
      }
    }
  }, 120_000);

  const EXCURSION_SCENARIOS = [
    { id: 'cabin-heat-crew', variable: 'cabinTemperature' },
    { id: 'co2-two-crew', variable: 'co2' },
    { id: 'confounder', variable: 'cabinTemperature' },
  ] as const;

  it.each(EXCURSION_SCENARIOS)(
    '$id: at the start position the Cabin now tile is out of limits AND an affected crew finding is listed',
    async ({ id, variable }) => {
      const { world, store } = await openAsCmo(`?scenario=${id}`);
      const record = results.scenarios.find((r) => r.typeId === id && r.seed === catalogSeeds()[CATALOG.demoSeedIndex])!;
      const check = async () => {
        const view = await store.getState().loadCabinAnalysis();
        const tile = view.variables.find((v) => v.def.id === variable)!;
        expect(tile.status, `${id} tile`).not.toBe('none');
        expect(tile.status).not.toBe('noData');
        const affected = record.anomalies.filter((a) => a.detected);
        expect(affected.length).toBeGreaterThan(0);
        expect(
          view.analysis.findings.some((f) => affected.some((a) => f.name === CREW_NAMES[a.person] && f.indicatorId === a.indicatorId)),
          `${id} finding`,
        ).toBe(true);
      };
      await check();
      // The tile must not expire while the page is open: the clock moves 1 mission minute per real minute here.
      world.wait(10 * 60);
      await check();
    },
  );

  it('is ignored in LIVE and leaves the default demo without a scenario', async () => {
    const world = createTestWorld();
    const scenario = scenarioFromSearch('?scenario=cabin-heat-crew');
    const live = await composeAdapters('live', { id: 'p1', name: 'P', role: 'cmo', createdAt: '', updatedAt: '', deleted: false }, { ...world.options, scenario });
    expect(createAppStore(live).getState().scenario).toBeNull();
    expect(live.environment.timeline).toBeNull();
    const plain = createAppStore((await world.app('demo', { role: 'cmo' })).adapters);
    expect(plain.getState().scenario).toBeNull();
  });

  it('Reset demo returns to the scenario start, not to day 150', async () => {
    const { adapters, scenario } = await openAsCmo('?scenario=co2-two-crew');
    if (adapters.mode !== 'demo') throw new Error('demo expected');
    adapters.deps.clock.advanceDay();
    expect(adapters.deps.clock.today()).toBe(scenario!.clock.day + 1);
    adapters.deps.clock.reset();
    expect(adapters.deps.clock.today()).toBe(scenario!.clock.day);
  });
});
