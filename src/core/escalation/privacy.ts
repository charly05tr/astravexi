import type { Audience, Evaluation, Indicator, IndicatorId, ProjectedItem, Tier } from '../health/model';
import { statToDisplay, tierRank } from '../health/tiers';

const MIN_TIER: Record<Audience, number> = {
  astronaut: tierRank('information'),
  cmo: tierRank('caution'),
  flightSurgeon: tierRank('warning'),
};

/**
 * Privacy projection shared by the CMO panel and the Earth payload. For anyone but the astronaut,
 * a `tierOnly` indicator (mood) loses its value and unit: the tier is all that leaves the person.
 */
export function project(
  evaluation: Evaluation,
  audience: Audience,
  indicators: readonly Indicator[],
): ProjectedItem[] {
  const byId = new Map<IndicatorId, Indicator>(indicators.map((i) => [i.id, i]));
  const items: ProjectedItem[] = [];
  for (const zone of Object.values(evaluation.zones)) {
    for (const f of zone.findings) {
      if (tierRank(f.tier) < MIN_TIER[audience]) continue;
      const ind = byId.get(f.indicatorId);
      const item: ProjectedItem = {
        zoneId: zone.zoneId,
        status: zone.status,
        ruleId: f.ruleId,
        indicatorId: f.indicatorId,
        tier: f.tier as Tier,
        source: f.source,
        findingKey: f.key,
        groupId: f.groupId,
      };
      if (f.latched) item.latched = true;
      if (ind && (audience === 'astronaut' || ind.privacy === 'shareable')) {
        item.value = statToDisplay(f.observed, ind);
        item.unit = ind.unit;
        if (f.latestObserved !== undefined) item.latestValue = statToDisplay(f.latestObserved, ind);
      }
      items.push(item);
    }
  }
  return items;
}
