import type { Indicator, IndicatorId, MissionDay, Reading } from '../../core/health/model';
import { knowledge } from '../../knowledge';
import paramsJson from '../../knowledge/health-sim-params.json';
import { seededMinute } from '../seeded-history';
import { daySeed, mulberry32 } from '../seeded-history/mulberry32';

/**
 * Synthetic crew health generator (v2). DEMO and evaluation only: it never reads or changes the demo personas,
 * the seeded histories or the goldens. Deterministic: the same (seed, person, day) always gives the same reading,
 * and generating through a later day never changes an earlier one.
 *
 * Per person and indicator: baseline level ~ N(mean, betweenSd); a personal day-to-day SD scale (lognormal); an
 * AR(1) day-to-day process; independent measurement noise; and, for body temperature, a circadian component
 * evaluated at the reading's clock time. Readings follow the app's schedule (seededMinute, one block per day in
 * the early morning) plus a day-level time jitter. Every parameter is in health-sim-params.json with a source or
 * an explicit assumption flag.
 */

export interface SimParam {
  value: number;
  source: string | null;
  assumption: boolean;
  note?: string;
  citationChecked?: boolean;
}
export interface SimIndicatorParams {
  unit: string;
  baselineMean: SimParam;
  baselineBetweenSd: SimParam;
  withinSd: SimParam;
  ar1: SimParam;
  measurementSd: SimParam;
  circadian?: { amplitude: SimParam; peakHour: SimParam; referenceHour: SimParam };
}
export interface HealthSimParams {
  schemaVersion: number;
  global: {
    withinSdLogScaleSd: SimParam;
    readingTimeJitterSdMin: SimParam;
    readingTimeJitterClampMin: SimParam;
    bpCorrelation: SimParam;
  };
  indicators: Record<IndicatorId, SimIndicatorParams>;
}
export const HEALTH_SIM_PARAMS = paramsJson as unknown as HealthSimParams;

/** Fixed order: it defines the draw order and the reading timestamps (same as the seeded histories). */
export const SIM_INDICATORS: readonly IndicatorId[] = [
  'sleepHours',
  'phq2',
  'heartRate',
  'temperature',
  'bpSystolic',
  'bpDiastolic',
  'glucose',
];

const MINUTES_PER_DAY = 1440;
const INDICATOR_BY_ID = new Map<IndicatorId, Indicator>(knowledge.indicators.map((i) => [i.id, i]));

export interface PersonTraits {
  person: number;
  /** Display units. */
  baseline: Record<IndicatorId, number>;
  /** Total day-to-day SD of the person for the indicator (process + measurement), display units. */
  totalSd: Record<IndicatorId, number>;
  /** Process SD of the person, display units. */
  processSd: Record<IndicatorId, number>;
}

/** An additive shift in display units on the readings of [fromDay, toDay]. */
export interface SimInjection {
  indicatorId: IndicatorId;
  fromDay: MissionDay;
  toDay: MissionDay;
  delta: number;
}

function streamRng(seed: number, a: number, b: number): () => number {
  return mulberry32(daySeed(daySeed(seed, a), b));
}

/** Standard normal from two uniforms (Box-Muller). Always consumes exactly two draws. */
function normal(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

const TRAITS_STREAM = 7001;
const DAYS_STREAM = 7002;

/** Draws the person's traits from the population distributions. */
export function drawTraits(seed: number, person: number, params: HealthSimParams = HEALTH_SIM_PARAMS): PersonTraits {
  const rng = streamRng(seed, person, TRAITS_STREAM);
  const baseline = {} as Record<IndicatorId, number>;
  const totalSd = {} as Record<IndicatorId, number>;
  const processSd = {} as Record<IndicatorId, number>;
  for (const id of SIM_INDICATORS) {
    const p = params.indicators[id];
    baseline[id] = p.baselineMean.value + p.baselineBetweenSd.value * normal(rng);
    const scale = Math.exp(params.global.withinSdLogScaleSd.value * normal(rng));
    processSd[id] = p.withinSd.value * scale;
    totalSd[id] = Math.sqrt(processSd[id] ** 2 + p.measurementSd.value ** 2);
  }
  return { person, baseline, totalSd, processSd };
}

function circadianShift(p: SimIndicatorParams, hour: number): number {
  if (!p.circadian) return 0;
  const { amplitude, peakHour, referenceHour } = p.circadian;
  const at = (h: number) => amplitude.value * Math.cos((2 * Math.PI * (h - peakHour.value)) / 24);
  return at(hour) - at(referenceHour.value);
}

/** The reading values in stored units: rounded to the indicator's storage resolution and clamped to its range. */
function toStoredValue(id: IndicatorId, display: number): number {
  const ind = INDICATOR_BY_ID.get(id)!;
  const clamped = Math.min(ind.max, Math.max(ind.min, display));
  return Math.round(clamped * ind.unitScale);
}

/** Readings of one person for days firstDay..lastDay, with any injected shifts. Stored units, SYNTHETIC. */
export function generatePersonReadings(
  seed: number,
  traits: PersonTraits,
  firstDay: MissionDay,
  lastDay: MissionDay,
  injections: readonly SimInjection[] = [],
  params: HealthSimParams = HEALTH_SIM_PARAMS,
): Reading[] {
  const rng = streamRng(seed, traits.person, DAYS_STREAM);
  const phi = (id: IndicatorId) => params.indicators[id].ar1.value;
  const state = {} as Record<IndicatorId, number>;
  for (const id of SIM_INDICATORS) state[id] = traits.processSd[id] * normal(rng);
  const rho = params.global.bpCorrelation.value;
  const jitterSd = params.global.readingTimeJitterSdMin.value;
  const jitterMax = params.global.readingTimeJitterClampMin.value;

  const readings: Reading[] = [];
  for (let day = firstDay; day <= lastDay; day += 1) {
    const jitter = Math.round(Math.max(-jitterMax, Math.min(jitterMax, jitterSd * normal(rng))));
    const innovation = {} as Record<IndicatorId, number>;
    const meas = {} as Record<IndicatorId, number>;
    for (const id of SIM_INDICATORS) {
      innovation[id] = normal(rng);
      meas[id] = normal(rng);
    }
    innovation.bpDiastolic = rho * innovation.bpSystolic + Math.sqrt(1 - rho * rho) * innovation.bpDiastolic;
    for (const id of SIM_INDICATORS) {
      const p = params.indicators[id];
      state[id] = phi(id) * state[id] + Math.sqrt(1 - phi(id) ** 2) * traits.processSd[id] * innovation[id];
      const t = seededMinute(day, id) + jitter;
      const hour = (t % MINUTES_PER_DAY) / 60;
      const injected = injections
        .filter((j) => j.indicatorId === id && day >= j.fromDay && day <= j.toDay)
        .reduce((sum, j) => sum + j.delta, 0);
      const display = traits.baseline[id] + circadianShift(p, hour) + state[id] + p.measurementSd.value * meas[id] + injected;
      readings.push({
        id: `sim-${seed}-p${traits.person}-d${day}-${id}`,
        indicatorId: id,
        value: toStoredValue(id, display),
        day,
        t,
        source: 'SYNTHETIC',
        context: 'rest',
        symptomatic: false,
        groupId: `sim:${traits.person}:${day}`,
      });
    }
  }
  return readings;
}
