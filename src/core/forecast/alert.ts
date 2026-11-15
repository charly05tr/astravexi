import type { Range } from '../attribution/model';
import type { ForecastPoint } from './model';
import type { ForecastVariable, HorizonH } from './types';

/** An informational heads-up that a forecast interval reaches a NASA limit. Never a diagnosis. */
export interface ForecastAlert {
  variable: ForecastVariable;
  /** The shortest enabled horizon whose 80% interval reaches the limit. */
  horizonH: HorizonH;
  side: 'above' | 'below';
  limit: number;
}

/**
 * Preventive alert: the upper bound of an enabled horizon crossing the NASA maximum (or the lower bound the minimum).
 * It is raised only while the latest observed value is still inside the limits; once a limit is crossed the status
 * tier already says so. It reads the forecast only and never feeds the attribution verdict.
 */
export function preventiveAlert(points: readonly ForecastPoint[], operating: Range | null, latest: number | null): ForecastAlert | null {
  if (!operating || latest === null || points.length === 0) return null;
  if ((operating.max !== undefined && latest > operating.max) || (operating.min !== undefined && latest < operating.min)) return null;
  const ordered = [...points].sort((a, b) => a.horizonH - b.horizonH);
  for (const p of ordered) {
    if (operating.max !== undefined && p.high > operating.max) return { variable: p.variable, horizonH: p.horizonH, side: 'above', limit: operating.max };
    if (operating.min !== undefined && p.low < operating.min) return { variable: p.variable, horizonH: p.horizonH, side: 'below', limit: operating.min };
  }
  return null;
}
