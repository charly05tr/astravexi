import type {
  Evaluation,
  Finding,
  Indicator,
  IndicatorId,
  MissionMinute,
  OutboxMessage,
  OutboxPayload,
  ZoneId,
  ZoneStatus,
} from '../health/model';
import { statToDisplay } from '../health/tiers';
import type { LinkState } from './link';
import { initialState } from './link';
import { crossesEarthLink } from './routing';

export function dedupeKeyOf(zoneId: ZoneId, groupId: string): string {
  return `${zoneId}:${groupId}`;
}

/**
 * Build the Earth-bound messages for the active Warning findings: ONE message per (zone, check-in group),
 * aggregating every trigger of that group (BP 185/125 trips two rules and still yields one message).
 * Messages whose dedupe key already exists are skipped, so re-evaluation never duplicates.
 * A Warning that appears during a blackout starts as held.
 */
export function buildWarningMessages(
  evaluation: Evaluation,
  indicators: readonly Indicator[],
  existing: readonly OutboxMessage[],
  opts: { crewMember: string; now: MissionMinute; link: LinkState },
): OutboxMessage[] {
  const byId = new Map<IndicatorId, Indicator>(indicators.map((i) => [i.id, i]));
  const known = new Set(existing.map((m) => m.dedupeKey));
  const zoneTiers = {} as Record<ZoneId, ZoneStatus>;
  for (const z of Object.values(evaluation.zones)) zoneTiers[z.zoneId] = z.status;

  const groups = new Map<string, Finding[]>();
  for (const z of Object.values(evaluation.zones)) {
    for (const f of z.findings) {
      if (!crossesEarthLink(f.tier)) continue;
      const key = dedupeKeyOf(f.zoneId, f.groupId);
      groups.set(key, [...(groups.get(key) ?? []), f]);
    }
  }

  const out: OutboxMessage[] = [];
  for (const [dedupeKey, findings] of [...groups].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (known.has(dedupeKey)) continue;
    const first = findings[0]!;
    const payload: OutboxPayload = {
      crewMember: opts.crewMember,
      source: first.source,
      trigger: findings.map((f) => {
        const ind = byId.get(f.indicatorId);
        const trigger: OutboxPayload['trigger'][number] = {
          ruleId: f.ruleId,
          indicatorId: f.indicatorId,
          tier: f.tier,
          source: f.source,
        };
        // Same projection as the CMO panel: tier-only indicators never carry a value.
        if (ind && ind.privacy === 'shareable') {
          trigger.value = statToDisplay(f.observed, ind);
          trigger.unit = ind.unit;
        }
        return trigger;
      }),
      zoneTiers,
    };
    out.push({
      id: `msg:${dedupeKey}`,
      dedupeKey,
      zoneId: first.zoneId,
      groupId: first.groupId,
      createdAt: opts.now,
      to: 'flightSurgeon',
      payload,
      state: initialState(opts.link),
    });
  }
  return out;
}
