import { computeBaseline } from '../baselines';
import type { Indicator, IndicatorId, Knowledge, MissionDay, PersonalBaseline, Reading } from '../model';
import type { DailyValue } from '../series';
import { buildDailySeries } from '../series';

/** Everything the rule layers read. Built once per evaluation; rules are evaluated at one or more as-of days. */
export interface EngineContext {
  knowledge: Knowledge;
  indicators: Map<IndicatorId, Indicator>;
  /** Prepared readings: sorted, nothing after the as-of instant. */
  readings: Reading[];
  /** Resting daily series per indicator (all days up to the as-of instant). */
  series: Map<IndicatorId, DailyValue[]>;
  baselineCache: Map<string, PersonalBaseline>;
}

export function createContext(knowledge: Knowledge, readings: Reading[]): EngineContext {
  return {
    knowledge,
    indicators: new Map(knowledge.indicators.map((i) => [i.id, i])),
    readings,
    series: buildDailySeries(readings, knowledge.indicators),
    baselineCache: new Map(),
  };
}

/** Lagged baseline for an indicator at an as-of day; undefined when the indicator declares none. */
export function baselineAt(ctx: EngineContext, id: IndicatorId, day: MissionDay): PersonalBaseline | undefined {
  const ind = ctx.indicators.get(id);
  if (!ind?.baseline) return undefined;
  const key = `${id}@${day}`;
  let b = ctx.baselineCache.get(key);
  if (!b) {
    b = computeBaseline(id, ctx.series.get(id) ?? [], ind.baseline, day);
    ctx.baselineCache.set(key, b);
  }
  return b;
}

/** Latest daily value at or before `day`, or null when absent or stale (2 or more days old). */
export function latestFresh(ctx: EngineContext, id: IndicatorId, day: MissionDay): DailyValue | null {
  const ind = ctx.indicators.get(id);
  const series = ctx.series.get(id);
  if (!ind || !series) return null;
  let last: DailyValue | null = null;
  for (const v of series) {
    if (v.day <= day) last = v;
    else break;
  }
  if (!last || day - last.day >= ind.staleAfterDays) return null;
  return last;
}
