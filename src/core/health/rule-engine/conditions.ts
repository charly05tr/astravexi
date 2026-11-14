import type { Condition, Op } from '../model';

export function compare(op: Op, actual: number, threshold: number): boolean {
  switch (op) {
    case 'gt':
      return actual > threshold;
    case 'gte':
      return actual >= threshold;
    case 'lt':
      return actual < threshold;
    case 'lte':
      return actual <= threshold;
  }
}

/** Flatten nested `and` into its leaves. */
export function leavesOf(cond: Condition): Condition[] {
  return cond.kind === 'and' ? cond.all.flatMap(leavesOf) : [cond];
}

export function hasKind(cond: Condition, kind: Condition['kind']): boolean {
  return leavesOf(cond).some((c) => c.kind === kind);
}

export interface Point {
  /** Stored units. */
  value: number;
  symptomatic: boolean;
}

/**
 * Evaluate a condition against ONE reading. Used for red flags and symptom rules, where the
 * comparison is always on the raw value. Kinds that need history or a baseline never match here.
 */
export function evalPoint(cond: Condition, p: Point): boolean {
  switch (cond.kind) {
    case 'latest':
      return compare(cond.op, p.value, cond.value);
    case 'requiresSymptom':
      return p.symptomatic;
    case 'and':
      return cond.all.every((c) => evalPoint(c, p));
    default:
      return false;
  }
}

/** True when every leaf can be decided from a single reading. */
export function isPointCondition(cond: Condition): boolean {
  return leavesOf(cond).every((c) => c.kind === 'latest' || c.kind === 'requiresSymptom');
}
