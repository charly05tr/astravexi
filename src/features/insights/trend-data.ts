import type { AsOf, Indicator, MissionDay, Reading, ReadingSource } from '../../core/health/model';
import { computeBaseline } from '../../core/health/baselines';
import { buildDailySeries, prepareReadings, valuesInRange } from '../../core/health/series';
import { statToDisplay, storedToDisplay } from '../../core/health/tiers';

export interface TrendPoint {
  day: MissionDay;
  /** Display units. */
  value: number;
  source: ReadingSource;
}

export interface Trend {
  points: TrendPoint[];
  /** Personal baseline median in display units, once the baseline is ready. */
  baseline: number | null;
}

export const TREND_DAYS = 30;

/** Daily series (rest only, MANUAL over SYNTHETIC) of the last `days` days, with the lagged baseline. */
export function buildTrend(
  readings: readonly Reading[],
  indicator: Indicator,
  asOf: AsOf,
  days: number = TREND_DAYS,
): Trend {
  const prepared = prepareReadings(readings, asOf);
  const series = buildDailySeries(prepared, [indicator]).get(indicator.id) ?? [];
  const points = valuesInRange(series, asOf.day - days + 1, asOf.day).map<TrendPoint>((v) => ({
    day: v.day,
    value: storedToDisplay(v.value, indicator),
    source: v.source,
  }));
  let baseline: number | null = null;
  if (indicator.baseline) {
    const b = computeBaseline(indicator.id, series, indicator.baseline, asOf.day);
    if (b.status === 'ready') baseline = statToDisplay(b.median, indicator);
  }
  return { points, baseline };
}
