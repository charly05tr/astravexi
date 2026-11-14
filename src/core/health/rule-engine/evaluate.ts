import type {
  Acknowledgement,
  AsOf,
  Audience,
  Evaluation,
  Finding,
  IndicatorId,
  IndicatorStatus,
  Knowledge,
  Reading,
  Tier,
  ZoneEvaluation,
  ZoneId,
} from '../model';
import { prepareReadings } from '../series';
import { audiencesForTier, minTier, tierRank } from '../tiers';
import { baselineAt, createContext } from './context';
import type { EngineContext } from './context';
import { zoneStatus } from './corroboration';
import { evalRuleAtDay } from './layers';
import { evaluateRedFlag, isRedFlag } from './latch';
import { episodeStartDay } from './persistence';

export interface EvaluateInput {
  readings: readonly Reading[];
  acks: readonly Acknowledgement[];
}

function indicatorStatuses(ctx: EngineContext, asOf: AsOf): Record<IndicatorId, IndicatorStatus> {
  const out = {} as Record<IndicatorId, IndicatorStatus>;
  for (const ind of ctx.knowledge.indicators) {
    const series = ctx.series.get(ind.id) ?? [];
    const last = series[series.length - 1];
    const baseline = baselineAt(ctx, ind.id, asOf.day);
    out[ind.id] = {
      baseline: !ind.baseline ? 'none' : (baseline?.status ?? 'building'),
      baselineDays: baseline?.n ?? 0,
      baselineMinDays: ind.baseline?.minDays ?? 0,
      lastReadingT: last ? last.t : null,
      lastReadingDay: last ? last.day : null,
      stale: last ? asOf.day - last.day >= ind.staleAfterDays : false,
    };
  }
  return out;
}

/**
 * Pure function of (readings, acks, knowledge, asOf). It never reads a clock or a random source.
 * Order: (a) absolute thresholds on raw values with latched red flags, (b) in-flight shift on a single
 * reading, (c) multi-day baseline deviation; then maxTier, per-zone corroboration and zone status.
 */
export function evaluate(input: EvaluateInput, knowledge: Knowledge, asOf: AsOf): Evaluation {
  const readings = prepareReadings(input.readings, asOf);
  const ctx = createContext(knowledge, readings);
  const findings: Finding[] = [];

  const ordered = [...knowledge.rules].sort(
    (a, b) => layerOrder(a.layer) - layerOrder(b.layer) || (a.id < b.id ? -1 : 1),
  );
  for (const rule of ordered) {
    if (isRedFlag(rule)) {
      findings.push(...evaluateRedFlag(rule, ctx, input.acks));
      continue;
    }
    const hit = evalRuleAtDay(rule, ctx, asOf.day);
    if (!hit) continue;
    const tier = minTier(rule.tier, rule.maxTier);
    const key = hit.sustained
      ? `${rule.id}:${episodeStartDay(rule, ctx, asOf.day)}`
      : `${rule.id}:${hit.readingId}`;
    findings.push({
      key,
      ruleId: rule.id,
      layer: rule.layer,
      indicatorId: rule.indicatorId,
      zoneId: rule.zoneId,
      tier,
      readingId: hit.readingId,
      groupId: hit.groupId,
      source: hit.source,
      observed: hit.observed,
      baseline: hit.baseline,
      persistence: hit.persistence,
      sustained: hit.sustained,
      shiftExplained: hit.shiftExplained,
      unverified: hit.unverified,
      needsVerification: rule.needsVerification,
      confidence: hit.unverified ? 'low' : hit.sustained ? 'high' : 'medium',
    });
  }

  const indicatorStatus = indicatorStatuses(ctx, asOf);
  const zones = {} as Record<ZoneId, ZoneEvaluation>;
  for (const zone of knowledge.zones) {
    const zoneFindings = findings
      .filter((f) => f.zoneId === zone.id)
      .sort((a, b) => tierRank(b.tier) - tierRank(a.tier) || (a.key < b.key ? -1 : 1));
    const hasRecentData = zone.indicatorIds.some((id) => {
      const ind = ctx.indicators.get(id);
      return ind
        ? readings.some((r) => r.indicatorId === id && asOf.day - r.day < ind.staleAfterDays)
        : false;
    });
    const { status, corroborated } = zoneStatus(zoneFindings, ctx.indicators, {
      monitored: zone.indicatorIds.length > 0,
      hasRecentData,
    });
    zones[zone.id] = { zoneId: zone.id, status, corroborated, findings: zoneFindings };
  }

  let highest: Tier | 'none' = 'none';
  const audiences = new Set<Audience>();
  for (const f of findings) {
    if (highest === 'none' || tierRank(f.tier) > tierRank(highest)) highest = f.tier;
    for (const a of audiencesForTier(f.tier)) audiences.add(a);
  }
  for (const z of Object.values(zones)) {
    if (z.corroborated) for (const a of audiencesForTier('caution')) audiences.add(a);
    if (z.status !== 'none' && z.status !== 'noData' && z.status !== 'unmonitored') {
      if (highest === 'none' || tierRank(z.status) > tierRank(highest)) highest = z.status;
    }
  }

  return { asOf, zones, highest, audiences: [...audiences], indicatorStatus };
}

function layerOrder(layer: 'absolute' | 'inFlightShift' | 'baseline'): number {
  return layer === 'absolute' ? 0 : layer === 'inFlightShift' ? 1 : 2;
}
