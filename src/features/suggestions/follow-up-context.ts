import type { Indicator, Reading } from '../../core/health/model';
import type { FollowUpContext, Suggestion, SuggestionContext } from '../../core/ports';

/** Days of readings sent along, counted back from the mission day. */
export const CONTEXT_DAYS = 7;
/** Hard cap so a dense history never inflates the request. */
export const MAX_CONTEXT_READINGS = 40;

/**
 * What the AI may see about an accepted recommendation: the recommendation, the findings it answers, and the
 * recent readings of those findings' indicators. Indicators marked `tierOnly` (mood) never leave the device:
 * not their readings, and not their findings either (label, tier, explanation). When the recommendation
 * answers only such findings it returns null, so nothing about it is sent at all.
 */
export function buildFollowUpContext(input: {
  accepted: Suggestion;
  context: SuggestionContext;
  readings: readonly Reading[];
  indicators: readonly Indicator[];
}): FollowUpContext | null {
  const { accepted, context, readings, indicators } = input;
  const byId = new Map(indicators.map((i) => [i.id, i]));
  const answered = context.findings.filter((f) => f.recommendationIds.includes(accepted.id));
  const findings = answered.filter((f) => f.indicatorId === null || byId.get(f.indicatorId)?.privacy === 'shareable');
  // Every finding behind this recommendation is private: even its title could reveal it.
  if (answered.length > 0 && findings.length === 0) return null;
  const wanted = new Set(findings.flatMap((f) => (f.indicatorId ? [f.indicatorId] : [])));
  const since = context.missionDay - CONTEXT_DAYS + 1;

  const recent = readings
    .filter((r) => wanted.has(r.indicatorId) && r.day >= since && r.day <= context.missionDay)
    .filter((r) => byId.get(r.indicatorId)?.privacy === 'shareable')
    .sort((a, b) => a.t - b.t)
    .slice(-MAX_CONTEXT_READINGS);

  return {
    // The suggestion's own rationale may come from a private finding, so it is rebuilt from a shareable one.
    accepted: {
      id: accepted.id,
      title: accepted.title,
      steps: accepted.steps,
      rationale: findings[0] ? `${findings[0].indicatorLabel}: ${findings[0].whatChanged}` : '',
    },
    zone: context.zone,
    missionDay: context.missionDay,
    findings: findings.map((f) => ({ indicatorLabel: f.indicatorLabel, tier: f.tier, whatChanged: f.whatChanged })),
    readings: recent.map((r) => {
      const indicator = byId.get(r.indicatorId)!;
      return {
        indicator: indicator.label,
        unit: indicator.unit,
        value: r.value / indicator.unitScale,
        day: r.day,
        context: r.context,
      };
    }),
  };
}
