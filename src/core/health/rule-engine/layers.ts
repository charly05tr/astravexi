import type {
  Condition,
  Indicator,
  MissionDay,
  PersonalBaseline,
  ReadingSource,
  Rule,
} from '../model';
import { roundHalfAway, STAT_SCALE } from '../rounding';
import { compareReadings } from '../series';
import type { DailyValue } from '../series';
import { baselineAt, latestFresh } from './context';
import type { EngineContext } from './context';
import { compare, evalPoint, hasKind, leavesOf } from './conditions';

/** Result of evaluating one non-latched rule at one as-of day. */
export interface RuleHit {
  /** Stat units. */
  observed: number;
  readingId: string;
  groupId: string;
  source: ReadingSource;
  baseline?: PersonalBaseline;
  persistence?: { hits: number; ofDays: number };
  sustained: boolean;
  shiftExplained?: boolean;
  unverified?: boolean;
}

function windowValues(ctx: EngineContext, ind: Indicator, day: MissionDay, days: number): DailyValue[] {
  const from = day - days + 1;
  return (ctx.series.get(ind.id) ?? []).filter((v) => v.day >= from && v.day <= day);
}

function hitFromValue(v: DailyValue, observed: number, extra: Partial<RuleHit> = {}): RuleHit {
  return {
    observed,
    readingId: v.readingId,
    groupId: v.groupId,
    source: v.source,
    sustained: false,
    ...extra,
  };
}

/** Point-wise comparison of one daily value against the lagged baseline. All thresholds are integers in stat units. */
export function evalBaselinePoint(
  cond: Condition,
  valueStat: number,
  baseline: PersonalBaseline,
  minSpread: number,
): boolean {
  switch (cond.kind) {
    case 'baselineDelta': {
      const threshold = roundHalfAway(cond.value * STAT_SCALE);
      const delta = valueStat - baseline.median;
      return cond.direction === 'above' ? delta >= threshold : delta <= -threshold;
    }
    case 'baselinePct': {
      if (cond.direction === 'above') {
        return valueStat >= roundHalfAway((baseline.median * (100 + cond.value)) / 100);
      }
      return valueStat <= roundHalfAway((baseline.median * (100 - cond.value)) / 100);
    }
    case 'robustZ': {
      const spread = Math.max(baseline.mad, roundHalfAway(minSpread * STAT_SCALE));
      if (spread === 0) return false;
      const z100 = roundHalfAway(((valueStat - baseline.median) * 100) / (1.4826 * spread));
      const threshold = roundHalfAway(cond.value * 100);
      return cond.direction === 'above' ? z100 >= threshold : z100 <= -threshold;
    }
    default:
      return false;
  }
}

interface LeafResult {
  observed?: number;
  value?: DailyValue;
  sustained: boolean;
}

/** One series-based leaf of a layer (a) condition. Returns null when the leaf does not hold. */
function evalSeriesLeaf(
  leaf: Condition,
  ctx: EngineContext,
  ind: Indicator,
  day: MissionDay,
): LeafResult | null {
  switch (leaf.kind) {
    case 'latest': {
      const v = latestFresh(ctx, ind.id, day);
      if (!v || !compare(leaf.op, v.value, leaf.value)) return null;
      return { observed: v.value * STAT_SCALE, value: v, sustained: false };
    }
    case 'rollingMean': {
      const vals = windowValues(ctx, ind, day, leaf.days);
      if (vals.length < leaf.minN || vals.length === 0) return null;
      const sum = vals.reduce((s, v) => s + v.value, 0);
      const mean = roundHalfAway((sum * STAT_SCALE) / vals.length);
      if (!compare(leaf.op, mean, leaf.value * STAT_SCALE)) return null;
      return { observed: mean, value: vals[vals.length - 1]!, sustained: true };
    }
    case 'consecutiveDays': {
      const vals = windowValues(ctx, ind, day, leaf.days);
      if (vals.length < leaf.days) return null;
      if (!vals.every((v) => compare(leaf.op, v.value, leaf.value))) return null;
      const last = vals[vals.length - 1]!;
      return { observed: last.value * STAT_SCALE, value: last, sustained: true };
    }
    case 'trend': {
      const vals = windowValues(ctx, ind, day, leaf.days);
      if (vals.length < leaf.days) return null;
      const n = vals.length;
      // Sign of the least-squares slope: sum((2i - (n - 1)) * y_i). Exact integer arithmetic.
      const slope = vals.reduce((s, v, i) => s + (2 * i - (n - 1)) * v.value, 0);
      const ok = leaf.direction === 'rising' ? slope > 0 : slope < 0;
      if (!ok) return null;
      const last = vals[n - 1]!;
      return { observed: last.value * STAT_SCALE, value: last, sustained: true };
    }
    case 'baselineBuilding': {
      const b = baselineAt(ctx, ind.id, day);
      return b && b.status === 'building' ? { sustained: false } : null;
    }
    default:
      return null;
  }
}

function eligibleContext(rule: Rule, ind: Indicator, context: 'rest' | 'exercise'): boolean {
  return !ind.contextAware || rule.readingContext === 'any' || context === 'rest';
}

/** Layer (a) rule that is not a red flag: raw values, no baseline shift. */
function evalAbsolute(rule: Rule, ctx: EngineContext, day: MissionDay): RuleHit | null {
  const ind = ctx.indicators.get(rule.indicatorId)!;

  if (hasKind(rule.condition, 'requiresSymptom')) {
    // Symptom rules look at any eligible reading of the latest day, exercise readings included (round 2).
    const eligible = ctx.readings.filter(
      (r) => r.indicatorId === ind.id && r.day <= day && eligibleContext(rule, ind, r.context),
    );
    const latestDay = eligible.reduce((m, r) => Math.max(m, r.day), -Infinity);
    if (!Number.isFinite(latestDay) || day - latestDay >= ind.staleAfterDays) return null;
    const matching = eligible
      .filter((r) => r.day === latestDay && evalPoint(rule.condition, r))
      .sort(compareReadings);
    const r = matching[matching.length - 1];
    if (!r) return null;
    return {
      observed: r.value * STAT_SCALE,
      readingId: r.id,
      groupId: r.groupId,
      source: r.source,
      sustained: false,
    };
  }

  let observed: number | undefined;
  let ref: DailyValue | undefined;
  let sustained = false;
  let building = false;
  for (const leaf of leavesOf(rule.condition)) {
    const res = evalSeriesLeaf(leaf, ctx, ind, day);
    if (!res) return null;
    if (leaf.kind === 'baselineBuilding') building = true;
    if (res.sustained) sustained = true;
    if (observed === undefined && res.observed !== undefined) observed = res.observed;
    if (!ref && res.value) ref = res.value;
  }
  if (observed === undefined || !ref) return null;
  return hitFromValue(ref, observed, { sustained, unverified: building || undefined });
}

/** Layer (b): a single reading against the lagged baseline. The shift only ever EXPLAINS an Information finding. */
function evalShift(rule: Rule, ctx: EngineContext, day: MissionDay): RuleHit | null {
  const ind = ctx.indicators.get(rule.indicatorId)!;
  const baseline = baselineAt(ctx, ind.id, day);
  if (!baseline || baseline.status !== 'ready') return null;
  const v = latestFresh(ctx, ind.id, day);
  if (!v) return null;
  const valueStat = v.value * STAT_SCALE;
  const delta = valueStat - baseline.median;
  const cond = rule.condition;

  if (rule.expectedShift) {
    if (cond.kind !== 'latest' || !compare(cond.op, v.value, cond.value)) return null;
    if (delta >= roundHalfAway(rule.expectedShift.explainedBelowDelta * STAT_SCALE)) return null;
    return hitFromValue(v, valueStat, { baseline, shiftExplained: true });
  }
  if (!evalBaselinePoint(cond, valueStat, baseline, ind.baseline?.minSpread ?? 0)) return null;
  return hitFromValue(v, valueStat, { baseline });
}

/** Layer (c): multi-day deviation from the lagged baseline. Persistence or a window mean is mandatory. */
function evalBaselineRule(rule: Rule, ctx: EngineContext, day: MissionDay): RuleHit | null {
  const ind = ctx.indicators.get(rule.indicatorId)!;
  const baseline = baselineAt(ctx, ind.id, day);
  if (!baseline || baseline.status !== 'ready') return null;
  const minSpread = ind.baseline?.minSpread ?? 0;
  const cond = rule.condition;

  if (cond.kind === 'meanVsBaseline') {
    const vals = windowValues(ctx, ind, day, cond.days);
    if (vals.length < cond.minN || vals.length === 0) return null;
    const sum = vals.reduce((s, v) => s + v.value, 0);
    const mean = roundHalfAway((sum * STAT_SCALE) / vals.length);
    const spread = Math.max(baseline.sd, roundHalfAway(minSpread * STAT_SCALE));
    const band = roundHalfAway(cond.sd * spread);
    const minRise = roundHalfAway(cond.minRise * STAT_SCALE);
    const ok =
      cond.direction === 'above'
        ? mean >= baseline.mean + band && mean - baseline.mean >= minRise
        : mean <= baseline.mean - band && baseline.mean - mean >= minRise;
    if (!ok) return null;
    return hitFromValue(vals[vals.length - 1]!, mean, { baseline, sustained: true });
  }

  const persistence = rule.persistence;
  if (!persistence) return null; // layer (c) without persistence never fires
  const vals = windowValues(ctx, ind, day, persistence.ofDays);
  const hits = vals.filter((v) => evalBaselinePoint(cond, v.value * STAT_SCALE, baseline, minSpread));
  if (hits.length < persistence.hits) return null;
  const last = hits[hits.length - 1]!;
  return hitFromValue(last, last.value * STAT_SCALE, {
    baseline,
    persistence: { hits: hits.length, ofDays: persistence.ofDays },
    sustained: true,
  });
}

/** Evaluate one non-latched rule as of `day`. Red flags are handled in latch.ts. */
export function evalRuleAtDay(rule: Rule, ctx: EngineContext, day: MissionDay): RuleHit | null {
  switch (rule.layer) {
    case 'absolute':
      return evalAbsolute(rule, ctx, day);
    case 'inFlightShift':
      return evalShift(rule, ctx, day);
    case 'baseline':
      return evalBaselineRule(rule, ctx, day);
  }
}
