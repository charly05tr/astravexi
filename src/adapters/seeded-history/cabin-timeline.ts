import type { CabinSample, CabinVariableId } from '../../core/attribution/model';
import type { MissionMinute } from '../../core/health/model';
import type { HistorySource, SimulatedCabinTimeline } from '../../core/ports';
import { cycleAt } from '../../core/calibration/fit';
import type { HarmonicFit } from '../../core/calibration/fit';
import { cabinKnowledge } from '../../knowledge';
import calibrationJson from '../../knowledge/cabin-calibration.json';
import scenario from './cabin-scenario.json';
import { daySeed, mulberry32 } from './mulberry32';

const calibration = calibrationJson;

const SLOT_MIN = 15;
const SLOTS_PER_DAY = 96;
const MINUTES_PER_DAY = 1440;
/** Longest memory of the AR(1) noise, in slots (5 days): the weights beyond it are below 2% for the fitted coefficients. */
const NOISE_MEMORY_SLOTS = 480;

type SimVariable = Exclude<CabinVariableId, 'radiationDose'>;
const SIM_VARIABLES: readonly SimVariable[] = ['co2', 'cabinTemperature', 'humidity'];
/** Distinct deterministic streams, one per variable. */
const STREAM: Record<SimVariable, number> = { co2: 1_000_003, cabinTemperature: 2_000_003, humidity: 3_000_003 };
const round1 = (n: number) => Math.round(n * 10) / 10;

/** A standard normal draw that depends only on (seed, slot, stream): Box-Muller on two seeded uniforms. */
function innovation(seed: number, slot: number, stream: number): number {
  const rng = mulberry32(daySeed(seed, slot + stream));
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * The calibration of the nominal cabin comes from real ISS telemetry (NASA OSDR EDA, see cabin-calibration.json):
 * the level of a typical mission, the first two daily harmonics, and AR(1) noise with the fitted residual sd and
 * 15-minute autocorrelation. The noise at a slot is a seeded, truncated moving average of past innovations, so a value
 * depends only on (seed, slot): it is deterministic, needs no stored state, and extends without changing the past.
 * Nominal values are then kept inside the plausible range of a typical mission and inside the NASA operating range
 * (with a 1% margin at the limit), so that a limit is only crossed by a scripted episode (see cabin-scenario.json).
 * Real ISS data does cross these limits at times (see excursions and limits in the calibration file); the demo keeps
 * them for the scripted episodes so each attribution verdict stays reproducible.
 */
function createNominal(seed: number) {
  const cache = new Map<number, number>();
  const params = SIM_VARIABLES.map((variable) => {
    const cal = calibration.variables[variable];
    const phi = cal.noise.ar1;
    let norm = 0;
    const weights = Array.from({ length: NOISE_MEMORY_SLOTS }, (_, j) => {
      const w = phi ** j;
      norm += w * w;
      return w;
    });
    const op = cabinKnowledge.variables.find((v) => v.id === variable)?.operating ?? null;
    const low = Math.max(cal.bounds.low, op?.min !== undefined ? op.min + 0.01 * Math.abs(op.min) : -Infinity);
    const high = Math.min(cal.bounds.high, op?.max !== undefined ? op.max - 0.01 * Math.abs(op.max) : Infinity);
    return { variable, cal, weights: weights.map((w) => w / Math.sqrt(norm)), low, high };
  });
  const noiseAt = (variable: SimVariable, slot: number, weights: readonly number[], sd: number): number => {
    const key = slot * 4 + SIM_VARIABLES.indexOf(variable);
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    let sum = 0;
    for (let j = 0; j < weights.length; j += 1) sum += weights[j]! * innovation(seed, slot - j, STREAM[variable]);
    const value = sum * sd;
    cache.set(key, value);
    return value;
  };
  return (slot: number): Record<SimVariable, number> => {
    const inDay = ((slot % SLOTS_PER_DAY) + SLOTS_PER_DAY) % SLOTS_PER_DAY;
    const out = {} as Record<SimVariable, number>;
    for (const p of params) {
      const raw = p.cal.level + cycleAt(p.cal.cycle as HarmonicFit[], inDay) + noiseAt(p.variable, slot, p.weights, p.cal.noise.sd);
      out[p.variable] = Math.min(p.high, Math.max(p.low, raw));
    }
    return out;
  };
}

const nominalBySeed = new Map<number, ReturnType<typeof createNominal>>();
/** The nominal cabin is a pure function of the seed, so one instance (and its noise cache) is shared per seed. */
function nominalFor(seed: number): ReturnType<typeof createNominal> {
  let hit = nominalBySeed.get(seed);
  if (!hit) {
    hit = createNominal(seed);
    nominalBySeed.set(seed, hit);
  }
  return hit;
}

/** A scripted cabin excursion: `delta` is added to the nominal value from (fromDay, fromHour) up to (toDay, toHour). */
export interface CabinEpisodeSpec {
  variable: CabinVariableId;
  fromDay: number;
  fromHour: number;
  toDay: number;
  toHour: number;
  delta: number;
}
type CabinEpisode = CabinEpisodeSpec;
const minuteOf = (day: number, hour: number) => (day - 1) * MINUTES_PER_DAY + hour * 60;

function episodeDelta(episodes: readonly CabinEpisode[], variable: CabinVariableId, t: MissionMinute): number {
  let delta = 0;
  for (const ep of episodes) {
    if (ep.variable === variable && t >= minuteOf(ep.fromDay, ep.fromHour) && t < minuteOf(ep.toDay, ep.toHour)) delta += ep.delta;
  }
  return delta;
}

/**
 * Deterministic synthetic cabin of the demo ship in MISSION time, the axis the crew readings use. The same seed and
 * minute always give the same sample, so nothing needs persisting. DEMO only.
 */
export function createSimulatedCabinTimeline(
  seed: number,
  episodes: readonly CabinEpisodeSpec[] = scenario.cabinEpisodes as readonly CabinEpisodeSpec[],
): SimulatedCabinTimeline {
  const nominal = nominalFor(seed);
  return {
    samples(fromMinute, toMinute) {
      const samples: CabinSample[] = [];
      for (let slot = Math.max(0, Math.floor(fromMinute / SLOT_MIN)); slot * SLOT_MIN <= toMinute; slot += 1) {
        const t = slot * SLOT_MIN;
        const base = nominal(slot);
        samples.push({
          t,
          values: {
            co2: Math.round(base.co2 + episodeDelta(episodes, 'co2', t)),
            cabinTemperature: round1(base.cabinTemperature + episodeDelta(episodes, 'cabinTemperature', t)),
            humidity: round1(base.humidity + episodeDelta(episodes, 'humidity', t)),
            // Running mission total at a fixed illustrative rate: context only.
            radiationDose: Math.round((t / MINUTES_PER_DAY) * scenario.radiationRateMsvPerDay * 100) / 100,
          },
        });
      }
      return samples;
    },
  };
}

/**
 * Adds the scripted reading episodes (a heat-driven heart rate rise, an isolated spike, shared and individual sleep
 * loss) on top of a seeded history. The base history is not touched, so its own tests and goldens stay valid.
 */
export function withScenarioEpisodes(base: HistorySource): HistorySource {
  return {
    generate(seed, throughDay) {
      return base.generate(seed, throughDay).map((r) => {
        const delta = scenario.readingEpisodes
          .filter((e) => e.day === r.day && e.indicatorId === r.indicatorId && e.seeds.includes(seed))
          .reduce((sum, e) => sum + e.delta, 0);
        return delta === 0 ? r : { ...r, value: r.value + delta };
      });
    },
  };
}
