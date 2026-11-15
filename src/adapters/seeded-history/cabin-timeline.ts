import type { CabinSample, CabinVariableId } from '../../core/attribution/model';
import type { MissionMinute } from '../../core/health/model';
import type { HistorySource, SimulatedCabinTimeline } from '../../core/ports';
import scenario from './cabin-scenario.json';
import { daySeed, mulberry32 } from './mulberry32';

const SLOT_MIN = 15;
const SLOTS_PER_DAY = 96;
const MINUTES_PER_DAY = 1440;

const noiseAt = (seed: number, slot: number, stream: number) => mulberry32(daySeed(seed, slot + stream))() - 0.5;
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Nominal values of the demo ship, the single source of every simulated cabin value (the CO2 panel and the cabin variables read it): a baseline, a daily cycle,
 * a late-afternoon workout and seeded noise per 15-minute slot. Nominal values stay inside the NASA operating AND
 * comfort ranges, so a limit is only crossed by a scripted episode (see cabin-scenario.json).
 */
function nominal(seed: number, slot: number): Record<Exclude<CabinVariableId, 'radiationDose'>, number> {
  const inDay = slot % SLOTS_PER_DAY;
  const day = (frac: number) => Math.cos(((inDay - frac) / SLOTS_PER_DAY) * 2 * Math.PI);
  const exercise = inDay >= 68 && inDay < 72 ? 320 : 0;
  return {
    // The crew breathes into a smaller air volume overnight: CO2 peaks around 04:00.
    co2: Math.round(2500 + 180 * day(16) + exercise + noiseAt(seed, slot, 1_000_003) * 120),
    cabinTemperature: round1(22.5 + 0.8 * day(60) + noiseAt(seed, slot, 2_000_003) * 0.4),
    humidity: round1(45 + 4 * day(20) + noiseAt(seed, slot, 3_000_003) * 2),
  };
}

type CabinEpisode = (typeof scenario.cabinEpisodes)[number];
const minuteOf = (day: number, hour: number) => (day - 1) * MINUTES_PER_DAY + hour * 60;

function episodeDelta(variable: CabinVariableId, t: MissionMinute): number {
  let delta = 0;
  for (const ep of scenario.cabinEpisodes as readonly CabinEpisode[]) {
    if (ep.variable === variable && t >= minuteOf(ep.fromDay, ep.fromHour) && t < minuteOf(ep.toDay, ep.toHour)) delta += ep.delta;
  }
  return delta;
}

/**
 * Deterministic synthetic cabin of the demo ship in MISSION time, the axis the crew readings use. The same seed and
 * minute always give the same sample, so nothing needs persisting. DEMO only.
 */
export function createSimulatedCabinTimeline(seed: number): SimulatedCabinTimeline {
  return {
    samples(fromMinute, toMinute) {
      const samples: CabinSample[] = [];
      for (let slot = Math.max(0, Math.floor(fromMinute / SLOT_MIN)); slot * SLOT_MIN <= toMinute; slot += 1) {
        const t = slot * SLOT_MIN;
        const base = nominal(seed, slot);
        samples.push({
          t,
          values: {
            co2: Math.round(base.co2 + episodeDelta('co2', t)),
            cabinTemperature: round1(base.cabinTemperature + episodeDelta('cabinTemperature', t)),
            humidity: round1(base.humidity + episodeDelta('humidity', t)),
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
