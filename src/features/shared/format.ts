import type { Indicator, MissionMinute } from '../../core/health/model';

/** A display-unit number with the precision of its indicator: tenths for temperature and sleep. */
export function formatNumber(display: number, indicator: Pick<Indicator, 'unitScale'>): string {
  return indicator.unitScale === 10 ? display.toFixed(1) : String(Math.round(display));
}

export function formatValue(display: number, indicator: Pick<Indicator, 'unitScale' | 'unit'>): string {
  return `${formatNumber(display, indicator)} ${indicator.unit}`;
}

/** Signed difference with the same precision, e.g. "+0.4 C". */
export function formatDelta(display: number, indicator: Pick<Indicator, 'unitScale' | 'unit'>): string {
  const sign = display > 0 ? '+' : display < 0 ? '-' : '';
  return `${sign}${formatNumber(Math.abs(display), indicator)} ${indicator.unit}`;
}

/** Mission minutes as "Day 150, 08:05". */
export function formatMissionTime(minute: MissionMinute): string {
  const day = Math.floor(minute / 1440) + 1;
  const inDay = minute % 1440;
  const hh = String(Math.floor(inDay / 60)).padStart(2, '0');
  const mm = String(inDay % 60).padStart(2, '0');
  return `Day ${day}, ${hh}:${mm}`;
}
