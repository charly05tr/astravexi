import { SLOTS_PER_DAY } from './types';

/**
 * THE feature builder, used by the training script and by in-app inference, so the model never sees a feature at
 * serving time that was built differently from training (no train/serve skew).
 *
 * `history` ends at the forecast origin (its last element is "now") on the 15-minute grid. `originSlot` is the
 * absolute slot index of that last element (slot 0 of a day is midnight). Features, in order:
 *   0      the current value
 *   1..L   value[now - k] - value[now] for each lag k in LAGS (slots)
 *   L+1    slope: least-squares slope over the last SLOPE_SLOTS points, in units per hour
 *   L+2,3  sin and cos of the time of day at the origin
 */
export const LAGS = [1, 2, 3, 4, 6, 8, 12] as const;
export const SLOPE_SLOTS = 8;
/** Slots of history the builder needs. */
export const MIN_HISTORY = Math.max(...LAGS, SLOPE_SLOTS - 1) + 1;
export const FEATURE_NAMES: readonly string[] = [
  'value',
  ...LAGS.map((k) => `delta_lag_${k * 15}min`),
  'slope_per_hour',
  'time_of_day_sin',
  'time_of_day_cos',
];

export function buildFeatures(history: readonly number[], originSlot: number): number[] | null {
  if (history.length < MIN_HISTORY) return null;
  const n = history.length;
  const now = history[n - 1]!;
  const out: number[] = [now];
  for (const k of LAGS) out.push(history[n - 1 - k]! - now);
  // Least-squares slope over the last SLOPE_SLOTS points, x = 0..SLOPE_SLOTS-1 (15-minute steps), per hour.
  const m = SLOPE_SLOTS;
  const xMean = (m - 1) / 2;
  let sxy = 0;
  let sxx = 0;
  let yMean = 0;
  for (let i = 0; i < m; i += 1) yMean += history[n - m + i]! / m;
  for (let i = 0; i < m; i += 1) {
    sxy += (i - xMean) * (history[n - m + i]! - yMean);
    sxx += (i - xMean) ** 2;
  }
  out.push((sxy / sxx) * 4);
  const phase = (((originSlot % SLOTS_PER_DAY) + SLOTS_PER_DAY) % SLOTS_PER_DAY) / SLOTS_PER_DAY;
  out.push(Math.sin(2 * Math.PI * phase), Math.cos(2 * Math.PI * phase));
  return out;
}
