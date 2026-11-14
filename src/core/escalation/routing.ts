import type { Audience, Tier } from '../health/model';
import { audiencesForTier } from '../health/tiers';

/**
 * Information and Notice stay with the astronaut. Caution goes to the astronaut and the on-board CMO and
 * never enters the Earth queue. Warning goes to the CMO first and queues to the flight surgeon on Earth.
 */
export function routeTier(tier: Tier): Audience[] {
  return audiencesForTier(tier);
}

/** Only Warning crosses the delayed link. */
export function crossesEarthLink(tier: Tier): boolean {
  return tier === 'warning';
}
