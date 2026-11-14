/** Stat units are stored units x STAT_SCALE, so derived statistics keep one extra integer digit. */
export const STAT_SCALE = 10;

/**
 * The only rounding in the core. Every derived value (median, MAD, mean, SD,
 * percentage threshold, mean +/- k x SD) passes through here once, before any comparison.
 * The epsilon absorbs floating-point error such as 71.99999999 for 72.
 */
export function roundHalfAway(x: number): number {
  if (x === 0) return 0;
  const magnitude = Math.floor(Math.abs(x) + 0.5 + 1e-9);
  if (magnitude === 0) return 0; // never return -0
  return x < 0 ? -magnitude : magnitude;
}

/** Display value to the integer stored unit (e.g. 37.7 C -> 377). */
export function toStored(display: number, unitScale: number): number {
  return roundHalfAway(display * unitScale);
}

/** Stored unit to stat units. */
export function toStat(stored: number): number {
  return stored * STAT_SCALE;
}
