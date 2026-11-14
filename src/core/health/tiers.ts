import type { Audience, Indicator, Tier, ZoneStatus } from './model';
import { STAT_SCALE } from './rounding';

export const TIERS: readonly Tier[] = ['information', 'notice', 'caution', 'warning'];

const RANK: Record<ZoneStatus, number> = {
  unmonitored: -2,
  noData: -1,
  none: 0,
  information: 1,
  notice: 2,
  caution: 3,
  warning: 4,
};

export function statusRank(status: ZoneStatus): number {
  return RANK[status];
}
export function tierRank(tier: Tier): number {
  return RANK[tier];
}
export function maxTier(a: Tier, b: Tier): Tier {
  return tierRank(a) >= tierRank(b) ? a : b;
}
export function minTier(a: Tier, b: Tier): Tier {
  return tierRank(a) <= tierRank(b) ? a : b;
}
export function isAtLeast(tier: Tier, floor: Tier): boolean {
  return tierRank(tier) >= tierRank(floor);
}

/** Routing by tier. Information and Notice: astronaut. Caution: astronaut and CMO. Warning: CMO and flight surgeon. */
export function audiencesForTier(tier: Tier): Audience[] {
  switch (tier) {
    case 'information':
    case 'notice':
      return ['astronaut'];
    case 'caution':
      return ['astronaut', 'cmo'];
    case 'warning':
      return ['cmo', 'flightSurgeon'];
  }
}

/** Stat units (stored x 10) to display units. */
export function statToDisplay(stat: number, indicator: Pick<Indicator, 'unitScale'>): number {
  return stat / (STAT_SCALE * indicator.unitScale);
}
/** Stored units to display units. */
export function storedToDisplay(stored: number, indicator: Pick<Indicator, 'unitScale'>): number {
  return stored / indicator.unitScale;
}
