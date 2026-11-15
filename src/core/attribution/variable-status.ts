import type { ZoneStatus } from '../health/model';
import type { CabinSample, CabinVariableDef, CabinVariableId, Range } from './model';

const outside = (v: number, r: Range | null): boolean => r !== null && ((r.max !== undefined && v > r.max) || (r.min !== undefined && v < r.min));

/**
 * Where a cabin value sits against its NASA ranges, as a status tier and never a score: outside the operating limit
 * is Caution, outside only the comfort zone is Notice, inside both is "No findings". Context-only variables
 * (cumulative dose) are Information. No value is "No data".
 */
export function assessVariable(def: CabinVariableDef, value: number | null): ZoneStatus {
  if (value === null) return 'noData';
  if (def.contextOnly) return 'information';
  if (outside(value, def.operating)) return 'caution';
  if (outside(value, def.comfort)) return 'notice';
  return 'none';
}

/** The cabin trend window shown for every variable, in minutes. */
export const TREND_MINUTES = 48 * 60;

/**
 * The last 48 hours of one variable, oldest first, from the simulated cabin samples. The cabin variable card and the
 * CO2 panel both read through this, so they always show the same numbers for the same mission time.
 */
export function recentSeries(samples: readonly CabinSample[], id: CabinVariableId, now: number): Array<{ t: number; value: number }> {
  return samples
    .filter((s) => s.t > now - TREND_MINUTES && s.t <= now && s.values[id] !== undefined)
    .map((s) => ({ t: s.t, value: s.values[id]! }));
}
