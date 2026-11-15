import type { IndicatorId, MissionDay, Reading } from '../../core/health/model';
import type { HistorySource } from '../../core/ports';
import { daySeed, mulberry32 } from './mulberry32';
import persona from './persona.json';

export { mulberry32 } from './mulberry32';
export const PERSONA = persona;
export const FIRST_DAY: MissionDay = persona.firstDay;
export const DEMO_DAY: MissionDay = persona.demoDay;
export const DEMO_CLOCK_START_OFFSET_MIN = 8 * 60;

const MINUTES_PER_DAY = 1440;
/** Order is fixed: it defines both the random draw order and the 06:00-07:12 timestamps. */
const ORDER: readonly IndicatorId[] = [
  'sleepHours',
  'phq2',
  'heartRate',
  'temperature',
  'bpSystolic',
  'bpDiastolic',
  'glucose',
];

function phq2For(day: MissionDay, r: number, r2: number): number {
  const offset = day - persona.scenario.moodDriftFromDay;
  if (offset < 0) return r < 0.2 ? 0 : r < 0.8 ? 1 : 2; // persona mean about 1
  if (offset < 3) return 2;
  if (offset < 5) return r2 < 0.5 ? 2 : 3;
  return 3; // rising scores: higher is worse
}

/** The persona's baseline mood without the late drift. */
function phq2Steady(r: number): number {
  return r < 0.2 ? 0 : r < 0.8 ? 1 : 2;
}

function valuesForDay(seed: number, day: MissionDay, scenario: boolean): Record<IndicatorId, number> {
  const rng = mulberry32(daySeed(seed, day));
  // Draw everything first so the stream never depends on which branch a day takes.
  const d = [rng(), rng(), rng(), rng(), rng(), rng(), rng(), rng()] as const;
  const b = persona.baseline;
  const sleepDrift = scenario && day >= persona.scenario.sleepDriftFromDay;
  const hrDrift = scenario && day >= persona.scenario.heartRateDriftFromDay;
  const span = (r: number, lo: number, hi: number) => lo + Math.floor(r * (hi - lo + 1));
  return {
    sleepHours: sleepDrift
      ? span(d[0], persona.drift.sleepStoredMin, persona.drift.sleepStoredMax)
      : span(d[0], b.sleepStored - b.sleepSpread, b.sleepStored + b.sleepSpread),
    phq2: scenario ? phq2For(day, d[1], d[7]) : phq2Steady(d[1]),
    heartRate: hrDrift
      ? span(d[2], persona.drift.heartRateMin, persona.drift.heartRateMax)
      : span(d[2], b.heartRate - b.heartRateSpread, b.heartRate + b.heartRateSpread),
    temperature: span(d[3], b.temperatureStored - b.temperatureSpread, b.temperatureStored + b.temperatureSpread),
    bpSystolic: span(d[4], b.systolic - b.systolicSpread, b.systolic + b.systolicSpread),
    bpDiastolic: span(d[5], b.diastolic - b.diastolicSpread, b.diastolic + b.diastolicSpread),
    glucose: span(d[6], b.glucose - b.glucoseSpread, b.glucose + b.glucoseSpread),
  };
}

/** Minute (since launch) at which a seeded day's readings are stamped for one indicator: 06:00 to 07:12. */
export function seededMinute(day: MissionDay, indicatorId: IndicatorId): number {
  return (day - 1) * MINUTES_PER_DAY + 6 * 60 + ORDER.indexOf(indicatorId) * 12;
}

/**
 * Deterministic synthetic history for days 121..throughDay. Each day has its own seeded stream, so
 * generate(seed, 151) extends generate(seed, 150) without changing it. Values are integers in stored units.
 * Every reading of day d is stamped before that day's 08:00 clock start.
 */
export function generate(seed: number, throughDay: MissionDay): Reading[] {
  return generateHistory(seed, throughDay, true);
}

/** The same stream without the sleep, mood and heart rate drift: a crew member whose zones stay quiet. */
export function generateCalm(seed: number, throughDay: MissionDay): Reading[] {
  return generateHistory(seed, throughDay, false);
}

function generateHistory(seed: number, throughDay: MissionDay, scenario: boolean): Reading[] {
  const readings: Reading[] = [];
  for (let day = FIRST_DAY; day <= throughDay; day += 1) {
    const values = valuesForDay(seed, day, scenario);
    const groupId = `seed:${day}`;
    for (const indicatorId of ORDER) {
      readings.push({
        id: `seed-${seed}-d${day}-${indicatorId}`,
        indicatorId,
        value: values[indicatorId],
        day,
        t: seededMinute(day, indicatorId),
        source: 'SYNTHETIC',
        context: 'rest',
        symptomatic: false,
        groupId,
      });
    }
  }
  return readings;
}

/** DEMO mode history source. */
export const seededHistory: HistorySource = { generate };

/** DEMO history of a crew member without the drift scenario. */
export const calmHistory: HistorySource = { generate: generateCalm };
