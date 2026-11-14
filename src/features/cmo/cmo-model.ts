import { project } from '../../core/escalation/privacy';
import type { Evaluation, Indicator, ReadingSource, Tier, ZoneId, ZoneStatus } from '../../core/health/model';
import { tierRank } from '../../core/health/tiers';
import { formatValue } from '../shared/format';

export interface CmoItemView {
  key: string;
  ruleId: string;
  tier: Tier;
  indicatorLabel: string;
  source: ReadingSource;
  /** Null for tier-only indicators: mood is never shown as a score. */
  valueText: string | null;
  /** "Mood: Caution" for tier-only indicators. */
  tierOnlyText: string | null;
}

export interface LatchedGroupView {
  groupId: string;
  /** Latest re-measures of the latched red flags of this group, as text. Empty for tier-only indicators. */
  latest: string[];
}

export interface CmoZoneView {
  zoneId: ZoneId;
  zoneLabel: string;
  status: ZoneStatus;
  items: CmoItemView[];
  /** The zone reached Caution only because two sustained signals agree (no single finding is Caution). */
  corroborated: boolean;
  /** One Acknowledge per (zone, group). */
  latched: LatchedGroupView[];
}

const zoneRank = (z: CmoZoneView) => Math.max(tierRank(z.status as Tier), ...z.items.map((i) => tierRank(i.tier)));
const shortLabel = (label: string) => label.replace(/\s*\(.*\)\s*$/, '');

/**
 * The Crew Medical Officer view: every Caution-and-above item, through the same tier-only privacy
 * projection the Earth payload uses, grouped by zone.
 */
export function buildCmoView(
  evaluation: Evaluation,
  indicators: readonly Indicator[],
  zoneLabels: ReadonlyMap<ZoneId, string>,
  tierLabel: (tier: Tier) => string,
): CmoZoneView[] {
  const byId = new Map(indicators.map((i) => [i.id, i]));
  const zones = new Map<ZoneId, CmoZoneView>();
  for (const item of project(evaluation, 'cmo', indicators)) {
    const ind = byId.get(item.indicatorId);
    let zone = zones.get(item.zoneId);
    if (!zone) {
      zone = {
        zoneId: item.zoneId,
        zoneLabel: zoneLabels.get(item.zoneId) ?? item.zoneId,
        status: item.status,
        items: [],
        corroborated: false,
        latched: [],
      };
      zones.set(item.zoneId, zone);
    }
    const tierOnly = ind?.privacy === 'tierOnly';
    const label = ind?.label ?? item.indicatorId;
    zone.items.push({
      key: item.findingKey,
      ruleId: item.ruleId,
      tier: item.tier,
      indicatorLabel: label,
      source: item.source,
      valueText: item.value !== undefined && ind ? formatValue(item.value, ind) : null,
      tierOnlyText: tierOnly ? `${shortLabel(label)}: ${tierLabel(item.tier)}` : null,
    });
    if (item.latched) {
      let group = zone.latched.find((g) => g.groupId === item.groupId);
      if (!group) {
        group = { groupId: item.groupId, latest: [] };
        zone.latched.push(group);
      }
      if (item.latestValue !== undefined && ind) group.latest.push(`${label} ${formatValue(item.latestValue, ind)}`);
    }
  }
  // A zone raised to Caution by corroboration has no Caution finding of its own. The CMO still sees it,
  // with the contributing signals as tiers only (no values, so mood can never show as a score).
  for (const zone of Object.values(evaluation.zones)) {
    if (zones.has(zone.zoneId) || tierRank(zone.status as Tier) < tierRank('caution')) continue;
    const contributing = zone.findings.filter((f) => f.sustained && tierRank(f.tier) >= tierRank('notice'));
    zones.set(zone.zoneId, {
      zoneId: zone.zoneId,
      zoneLabel: zoneLabels.get(zone.zoneId) ?? zone.zoneId,
      status: zone.status,
      corroborated: true,
      latched: [],
      items: contributing.map((f) => {
        const label = byId.get(f.indicatorId)?.label ?? f.indicatorId;
        return {
          key: f.key,
          ruleId: f.ruleId,
          tier: f.tier,
          indicatorLabel: label,
          source: f.source,
          valueText: null,
          tierOnlyText: `${shortLabel(label)}: ${tierLabel(f.tier)}`,
        };
      }),
    });
  }
  return [...zones.values()].sort(
    (a, b) => zoneRank(b) - zoneRank(a),
  );
}
