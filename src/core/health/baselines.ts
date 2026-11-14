import type { BaselineConfig, IndicatorId, MissionDay, PersonalBaseline } from './model';
import { roundHalfAway, STAT_SCALE } from './rounding';
import type { DailyValue } from './series';
import { valuesInRange } from './series';

/** Evaluation window P: the m days ending on the as-of day. */
export function evaluationWindow(asOfDay: MissionDay, cfg: BaselineConfig): [MissionDay, MissionDay] {
  return [asOfDay - cfg.evalWindowDays + 1, asOfDay];
}

/** Baseline window B: the W days immediately BEFORE P. P and B never overlap. */
export function baselineWindow(asOfDay: MissionDay, cfg: BaselineConfig): [MissionDay, MissionDay] {
  return [asOfDay - cfg.evalWindowDays - cfg.windowDays + 1, asOfDay - cfg.evalWindowDays];
}

function medianOfSorted(sorted: readonly number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Median of stored values, returned in stat units (integer). */
export function medianStat(values: readonly number[]): number {
  const sorted = values.map((v) => v * STAT_SCALE).sort((a, b) => a - b);
  return roundHalfAway(medianOfSorted(sorted));
}

/**
 * Lagged personal baseline for one indicator at an as-of day. Statistics are integers in stat units.
 * `status` is 'ready' once the baseline window holds at least `minDays` daily values.
 */
export function computeBaseline(
  indicatorId: IndicatorId,
  series: readonly DailyValue[],
  cfg: BaselineConfig,
  asOfDay: MissionDay,
): PersonalBaseline {
  const [fromDay, toDay] = baselineWindow(asOfDay, cfg);
  const values = valuesInRange(series, fromDay, toDay).map((v) => v.value);
  const n = values.length;
  const status = n >= cfg.minDays && n > 0 ? 'ready' : 'building';
  if (n === 0) {
    return { indicatorId, median: 0, mad: 0, mean: 0, sd: 0, n, fromDay, toDay, status: 'building' };
  }
  const median = medianStat(values);
  const mad = roundHalfAway(
    medianOfSorted(values.map((v) => Math.abs(v * STAT_SCALE - median)).sort((a, b) => a - b)),
  );
  const sum = values.reduce((s, v) => s + v, 0);
  const meanExact = (sum * STAT_SCALE) / n;
  const mean = roundHalfAway(meanExact);
  const variance =
    n > 1 ? values.reduce((s, v) => s + (v * STAT_SCALE - meanExact) ** 2, 0) / (n - 1) : 0;
  const sd = roundHalfAway(Math.sqrt(variance));
  return { indicatorId, median, mad, mean, sd, n, fromDay, toDay, status };
}
