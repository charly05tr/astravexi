import { describe, expect, it } from 'vitest';
import { cycleAt, fitVariable } from './fit';
import type { HarmonicFit, MissionSegments } from './fit';

/** Deterministic standard normal draws (Box-Muller over a tiny LCG), so synthetic fits are reproducible. */
function normals(seed: number) {
  let s = seed >>> 0;
  const uniform = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s + 1) / 4294967297;
  };
  return () => Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
}

const TRUTH: HarmonicFit[] = [
  { harmonic: 1, amplitude: 5, peakSlot: 30 },
  { harmonic: 2, amplitude: 2, peakSlot: 10 },
];

function mission(name: string, level: number, days: number, seed: number, phi: number, sd: number): MissionSegments {
  const z = normals(seed);
  const innovationSd = sd * Math.sqrt(1 - phi * phi);
  const values: number[] = [];
  let e = 0;
  for (let i = 0; i < days * 96; i += 1) {
    e = phi * e + innovationSd * z();
    values.push(level + cycleAt(TRUTH, i % 96) + e);
  }
  return { mission: name, segments: [{ startSlot: 0, values }] };
}

describe('fitVariable on synthetic series with a known cycle and AR(1) noise', () => {
  const missions = [mission('A', 100, 60, 1, 0.8, 2), mission('B', 110, 60, 2, 0.8, 2), mission('C', 90, 60, 3, 0.8, 2)];
  const fit = fitVariable(missions, { operating: { max: 120 }, comfort: null })!;

  it('recovers the level as the median of the mission medians', () => {
    expect(fit.level).toBeGreaterThan(98);
    expect(fit.level).toBeLessThan(102);
    expect(fit.levelAcrossMissions.min).toBeLessThan(92);
    expect(fit.levelAcrossMissions.max).toBeGreaterThan(108);
  });

  it('recovers both daily harmonics: amplitude and phase', () => {
    const [h1, h2] = fit.cycle;
    expect(h1!.harmonic).toBe(1);
    expect(h1!.amplitude).toBeCloseTo(5, 0);
    expect(Math.abs(h1!.peakSlot - 30)).toBeLessThan(1);
    expect(h2!.harmonic).toBe(2);
    expect(h2!.amplitude).toBeCloseTo(2, 0);
    expect(Math.abs(h2!.peakSlot - 10)).toBeLessThan(1);
  });

  it('recovers the residual sd and the AR(1) coefficient', () => {
    expect(fit.noise.ar1).toBeGreaterThan(0.77);
    expect(fit.noise.ar1).toBeLessThan(0.85);
    expect(fit.noise.sd).toBeGreaterThan(1.8);
    expect(fit.noise.sd).toBeLessThan(2.2);
    expect(fit.noise.innovationSd).toBeCloseTo(fit.noise.sd * Math.sqrt(1 - fit.noise.ar1 ** 2), 10);
  });

  it('describes excursions above each mission own p95', () => {
    expect(fit.excursions.fractionAboveP95).toBeGreaterThan(0.03);
    expect(fit.excursions.fractionAboveP95).toBeLessThan(0.07);
    expect(fit.excursions.episodesPerDay).toBeGreaterThan(0);
    expect(fit.excursions.meanDurationHours).toBeGreaterThan(0);
    expect(fit.excursions.p90PeakExcess).toBeGreaterThanOrEqual(fit.excursions.meanPeakExcess * 0.5);
  });

  it('counts the share of samples outside the operating limit', () => {
    // Mission B sits around 110 with a cycle and noise; the limit of 120 is crossed only sometimes, mission C never.
    expect(fit.limits!.fractionOutsideOperating).toBeGreaterThan(0);
    expect(fit.limits!.fractionOutsideOperating).toBeLessThan(0.15);
    expect(fit.limits!.fractionOutsideComfort).toBeNull();
    expect(fit.days).toBeCloseTo(180, 5);
    expect(fit.missions).toEqual(['A', 'B', 'C']);
  });
});

describe('fitVariable edge cases', () => {
  it('returns null without any data', () => {
    expect(fitVariable([], null)).toBeNull();
    expect(fitVariable([{ mission: 'A', segments: [] }], null)).toBeNull();
  });

  it('never lets noise statistics cross segment gaps', () => {
    // Two segments with very different levels would show strong autocorrelation if joined; here each is flat noise.
    const z = normals(9);
    const seg = (startSlot: number, level: number) => ({ startSlot, values: Array.from({ length: 400 }, () => level + z()) });
    const fit = fitVariable([{ mission: 'A', segments: [seg(0, 10), seg(1000, 10)] }], null)!;
    expect(Math.abs(fit.noise.ar1)).toBeLessThan(0.2);
  });
});
