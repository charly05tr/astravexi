import type { AttributionConfig } from './model';

/** A reading in display units at a mission minute. */
export interface SeriesPoint {
  t: number;
  value: number;
}

export type PersonalDeviation =
  | { status: 'insufficient-baseline'; n: number; required: number }
  | {
      status: 'typical' | 'outlier';
      value: number;
      /** Robust z: (value - median) / max(1.4826 x MAD, floor). */
      z: number;
      direction: 'above' | 'below' | 'none';
      median: number;
      scale: number;
      n: number;
    };

/** Makes the MAD comparable with a standard deviation for roughly normal data. */
export const MAD_TO_SIGMA = 1.4826;

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Compares one reading with the same person's OWN prior readings of the same indicator (strictly earlier, within
 * the baseline window), using the median and the MAD, which a few earlier outliers cannot drag. The reading itself
 * is never part of its baseline. With fewer prior readings than the minimum there is no verdict: never a guess.
 */
export function assessPersonalDeviation(
  history: readonly SeriesPoint[],
  reading: SeriesPoint,
  config: Pick<AttributionConfig, 'minBaselineReadings' | 'outlierZ' | 'baselineWindowMin'>,
  spreadFloor: number,
): PersonalDeviation {
  const prior = history.filter((p) => p.t < reading.t && p.t >= reading.t - config.baselineWindowMin).map((p) => p.value);
  if (prior.length < config.minBaselineReadings) {
    return { status: 'insufficient-baseline', n: prior.length, required: config.minBaselineReadings };
  }
  const med = median(prior);
  const mad = median(prior.map((v) => Math.abs(v - med)));
  const scale = Math.max(MAD_TO_SIGMA * mad, spreadFloor);
  const z = (reading.value - med) / scale;
  const direction = z > 0 ? 'above' : z < 0 ? 'below' : 'none';
  return {
    status: Math.abs(z) >= config.outlierZ ? 'outlier' : 'typical',
    value: reading.value,
    z,
    direction,
    median: med,
    scale,
    n: prior.length,
  };
}
