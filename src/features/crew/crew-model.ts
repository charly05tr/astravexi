import type { Indicator, Knowledge, Tier, ZoneId, ZoneStatus } from '../../core/health/model';
import { statusRank, tierRank } from '../../core/health/tiers';
import type { HabitsView } from '../../core/habits/gamification';
import type { Role } from '../../core/profiles/model';
import type { CrewMember } from '../../core/use-cases/crew';
import { buildCmoView, shortLabel } from '../cmo/cmo-model';
import type { CmoZoneView } from '../cmo/cmo-model';
import { buildTrend } from '../insights/trend-data';
import type { Trend } from '../insights/trend-data';
import { formatMissionTime } from '../shared/format';

/** How many findings a crew card names. */
export const CARD_FINDINGS = 2;

export interface CrewFindingView {
  key: string;
  /** "Heart rate", "Mood": the indicator without its parenthesis. Never a value. */
  indicatorLabel: string;
  tier: Tier;
}

export interface CrewCardView {
  profileId: string;
  name: string;
  role: Role;
  /** The worst status among the member's zones. */
  status: ZoneStatus;
  /** Active findings at Caution or above, plus zones raised to Caution by corroboration. */
  concernCount: number;
  topFindings: CrewFindingView[];
  lastCheckInText: string;
}

export interface CrewZoneStatusView {
  zoneId: ZoneId;
  label: string;
  status: ZoneStatus;
}

export interface CrewTrendView {
  id: string;
  label: string;
  unit: string;
  precision: 0 | 1;
  trend: Trend;
}

export interface CrewDetailView {
  card: CrewCardView;
  zones: CrewZoneStatusView[];
  /** Same grouping and privacy projection as the Crew Medical Officer panel. */
  cmoZones: CmoZoneView[];
  /** Shareable indicators only: a tier-only indicator (mood) never gets a chart of its values. */
  trends: CrewTrendView[];
  /** The member's habits and progress. The CMO reads them; nothing here can change them. */
  habits: HabitsView;
}

/** The worst status among the zones: Warning > Caution > Notice > Information > No findings > No data > Not monitored. */
export function worstStatus(statuses: readonly ZoneStatus[]): ZoneStatus {
  return statuses.reduce<ZoneStatus>((worst, s) => (statusRank(s) > statusRank(worst) ? s : worst), 'unmonitored');
}

const isConcern = (tier: Tier) => tierRank(tier) >= tierRank('caution');

function lastCheckInText(lastReadingT: number | null): string {
  return lastReadingT === null ? 'No check-in yet' : formatMissionTime(lastReadingT);
}

function cardOf(member: CrewMember, cmoZones: readonly CmoZoneView[]): CrewCardView {
  const findings: CrewFindingView[] = [];
  for (const zone of cmoZones) {
    if (zone.corroborated) {
      findings.push({ key: `corroboration:${zone.zoneId}`, indicatorLabel: `${zone.zoneLabel} (corroborated)`, tier: 'caution' });
      continue;
    }
    for (const item of zone.items) {
      if (isConcern(item.tier)) findings.push({ key: item.key, indicatorLabel: shortLabel(item.indicatorLabel), tier: item.tier });
    }
  }
  // Stable: the most severe first, ties keep the zone order.
  const ranked = findings
    .map((f, index) => ({ f, index }))
    .sort((a, b) => tierRank(b.f.tier) - tierRank(a.f.tier) || a.index - b.index)
    .map(({ f }) => f);
  return {
    profileId: member.profileId,
    name: member.name,
    role: member.role,
    status: worstStatus(Object.values(member.evaluation.zones).map((z) => z.status)),
    concernCount: findings.length,
    topFindings: ranked.slice(0, CARD_FINDINGS),
    lastCheckInText: lastCheckInText(member.lastReadingT),
  };
}

function viewOf(member: CrewMember, knowledge: Knowledge, tierLabel: (tier: Tier) => string): { card: CrewCardView; cmoZones: CmoZoneView[] } {
  const labels = new Map(knowledge.zones.map((z) => [z.id, z.label]));
  // The same projection as the CMO panel: a tier-only indicator arrives without its value.
  const cmoZones = buildCmoView(member.evaluation, knowledge.indicators, labels, tierLabel);
  return { card: cardOf(member, cmoZones), cmoZones };
}

/** The crew overview: one card per member, the worst status first (then more concerns, then name). */
export function buildCrewOverview(
  members: readonly CrewMember[],
  knowledge: Knowledge,
  tierLabel: (tier: Tier) => string,
): CrewCardView[] {
  return members
    .map((m) => viewOf(m, knowledge, tierLabel).card)
    .sort(
      (a, b) =>
        statusRank(b.status) - statusRank(a.status) ||
        b.concernCount - a.concernCount ||
        a.name.localeCompare(b.name),
    );
}

/** Everything the detail of one crew member shows. Pure: no store, no React. */
export function buildCrewDetail(member: CrewMember, knowledge: Knowledge, tierLabel: (tier: Tier) => string): CrewDetailView {
  const { card, cmoZones } = viewOf(member, knowledge, tierLabel);
  const zones = knowledge.zones.map<CrewZoneStatusView>((z) => ({
    zoneId: z.id,
    label: z.label,
    status: member.evaluation.zones[z.id].status,
  }));
  const shareable = (i: Indicator) => i.privacy === 'shareable';
  const trends = knowledge.zones
    .flatMap((z) => z.indicatorIds)
    .map((id) => knowledge.indicators.find((i) => i.id === id))
    .filter((i): i is Indicator => i !== undefined && shareable(i))
    .map<CrewTrendView>((i) => ({
      id: i.id,
      label: i.label,
      unit: i.unit,
      precision: i.unitScale === 10 ? 1 : 0,
      trend: buildTrend(member.readings, i, member.evaluation.asOf),
    }))
    .filter((t) => t.trend.points.length > 0);
  return { card, zones, cmoZones, trends, habits: member.habits };
}
