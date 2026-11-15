import { describe, expect, it } from 'vitest';
import { buildExamples, chooseLambda, evaluateAndFit, missionsDisjoint, passesGate, quantile } from './evaluate';
import type { MissionSeries } from './evaluate';
import { MIN_HISTORY } from './feature-builder';

/** A tiny deterministic generator for synthetic series (core tests do not import adapters). */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A daily cycle plus AR(1) noise on the 15-minute grid, one segment. */
function synthetic(mission: string, days: number, seed: number, level = 100): MissionSeries {
  const rnd = lcg(seed);
  const values: number[] = [];
  let e = 0;
  for (let i = 0; i < days * 96; i += 1) {
    e = 0.9 * e + (rnd() - 0.5) * 2;
    values.push(level + 5 * Math.sin((2 * Math.PI * i) / 96) + e);
  }
  return { mission, segments: [{ startSlot: 0, values }] };
}

describe('buildExamples', () => {
  it('never builds an example across a gap: every window and target lies inside one segment', () => {
    const series: MissionSeries = {
      mission: 'M',
      segments: [
        { startSlot: 0, values: Array.from({ length: 40 }, (_, i) => i) },
        { startSlot: 500, values: Array.from({ length: 40 }, (_, i) => 1000 + i) },
      ],
    };
    const ex = buildExamples(series, 1);
    // 1 h = 4 slots. Per segment: origins from MIN_HISTORY - 1 to 40 - 5.
    expect(ex).toHaveLength(2 * (40 - 4 - (MIN_HISTORY - 1)));
    for (const e of ex) expect(Math.abs(e.target - e.now)).toBe(4);
  });

  it('gives the seasonal naive only with a full day of history', () => {
    const ex = buildExamples(synthetic('M', 3, 1), 1);
    expect(ex.some((e) => e.seasonal === null)).toBe(true);
    expect(ex.some((e) => e.seasonal !== null)).toBe(true);
    const first = ex.find((e) => e.seasonal !== null)!;
    expect(Number.isFinite(first.seasonal!)).toBe(true);
  });
});

describe('leakage guard', () => {
  it('missionsDisjoint is true only when no mission is in both lists', () => {
    expect(missionsDisjoint(['A', 'B'], ['C'])).toBe(true);
    expect(missionsDisjoint(['A', 'B'], ['B'])).toBe(false);
  });

  it('holds out every mission once and scores it with a model that never saw it', () => {
    const missions = ['A', 'B', 'C', 'D'].map((m, i) => synthetic(m, 6, i + 1));
    const result = evaluateAndFit(missions, 1, 50)!;
    expect(result.evaluation.testMissions).toEqual(['A', 'B', 'C', 'D']);
    expect(result.evaluation.foldLambdas).toHaveLength(5);
    // Corrupting ONE mission only changes the folds that train on it: scoring mission A ignores A when training.
    const poisoned = missions.map((m) => (m.mission === 'A' ? { ...m, segments: [{ ...m.segments[0]!, values: m.segments[0]!.values.map(() => 1e6) }] } : m));
    const withPoison = evaluateAndFit(poisoned, 1, 50)!;
    expect(withPoison.evaluation.n).toBe(result.evaluation.n);
    expect(withPoison.evaluation.model.mae).not.toBe(result.evaluation.model.mae);
  });

  it('chooses lambda from the given missions only', () => {
    const byMission = new Map(['A', 'B', 'C'].map((m, i) => [m, buildExamples(synthetic(m, 4, i + 10), 1)] as const));
    const lambda = chooseLambda(byMission);
    expect([0.1, 1, 10, 100, 1000, 10000, 100000, 1000000]).toContain(lambda);
  });

  it('refuses to evaluate with fewer than three usable missions', () => {
    expect(evaluateAndFit([synthetic('A', 6, 1), synthetic('B', 6, 2)], 1, 50)).toBeNull();
  });
});

describe('evaluateAndFit', () => {
  it('beats the seasonal naive on a noisy daily cycle and reports honest intervals', () => {
    const missions = ['A', 'B', 'C', 'D'].map((m, i) => synthetic(m, 8, i + 20));
    const r = evaluateAndFit(missions, 3, 50)!.evaluation;
    expect(r.n).toBeGreaterThan(1000);
    expect(r.model.mae).toBeLessThan(r.seasonalNaive.mae);
    expect(r.residualQ10).toBeLessThan(0);
    expect(r.residualQ90).toBeGreaterThan(0);
  });
});

describe('gate and quantiles', () => {
  const e = (model: number, persistence: number, seasonalNaive: number) => ({
    model: { mae: model, rmse: model },
    persistence: { mae: persistence, rmse: persistence },
    seasonalNaive: { mae: seasonalNaive, rmse: seasonalNaive },
  });

  it('enables only when the model MAE beats BOTH baselines', () => {
    expect(passesGate(e(1, 2, 3))).toBe(true);
    expect(passesGate(e(1, 0.9, 3))).toBe(false);
    expect(passesGate(e(1, 2, 0.9))).toBe(false);
    expect(passesGate(e(1, 1, 3))).toBe(false);
    expect(passesGate(e(1, 2, 1))).toBe(false);
  });

  it('computes linear-interpolated quantiles', () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([0, 10], 0.1)).toBeCloseTo(1, 10);
    expect(quantile([], 0.5)).toBeNaN();
  });
});
