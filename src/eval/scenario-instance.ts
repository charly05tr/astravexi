import { analyzeCabinAndCrew } from '../core/attribution/analyze';
import type { AttributedReading } from '../core/attribution/analyze';
import type { CabinSample, VerdictReason } from '../core/attribution/model';
import type { IndicatorId, MissionDay, MissionMinute, Reading } from '../core/health/model';
import { cabinKnowledge, knowledge } from '../knowledge';
import { createSimulatedCabinTimeline } from '../adapters/seeded-history/cabin-timeline';
import type { CabinEpisodeSpec } from '../adapters/seeded-history/cabin-timeline';
import { drawTraits, generatePersonReadings } from '../adapters/health-sim';
import type { SimInjection } from '../adapters/health-sim';
import { daySeed, mulberry32 } from '../adapters/seeded-history/mulberry32';
import scenariosJson from './scenarios.json';

/**
 * FROZEN DEFINITIONS (written before the first run; see reports/engine-eval/summary.md).
 *
 * Anomaly unit: one (person, indicator, episode). A cabin event that hits 3 crew is 3 anomalies.
 * Detected: the engine yields at least one finding for that person and indicator whose reading time lies in
 *   [episode start, episode end + the largest documented lag for that indicator in cabin.json].
 *   Episode start = start of the first affected mission day; episode end = end of the last affected day.
 * False alarm: any finding (one atypical reading) that does not match an injected anomaly.
 * Verdict to class: likely-internal -> individual; likely-external -> environmental; possibly-external with a
 *   linked excursion -> environmental; possibly-external crew-wide with no monitored excursion -> shared;
 *   insufficient-data -> undetermined (counts as incorrect). Every VerdictReason is mapped explicitly below.
 * Several matching findings: the anomaly's class is the majority class; ties go to the earliest finding.
 */

export type TruthClass = 'individual' | 'environmental' | 'shared';
export type PredictedClass = TruthClass | 'undetermined';

export interface ScenarioTypeSpec {
  id: string;
  name: string;
  description: string;
  cabinExcursion: { variable: 'co2' | 'cabinTemperature'; deltaRange: [number, number] } | null;
  anomalies: Array<{ indicatorId: IndicatorId; affected: 'one' | 'two' | 'all'; direction: 'up' | 'down'; class: TruthClass }>;
}
export interface ScenarioCatalog {
  crewSize: number;
  firstDay: MissionDay;
  warmupDays: number;
  judgedDays: number;
  seeds: { first: number; count: number };
  demoSeedIndex: number;
  magnitudeSd: { min: number; max: number };
  durationDays: { min: number; max: number };
  onsetOffsetDays: { min: number; max: number };
  cabinExcursionTiming: { startHourPreviousDay: number; endHourLastDay: number };
  scenarioTypes: ScenarioTypeSpec[];
}
export const CATALOG = scenariosJson as unknown as ScenarioCatalog;

export interface InjectedAnomaly {
  id: string;
  personIndex: number;
  indicatorId: IndicatorId;
  truth: TruthClass;
  fromDay: MissionDay;
  toDay: MissionDay;
  /** Detection window, mission minutes (inclusive). */
  startT: MissionMinute;
  endT: MissionMinute;
  magnitudeSd: number;
  /** Signed shift in display units. */
  delta: number;
}

export interface ScenarioInstance {
  typeId: string;
  seed: number;
  people: Array<{ profileId: string; name: string; readings: Reading[] }>;
  cabinEpisodes: CabinEpisodeSpec[];
  anomalies: InjectedAnomaly[];
  samples: CabinSample[];
  /** First and last judged minute. */
  fromT: MissionMinute;
  toT: MissionMinute;
  firstDay: MissionDay;
  lastDay: MissionDay;
  /** First and last affected day, null without anomalies or excursion. */
  onsetDay: MissionDay | null;
  endDay: MissionDay | null;
}

const MINUTES_PER_DAY = 1440;
const SCENARIO_STREAM = 7003;

export const catalogSeeds = (catalog: ScenarioCatalog = CATALOG): number[] =>
  Array.from({ length: catalog.seeds.count }, (_, i) => catalog.seeds.first + i);

const maxLagOf = (indicatorId: IndicatorId): number =>
  Math.max(0, ...cabinKnowledge.links.filter((l) => l.indicatorId === indicatorId).map((l) => l.lagMin));
const MAX_LAG_ALL = Math.max(0, ...cabinKnowledge.links.map((l) => l.lagMin));

function uniformInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** Builds one scenario: crew readings with the anomalies injected, the cabin with the excursion, ground truth. */
export function buildScenario(typeId: string, seed: number, catalog: ScenarioCatalog = CATALOG): ScenarioInstance {
  const typeIndex = catalog.scenarioTypes.findIndex((t) => t.id === typeId);
  if (typeIndex < 0) throw new Error(`Unknown scenario type: ${typeId}`);
  const spec = catalog.scenarioTypes[typeIndex]!;
  const rng = mulberry32(daySeed(daySeed(seed, typeIndex), SCENARIO_STREAM));

  const firstJudgedDay = catalog.firstDay + catalog.warmupDays;
  const lastDay = firstJudgedDay + catalog.judgedDays - 1;
  const onset = firstJudgedDay + uniformInt(rng, catalog.onsetOffsetDays.min, catalog.onsetOffsetDays.max);
  const duration = uniformInt(rng, catalog.durationDays.min, catalog.durationDays.max);
  const endDay = onset + duration - 1;
  const hasEvent = spec.anomalies.length > 0 || spec.cabinExcursion !== null;

  const cabinEpisodes: CabinEpisodeSpec[] = [];
  if (spec.cabinExcursion) {
    const [lo, hi] = spec.cabinExcursion.deltaRange;
    cabinEpisodes.push({
      variable: spec.cabinExcursion.variable,
      fromDay: onset - 1,
      fromHour: catalog.cabinExcursionTiming.startHourPreviousDay,
      toDay: endDay,
      toHour: catalog.cabinExcursionTiming.endHourLastDay,
      delta: lo + rng() * (hi - lo),
    });
  }

  const traits = Array.from({ length: catalog.crewSize }, (_, p) => drawTraits(seed, p));
  const anomalies: InjectedAnomaly[] = [];
  const injections: SimInjection[][] = traits.map(() => []);
  for (const a of spec.anomalies) {
    let affected: number[];
    if (a.affected === 'all') affected = traits.map((_, p) => p);
    else if (a.affected === 'one') affected = [uniformInt(rng, 0, catalog.crewSize - 1)];
    else {
      const left = uniformInt(rng, 0, catalog.crewSize - 1);
      affected = traits.map((_, p) => p).filter((p) => p !== left);
    }
    for (const p of affected) {
      const magnitudeSd = catalog.magnitudeSd.min + rng() * (catalog.magnitudeSd.max - catalog.magnitudeSd.min);
      const delta = (a.direction === 'up' ? 1 : -1) * magnitudeSd * traits[p]!.totalSd[a.indicatorId];
      injections[p]!.push({ indicatorId: a.indicatorId, fromDay: onset, toDay: endDay, delta });
      anomalies.push({
        id: `${typeId}:${seed}:p${p}:${a.indicatorId}`,
        personIndex: p,
        indicatorId: a.indicatorId,
        truth: a.class,
        fromDay: onset,
        toDay: endDay,
        startT: (onset - 1) * MINUTES_PER_DAY,
        endT: endDay * MINUTES_PER_DAY + maxLagOf(a.indicatorId),
        magnitudeSd: Math.round(magnitudeSd * 1000) / 1000,
        delta,
      });
    }
  }

  const people = traits.map((t, p) => ({
    profileId: `sim-${p}`,
    name: `Crew ${p + 1}`,
    readings: generatePersonReadings(seed, t, catalog.firstDay, lastDay, injections[p]),
  }));
  const fromT = (firstJudgedDay - 1) * MINUTES_PER_DAY;
  const toT = lastDay * MINUTES_PER_DAY - 1;
  const samples = createSimulatedCabinTimeline(seed, cabinEpisodes).samples(Math.max(0, fromT - MAX_LAG_ALL), toT);
  return {
    typeId,
    seed,
    people,
    cabinEpisodes,
    anomalies,
    samples,
    fromT,
    toT,
    firstDay: catalog.firstDay,
    lastDay,
    onsetDay: hasEvent ? onset : null,
    endDay: hasEvent ? endDay : null,
  };
}

/** Runs the PRODUCTION attribution analysis (src/core/attribution) with the real config and links. */
export function runEngine(s: ScenarioInstance): AttributedReading[] {
  return analyzeCabinAndCrew({
    members: s.people,
    indicators: knowledge.indicators,
    cabin: cabinKnowledge,
    samples: s.samples,
    fromT: s.fromT,
    toT: s.toT,
  }).findings;
}

/**
 * Verdict reason to class. Every VerdictReason is listed (the Record type forces it). crew-wide-environment-unknown
 * is mapped to shared: the crew moved together and no monitored excursion explains it; the simulator always supplies
 * cabin data, so that reason is expected to occur zero times (the report counts it).
 */
export const REASON_CLASS: Record<VerdictReason, PredictedClass> = {
  'crew-wide-and-linked-excursion': 'environmental',
  'linked-excursion-individual-susceptibility': 'environmental',
  'linked-excursion-crew-unknown': 'environmental',
  'crew-wide-no-monitored-excursion': 'shared',
  'crew-wide-environment-unknown': 'shared',
  'no-external-signal': 'individual',
  'insufficient-baseline': 'undetermined',
  'insufficient-crew-data': 'undetermined',
  'no-environment-data': 'undetermined',
};

export const classOf = (f: AttributedReading): PredictedClass => REASON_CLASS[f.reason];
