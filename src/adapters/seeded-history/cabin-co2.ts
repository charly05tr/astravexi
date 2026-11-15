import type { Co2Reading } from '../../core/environment/co2';
import type { SimulatedCabinSource } from '../../core/ports';
import { daySeed, mulberry32, randInt } from './mulberry32';

const SLOT_MS = 15 * 60_000;
const SLOTS_PER_DAY = 96;
/** The panel shows the last 48 hours. */
const WINDOW_SLOTS = 2 * SLOTS_PER_DAY;

/** ISS-like baseline (the NASA reference mission sits near 2500 ppm) with a daily cycle and crew activity. */
const BASE_PPM = 2500;
const CYCLE_PPM = 180;

/**
 * One day's random plan, drawn up front so the stream never depends on which branch a slot takes (the same rule
 * the seeded health history follows). Each day has its own stream, so extending the window never changes a past day.
 */
function planFor(seed: number, day: number) {
  const rng = mulberry32(daySeed(seed, day));
  const excursion = rng() < 0.4; // an occasional scrubber or ventilation upset
  return {
    excursion,
    startSlot: randInt(rng, 8, 80),
    lengthSlots: randInt(rng, 6, 12),
    extraPpm: randInt(rng, 1100, 1700),
    exerciseSlot: randInt(rng, 60, 72), // late-afternoon workout
  };
}

function ppmAt(seed: number, slot: number): number {
  const day = Math.floor(slot / SLOTS_PER_DAY);
  const inDay = slot - day * SLOTS_PER_DAY;
  const plan = planFor(seed, day);
  // Sleep shifts: the crew breathes into a smaller air volume overnight, peaking around 04:00.
  const cycle = CYCLE_PPM * Math.cos(((inDay - 16) / SLOTS_PER_DAY) * 2 * Math.PI);
  const exercise = inDay >= plan.exerciseSlot && inDay < plan.exerciseSlot + 4 ? 320 : 0;
  const upset = plan.excursion && inDay >= plan.startSlot && inDay < plan.startSlot + plan.lengthSlots ? plan.extraPpm : 0;
  const noise = (mulberry32(daySeed(seed, slot + 1_000_003))() - 0.5) * 120;
  return Math.round(BASE_PPM + cycle + exercise + upset + noise);
}

/**
 * Deterministic synthetic cabin CO2 of the demo ship. The same seed and instant always give the same samples,
 * and `recent(now)` is a window over one endless series, so nothing needs persisting.
 */
export function createSimulatedCabinCo2(seed: number): SimulatedCabinSource {
  return {
    recent(nowIso) {
      const last = Math.floor(Date.parse(nowIso) / SLOT_MS);
      const readings: Co2Reading[] = [];
      for (let slot = last - WINDOW_SLOTS + 1; slot <= last; slot += 1) {
        readings.push({ t: new Date(slot * SLOT_MS).toISOString(), ppm: ppmAt(seed, slot) });
      }
      return readings;
    },
  };
}

