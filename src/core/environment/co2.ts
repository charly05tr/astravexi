import type { ZoneStatus } from '../health/model';

/** Standard atmosphere in mmHg: ppm = mmHg / 760 * 1e6. */
const MMHG_PER_ATM = 760;
export const ppmToMmHg = (ppm: number): number => (ppm / 1_000_000) * MMHG_PER_ATM;
export const mmHgToPpm = (mmHg: number): number => (mmHg / MMHG_PER_ATM) * 1_000_000;

/** One cabin CO2 sample. `t` is an ISO instant, `ppm` is the volume fraction in parts per million. */
export interface Co2Reading {
  t: string;
  ppm: number;
}

/** Where a limit or a reference comes from, in the same shape as the knowledge rules' `source`. */
export interface Co2Source {
  label: string;
  url: string;
  kind: 'primary' | 'secondary';
}

/**
 * Fixed operational limits on the cabin CO2 partial pressure, carried like a knowledge rule: value, source and a
 * verification flag.
 * - attention: NASA-STD-3001 Vol. 2 limits the 1-hour average ppCO2 of the habitable volume to 3 mmHg
 *   (https://www.nasa.gov/ochmo-tb-004-carbon-dioxide-2/). Earlier requirements accepted 3.8 to 7.5 mmHg.
 * - high: 5.3 mmHg, the long-duration (180-day) Spacecraft Maximum Allowable Concentration that preceded it
 *   (NASA technical report, https://ntrs.nasa.gov/citations/20100036637).
 * Both are flagged `needsVerification`: the standard has revisions (C and D are both cited) and these values were
 * read from NASA summaries, not from the standard itself.
 */
export const CO2_OPS_LIMITS = {
  attention: {
    mmHg: 3.0,
    ppm: mmHgToPpm(3.0),
    source: { label: 'NASA-STD-3001 Vol. 2, CO2 technical brief (OCHMO-TB-004)', url: 'https://www.nasa.gov/ochmo-tb-004-carbon-dioxide-2/', kind: 'primary' } as Co2Source,
    needsVerification: true,
  },
  high: {
    mmHg: 5.3,
    ppm: mmHgToPpm(5.3),
    source: { label: 'NASA 180-day SMAC for CO2 (legacy long-duration limit)', url: 'https://ntrs.nasa.gov/citations/20100036637', kind: 'primary' } as Co2Source,
    needsVerification: true,
  },
} as const;

/** Readings outside this range are sensor gaps or placeholders, not air: ambient Earth air is about 420 ppm. */
export const PLAUSIBLE_CO2_PPM = { min: 350, max: 10_000 } as const;

/** Summary of the NASA ISS mission telemetry used as the reference for the simulated cabin. */
export interface Co2Reference {
  mission: string;
  /** First and last valid sample of the series, ISO instants. */
  from: string;
  to: string;
  count: number;
  meanPpm: number;
  medianPpm: number;
  maxPpm: number;
  /**
   * The comparison threshold: the 95th percentile of the mission's ISS cabin CO2. A percentile, not the maximum,
   * because one sensor spike would set the maximum; the p95 is the level the real station stayed under 95% of
   * the time, so exceeding it means "higher than the ISS typically ran".
   */
  thresholdPpm: number;
  /** Where the series was read from. */
  sourceUrl: string;
}

/** Nearest-rank percentile of an ascending-sorted array. `q` in (0, 1]. */
export function percentile(sorted: readonly number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]!;
}

/** An ISO instant such as 2019-12-03T10:24:00Z. Core has no clock: it only checks the shape, and ISO UTC sorts as text. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Keeps the physically plausible samples, in time order. */
export function cleanReadings(readings: readonly Co2Reading[]): Co2Reading[] {
  return readings
    .filter((r) => Number.isFinite(r.ppm) && r.ppm >= PLAUSIBLE_CO2_PPM.min && r.ppm <= PLAUSIBLE_CO2_PPM.max && ISO_INSTANT.test(r.t))
    .sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
}

/** Summarises a mission series. Null when no plausible sample remains. */
export function summarizeReference(mission: string, sourceUrl: string, readings: readonly Co2Reading[]): Co2Reference | null {
  const clean = cleanReadings(readings);
  if (clean.length === 0) return null;
  const sorted = clean.map((r) => r.ppm).sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    mission,
    from: clean[0]!.t,
    to: clean[clean.length - 1]!.t,
    count: clean.length,
    meanPpm: Math.round(sum / sorted.length),
    medianPpm: percentile(sorted, 0.5),
    maxPpm: sorted[sorted.length - 1]!,
    thresholdPpm: percentile(sorted, 0.95),
    sourceUrl,
  };
}

export type ThresholdPosition = 'below' | 'at' | 'above';

export interface Co2Assessment {
  valuePpm: number;
  valueMmHg: number;
  thresholdPpm: number;
  /** `valuePpm - thresholdPpm`. */
  deltaPpm: number;
  position: ThresholdPosition;
  /** Existing status vocabulary, see `assessCo2`. */
  status: ZoneStatus;
}

/** Within this many ppm of the threshold counts as "at" it (sensor resolution on the ISS is about 10 ppm). */
export const AT_THRESHOLD_PPM = 50;

/**
 * Compares one cabin value with the reference threshold and the fixed ops limits. The status is the most severe of:
 * above the reference threshold = notice; at or above the attention ops limit = caution; at or above the high ops
 * limit = warning; otherwise none.
 */
export function assessCo2(valuePpm: number, thresholdPpm: number): Co2Assessment {
  const deltaPpm = Math.round(valuePpm - thresholdPpm);
  const position: ThresholdPosition = Math.abs(deltaPpm) <= AT_THRESHOLD_PPM ? 'at' : deltaPpm > 0 ? 'above' : 'below';
  let status: ZoneStatus = 'none';
  if (position === 'above') status = 'notice';
  if (valuePpm >= CO2_OPS_LIMITS.attention.ppm) status = 'caution';
  if (valuePpm >= CO2_OPS_LIMITS.high.ppm) status = 'warning';
  return { valuePpm, valueMmHg: ppmToMmHg(valuePpm), thresholdPpm, deltaPpm, position, status };
}
