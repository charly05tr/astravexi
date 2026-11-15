import { buildFeatures, FEATURE_NAMES, MIN_HISTORY } from './feature-builder';
import { predictRidge } from './ridge';
import { SLOT_MIN } from './types';
import type { ForecastVariable, HorizonH } from './types';

export interface ErrorMetrics {
  mae: number;
  rmse: number;
}

/** Leave-mission-out test metrics of one (variable, horizon), for the model and both baselines. */
export interface HorizonMetrics {
  n: number;
  testMissions: string[];
  model: ErrorMetrics;
  persistence: ErrorMetrics;
  seasonalNaive: ErrorMetrics;
  missionsBeatingBoth: number;
  foldLambdas: number[];
}

export interface HorizonModel {
  horizonH: HorizonH;
  /** True only when the test MAE of the model beats BOTH baselines. A disabled horizon is never shown. */
  enabled: boolean;
  lambda: number;
  /** Model of the change from now: forecast = value now + intercept + coefficients . features. */
  coefficients: number[];
  intercept: number;
  metrics: HorizonMetrics;
  /** Quantiles of (actual - predicted) on held-out missions: the 80% prediction interval is forecast + q10 .. forecast + q90. */
  interval: { q10: number; q90: number };
  /** Why the horizon is disabled, in plain words. Absent when enabled. */
  disabledReason?: string;
}

export interface MissionRange {
  mission: string;
  firstDay: string;
  lastDay: string;
  days: number;
}

export interface VariableProvenance {
  sourceField: string;
  unit: string;
  unitNote: string;
  missions: MissionRange[];
  /** Days on the 15-minute grid after cleaning. */
  days: number;
  rawRows: number;
  cleanRows: number;
  cleaningRules: string;
}

export interface ForecastModelArtifact {
  schemaVersion: 1;
  provenance: {
    source: string;
    sourceUrl: string;
    fetchedAt: string;
    generatedOn: string;
    gridMinutes: number;
    resampling: string;
    evaluation: string;
    gate: string;
    variables: Record<ForecastVariable, VariableProvenance>;
    radiation: string;
  };
  featureSpec: {
    slotMinutes: number;
    minHistorySlots: number;
    featureNames: string[];
    target: string;
  };
  variables: Record<ForecastVariable, { horizons: HorizonModel[] }>;
}

/** A recent observation on the 15-minute grid: minutes on the mission clock and the value. */
export interface TimedValue {
  t: number;
  value: number;
}

export interface ForecastPoint {
  variable: ForecastVariable;
  horizonH: HorizonH;
  value: number;
  /** Lower and upper bound of the 80% prediction interval. */
  low: number;
  high: number;
}

/** The trailing run of the series whose samples are exactly one slot apart. */
export function trailingContiguous(series: readonly TimedValue[]): TimedValue[] {
  let start = series.length - 1;
  while (start > 0 && series[start]!.t - series[start - 1]!.t === SLOT_MIN) start -= 1;
  return start < 0 ? [] : series.slice(start);
}

/**
 * Forecasts every ENABLED horizon of one variable from its recent series (oldest first, 15-minute grid, last sample is
 * now). Pure. Returns an empty list when the model has no enabled horizon or the series is too short or has a gap in
 * its latest stretch: it never invents a value from missing data.
 */
export function forecastVariable(artifact: ForecastModelArtifact, variable: ForecastVariable, series: readonly TimedValue[]): ForecastPoint[] {
  const recent = trailingContiguous(series);
  if (recent.length < MIN_HISTORY) return [];
  const now = recent[recent.length - 1]!;
  const features = buildFeatures(
    recent.map((s) => s.value),
    now.t / SLOT_MIN,
  );
  if (!features) return [];
  const out: ForecastPoint[] = [];
  for (const h of artifact.variables[variable].horizons) {
    if (!h.enabled || h.coefficients.length !== FEATURE_NAMES.length) continue;
    const value = now.value + predictRidge({ coefficients: h.coefficients, intercept: h.intercept }, features);
    out.push({ variable, horizonH: h.horizonH, value, low: value + h.interval.q10, high: value + h.interval.q90 });
  }
  return out;
}
