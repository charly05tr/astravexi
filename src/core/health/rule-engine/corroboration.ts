import type { Finding, Indicator, IndicatorId, Tier, ZoneStatus } from '../model';
import { isAtLeast, maxTier, statusRank, tierRank } from '../tiers';

export interface ZoneStatusResult {
  status: ZoneStatus;
  corroborated: boolean;
}

/**
 * Per-zone corroboration: 2 or more distinct signal groups in the SAME zone with sustained findings at
 * Notice or above raise the zone to at least Caution. Corroboration never produces Warning.
 */
export function isCorroborated(findings: readonly Finding[], indicators: ReadonlyMap<IndicatorId, Indicator>): boolean {
  const signals = new Set<string>();
  for (const f of findings) {
    if (!f.sustained || !isAtLeast(f.tier, 'notice')) continue;
    const signal = indicators.get(f.indicatorId)?.signal;
    if (signal) signals.add(signal);
  }
  return signals.size >= 2;
}

/**
 * Zone status: the highest active finding tier (after corroboration). A monitored zone with no finding is
 * `none` when it has recent data and `noData` when it does not. A zone with no indicator is `unmonitored`.
 */
export function zoneStatus(
  findings: readonly Finding[],
  indicators: ReadonlyMap<IndicatorId, Indicator>,
  opts: { monitored: boolean; hasRecentData: boolean },
): ZoneStatusResult {
  if (!opts.monitored) return { status: 'unmonitored', corroborated: false };
  let top: Tier | null = null;
  for (const f of findings) top = top === null ? f.tier : maxTier(top, f.tier);
  const corroborated = isCorroborated(findings, indicators);
  let status: ZoneStatus = top ?? (opts.hasRecentData ? 'none' : 'noData');
  if (corroborated && statusRank(status) < tierRank('caution')) status = 'caution';
  return { status, corroborated };
}
