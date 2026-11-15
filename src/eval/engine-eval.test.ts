import { describe, expect, it } from 'vitest';
import { cabinKnowledge } from '../knowledge';
import committed from '../../reports/engine-eval/results.json';
import { sha256OfJson } from './results';
import type { EvalResults } from './results';
import { HEALTH_SIM_PARAMS } from '../adapters/health-sim';
import { MAGNITUDE_BUCKETS, completedSentence, runAllScenarios, summarize } from './run-evaluation';
import { CATALOG, REASON_CLASS, buildScenario, catalogSeeds } from './scenario-instance';

const expected = committed as unknown as EvalResults;

/**
 * This is what makes the headline number verifiable. The suite re-runs a deterministic subset (the first
 * SUBSET_SEEDS seeds of every scenario type, 42 of the 210 scenarios, about 2 s) and asserts that every per-scenario
 * record equals the committed one. The remaining checks tie the committed aggregates and the sentence to the
 * committed records, so the headline number cannot drift from them. The FULL re-run of all 210 scenarios (about 10 s,
 * too heavy for the default suite: it starves the slow jsdom tests) is `pnpm eval:engine -- --check`: it regenerates
 * everything in memory and exits non-zero on any difference from reports/engine-eval/results.json.
 */
const SUBSET_SEEDS = 6;

describe('attribution engine evaluation (deterministic subset re-run equals the committed results)', () => {
  it('reproduces the committed per-scenario records', () => {
    const seeds = catalogSeeds().slice(0, SUBSET_SEEDS);
    const fresh = runAllScenarios(CATALOG, seeds);
    const committedSubset = expected.scenarios.filter((r) => seeds.includes(r.seed));
    expect(committedSubset).toHaveLength(CATALOG.scenarioTypes.length * SUBSET_SEEDS);
    expect(fresh).toEqual(committedSubset);
  }, 60_000);

  it('the committed aggregates and sentence follow from the committed per-scenario records', () => {
    const summary = summarize(expected.scenarios);
    expect(summary).toEqual(expected.summary);
    expect(completedSentence(summary)).toBe(expected.sentence);
    expect(expected.seeds).toEqual(catalogSeeds());
  });

  it('was generated with the committed simulator parameters and attribution config', async () => {
    expect(await sha256OfJson(HEALTH_SIM_PARAMS)).toBe(expected.healthSimParamsSha256);
    expect(cabinKnowledge.config).toEqual(expected.attributionConfig);
  });

  it('records the hash of the scenario file the results were produced from', async () => {
    expect(await sha256OfJson(CATALOG)).toBe(expected.scenarioFileSha256);
  });
});

describe('scenario catalog', () => {
  const seeds = catalogSeeds();

  it('has the required scenario types, a crew of 3 and at least 28 warm-up days', () => {
    expect(CATALOG.scenarioTypes.map((t) => t.id)).toEqual([
      'no-anomaly',
      'individual-fever',
      'individual-heart-rate',
      'cabin-heat-crew',
      'co2-two-crew',
      'shared-non-environmental',
      'confounder',
    ]);
    expect(CATALOG.crewSize).toBe(3);
    expect(CATALOG.warmupDays).toBeGreaterThanOrEqual(28);
    expect(seeds.length).toBeGreaterThanOrEqual(30);
  });

  it('maps every verdict reason to a class explicitly', () => {
    expect(Object.keys(REASON_CLASS).sort()).toEqual(
      [
        'crew-wide-and-linked-excursion',
        'crew-wide-environment-unknown',
        'crew-wide-no-monitored-excursion',
        'insufficient-baseline',
        'insufficient-crew-data',
        'linked-excursion-crew-unknown',
        'linked-excursion-individual-susceptibility',
        'no-environment-data',
        'no-external-signal',
      ].sort(),
    );
  });

  it('never injects an environmental anomaly on an indicator the cabin file does not link to the excursion variable', () => {
    for (const t of CATALOG.scenarioTypes) {
      for (const a of t.anomalies.filter((x) => x.class === 'environmental')) {
        const linked = cabinKnowledge.links.some(
          (l) => l.variable === t.cabinExcursion?.variable && l.indicatorId === a.indicatorId && l.outlierDirection === (a.direction === 'up' ? 'above' : 'below'),
        );
        expect(linked, `${t.id}: ${a.indicatorId}`).toBe(true);
      }
    }
  });

  it('starts every anomaly after the warm-up and keeps magnitudes in the declared range', () => {
    for (const t of CATALOG.scenarioTypes) {
      for (const seed of seeds.slice(0, 3)) {
        const s = buildScenario(t.id, seed);
        for (const a of s.anomalies) {
          expect(a.fromDay).toBeGreaterThanOrEqual(CATALOG.firstDay + CATALOG.warmupDays);
          expect(a.toDay).toBeLessThanOrEqual(s.lastDay);
          expect(a.magnitudeSd).toBeGreaterThanOrEqual(CATALOG.magnitudeSd.min);
          expect(a.magnitudeSd).toBeLessThanOrEqual(CATALOG.magnitudeSd.max);
        }
      }
    }
    expect(MAGNITUDE_BUCKETS[0]!.lo).toBe(CATALOG.magnitudeSd.min);
  });

  it('crosses the NASA limit during an excursion scenario and never otherwise', () => {
    const limitOf = (variable: string) => cabinKnowledge.variables.find((v) => v.id === variable)!.operating!.max!;
    for (const t of CATALOG.scenarioTypes) {
      for (const seed of seeds.slice(0, 4)) {
        const s = buildScenario(t.id, seed);
        const variable = t.cabinExcursion?.variable;
        for (const v of ['co2', 'cabinTemperature'] as const) {
          const crossed = s.samples.some((x) => x.values[v]! > limitOf(v));
          expect(crossed, `${t.id}/${seed}/${v}`).toBe(variable === v);
        }
      }
    }
  });
});
