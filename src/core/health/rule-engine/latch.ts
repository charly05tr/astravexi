import type { Acknowledgement, Finding, Reading, Rule } from '../model';
import { STAT_SCALE } from '../rounding';
import { compareReadings } from '../series';
import { evalPoint } from './conditions';
import type { EngineContext } from './context';

/** A red flag is an absolute rule at tier Warning. */
export function isRedFlag(rule: Rule): boolean {
  return rule.layer === 'absolute' && rule.tier === 'warning';
}

function eligibleReadings(rule: Rule, ctx: EngineContext): Reading[] {
  const ind = ctx.indicators.get(rule.indicatorId);
  if (!ind) return [];
  return ctx.readings.filter(
    (r) =>
      r.indicatorId === ind.id &&
      (!ind.contextAware || rule.readingContext === 'any' || r.context === 'rest'),
  );
}

/**
 * Red flags compare the RAW value of every eligible reading up to the as-of instant, so a normal
 * re-measure cannot hide a crossing. A finding stays latched until a CMO acknowledges its
 * (zone, check-in group). Baselines, shifts and dismissals never reach this function.
 */
export function evaluateRedFlag(rule: Rule, ctx: EngineContext, acks: readonly Acknowledgement[]): Finding[] {
  const eligible = eligibleReadings(rule, ctx).sort(compareReadings);
  const latest = eligible[eligible.length - 1];
  const findings: Finding[] = [];
  for (const r of eligible) {
    if (!evalPoint(rule.condition, r)) continue;
    const acknowledged = acks.some((a) => a.zoneId === rule.zoneId && a.groupId === r.groupId);
    if (acknowledged) continue;
    findings.push({
      key: `${rule.id}:${r.id}`,
      ruleId: rule.id,
      layer: rule.layer,
      indicatorId: rule.indicatorId,
      zoneId: rule.zoneId,
      tier: rule.tier,
      readingId: r.id,
      groupId: r.groupId,
      source: r.source,
      observed: r.value * STAT_SCALE,
      sustained: false,
      latched: true,
      latestObserved: latest ? latest.value * STAT_SCALE : undefined,
      needsVerification: rule.needsVerification,
      confidence: 'high',
    });
  }
  return findings;
}
