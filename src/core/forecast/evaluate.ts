import { buildFeatures, MIN_HISTORY } from './feature-builder';
import { fitRidge, predictRidge } from './ridge';
import type { RidgeFit } from './ridge';
import { SLOTS_PER_DAY, SLOTS_PER_HOUR } from './types';
import type { HorizonH, Segment } from './types';

/** All usable grid segments of one mission for one variable. */
export interface MissionSeries {
  mission: string;
  segments: Segment[];
}

/** One supervised example: features at the origin, the value now, the value `h` ahead and the seasonal naive guess. */
export interface Example {
  mission: string;
  features: number[];
  now: number;
  target: number;
  /** The value at the same time of day 24 h before the target, or null when there is not a full day of history. */
  seasonal: number | null;
}

/** Builds every example of one mission for a horizon. Never crosses a segment boundary (no value across a gap). */
export function buildExamples(series: MissionSeries, horizonH: HorizonH): Example[] {
  const h = horizonH * SLOTS_PER_HOUR;
  const out: Example[] = [];
  for (const seg of series.segments) {
    const v = seg.values;
    for (let i = MIN_HISTORY - 1; i + h < v.length; i += 1) {
      const features = buildFeatures(v.slice(i - MIN_HISTORY + 1, i + 1), seg.startSlot + i);
      if (!features) continue;
      const back = i + h - SLOTS_PER_DAY;
      out.push({ mission: series.mission, features, now: v[i]!, target: v[i + h]!, seasonal: back >= 0 ? v[back]! : null });
    }
  }
  return out;
}

export const LAMBDA_GRID: readonly number[] = [0.1, 1, 10, 100, 1000, 10000, 100000, 1000000];

const delta = (e: Example) => e.target - e.now;

function fitOn(train: readonly Example[], lambda: number): RidgeFit | null {
  return fitRidge(
    train.map((e) => e.features),
    train.map(delta),
    lambda,
  );
}

/** Summed absolute error of a fit on examples (original units). */
function absErrorOf(fit: RidgeFit, test: readonly Example[]): { sum: number; n: number } {
  let sum = 0;
  for (const e of test) sum += Math.abs(e.target - (e.now + predictRidge(fit, e.features)));
  return { sum, n: test.length };
}

/**
 * Picks the ridge lambda by leave-one-mission-out validation INSIDE the given missions only: each mission is
 * held out in turn, the model is fitted on the others, and the pooled absolute error of the held-out missions
 * decides. The caller never passes its test mission here.
 */
export function chooseLambda(byMission: ReadonlyMap<string, Example[]>, grid: readonly number[] = LAMBDA_GRID): number {
  const names = [...byMission.keys()];
  if (names.length < 2) return grid[Math.floor(grid.length / 2)]!;
  let best = grid[0]!;
  let bestMae = Infinity;
  for (const lambda of grid) {
    let sum = 0;
    let n = 0;
    for (const held of names) {
      const train = names.filter((m) => m !== held).flatMap((m) => byMission.get(m)!);
      const fit = fitOn(train, lambda);
      if (!fit) continue;
      const r = absErrorOf(fit, byMission.get(held)!);
      sum += r.sum;
      n += r.n;
    }
    const mae = n === 0 ? Infinity : sum / n;
    if (mae < bestMae) {
      bestMae = mae;
      best = lambda;
    }
  }
  return best;
}

export interface ErrorStats {
  mae: number;
  rmse: number;
}

export interface HorizonEvaluation {
  /** Examples evaluated (only those where all three methods have a prediction). */
  n: number;
  /** Missions that were held out at least once. */
  testMissions: string[];
  model: ErrorStats;
  persistence: ErrorStats;
  seasonalNaive: ErrorStats;
  /** Missions where the model MAE beat both baselines on that mission alone. */
  missionsBeatingBoth: number;
  /** Quantiles of (actual - predicted) of the held-out predictions, for an 80% prediction interval. */
  residualQ10: number;
  residualQ90: number;
  /** The lambda chosen in each outer fold, then the lambda of the final fit (all missions). */
  foldLambdas: number[];
}

export interface ForecastFit {
  fit: RidgeFit;
  lambda: number;
  evaluation: HorizonEvaluation;
}

class Acc {
  abs = 0;
  sq = 0;
  n = 0;
  add(err: number) {
    this.abs += Math.abs(err);
    this.sq += err * err;
    this.n += 1;
  }
  stats(): ErrorStats {
    return { mae: this.n ? this.abs / this.n : NaN, rmse: this.n ? Math.sqrt(this.sq / this.n) : NaN };
  }
}

export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/**
 * Leave-mission-out evaluation of the ridge model against the two baselines, then the final fit.
 *
 * - Outer loop: each mission in turn is the TEST mission; the others train. A mission is never in both. Nothing is
 *   shuffled across time.
 * - The lambda of each outer fold is chosen by an inner leave-one-mission-out on the TRAIN missions only.
 * - Test errors are pooled over the outer folds. Only examples where the seasonal naive has a value (24 h of
 *   history) are scored, for all three methods alike.
 * - The shipped model is fitted on all missions with a lambda chosen by leave-mission-out over all of them
 *   (validation folds only); its reported metrics are the honest outer-fold metrics, not a refit score.
 */
export function evaluateAndFit(missions: readonly MissionSeries[], horizonH: HorizonH, minExamples = 200): ForecastFit | null {
  const byMission = new Map<string, Example[]>();
  for (const m of missions) {
    const ex = buildExamples(m, horizonH);
    if (ex.length >= minExamples) byMission.set(m.mission, ex);
  }
  const names = [...byMission.keys()];
  if (names.length < 3) return null;

  const model = new Acc();
  const pers = new Acc();
  const seas = new Acc();
  const residuals: number[] = [];
  const foldLambdas: number[] = [];
  let beating = 0;
  for (const test of names) {
    const trainMap = new Map(names.filter((m) => m !== test).map((m) => [m, byMission.get(m)!] as const));
    const lambda = chooseLambda(trainMap);
    foldLambdas.push(lambda);
    const fit = fitOn([...trainMap.values()].flat(), lambda);
    if (!fit) continue;
    const mm = new Acc();
    const pp = new Acc();
    const ss = new Acc();
    for (const e of byMission.get(test)!) {
      if (e.seasonal === null) continue;
      const pred = e.now + predictRidge(fit, e.features);
      model.add(e.target - pred);
      mm.add(e.target - pred);
      pers.add(e.target - e.now);
      pp.add(e.target - e.now);
      seas.add(e.target - e.seasonal);
      ss.add(e.target - e.seasonal);
      residuals.push(e.target - pred);
    }
    if (mm.n > 0 && mm.stats().mae < pp.stats().mae && mm.stats().mae < ss.stats().mae) beating += 1;
  }
  const finalLambda = chooseLambda(byMission);
  const finalFit = fitOn([...byMission.values()].flat(), finalLambda);
  if (!finalFit) return null;
  residuals.sort((a, b) => a - b);
  return {
    fit: finalFit,
    lambda: finalLambda,
    evaluation: {
      n: model.n,
      testMissions: names,
      model: model.stats(),
      persistence: pers.stats(),
      seasonalNaive: seas.stats(),
      missionsBeatingBoth: beating,
      residualQ10: quantile(residuals, 0.1),
      residualQ90: quantile(residuals, 0.9),
      foldLambdas: [...foldLambdas, finalLambda],
    },
  };
}

/** The gate: a horizon is enabled only if the model test MAE beats BOTH baselines. */
export function passesGate(e: Pick<HorizonEvaluation, 'model' | 'persistence' | 'seasonalNaive'>): boolean {
  return e.model.mae < e.persistence.mae && e.model.mae < e.seasonalNaive.mae;
}

/** True when no mission appears in both lists: the leakage guard of the grouped split. */
export function missionsDisjoint(train: readonly string[], test: readonly string[]): boolean {
  const t = new Set(train);
  return !test.some((m) => t.has(m));
}
