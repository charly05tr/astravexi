import { describe, expect, it } from 'vitest';
import { cabinCalibration, cabinKnowledge } from '../../knowledge';
import { createSimulatedCabinTimeline } from './cabin-timeline';

const DAY = 1440;

describe('simulated cabin timeline (mission time)', () => {
  it('is deterministic per seed and minute, and steps in 15-minute slots', () => {
    const a = createSimulatedCabinTimeline(20260).samples(100 * DAY, 101 * DAY);
    expect(createSimulatedCabinTimeline(20260).samples(100 * DAY, 101 * DAY)).toEqual(a);
    expect(createSimulatedCabinTimeline(1).samples(100 * DAY, 101 * DAY)).not.toEqual(a);
    expect(a[1]!.t - a[0]!.t).toBe(15);
  });

  it('extends without changing the past', () => {
    const src = createSimulatedCabinTimeline(20260);
    const early = src.samples(100 * DAY, 100 * DAY + 600);
    const later = src.samples(100 * DAY, 100 * DAY + 900);
    expect(later.slice(0, early.length)).toEqual(early);
  });

  it('keeps nominal values ISS-like and inside the NASA operating and comfort ranges outside scripted episodes', () => {
    // Days 100-126 hold no scripted cabin episode.
    const samples = createSimulatedCabinTimeline(20260).samples(100 * DAY, 126 * DAY);
    for (const def of cabinKnowledge.variables.filter((v) => v.operating)) {
      const values = samples.map((s) => s.values[def.id]!);
      expect(Math.min(...values), def.id).toBeGreaterThanOrEqual(def.comfort?.min ?? def.operating!.min ?? 0);
      expect(Math.max(...values), def.id).toBeLessThanOrEqual(def.comfort?.max ?? def.operating!.max!);
    }
    const co2 = samples.map((s) => s.values.co2!);
    expect(Math.min(...co2)).toBeGreaterThan(1800);
  });

  it('crosses the limits only inside the scripted episodes', () => {
    const heat = createSimulatedCabinTimeline(20260).samples(131 * DAY + 22 * 60, 132 * DAY + 6 * 60);
    expect(heat.every((s) => s.values.cabinTemperature! > 27)).toBe(true);
  });

  it('accumulates radiation dose as a running total', () => {
    const [a, b] = [createSimulatedCabinTimeline(1).samples(10 * DAY, 10 * DAY), createSimulatedCabinTimeline(1).samples(20 * DAY, 20 * DAY)];
    expect(b[0]!.values.radiationDose!).toBeGreaterThan(a[0]!.values.radiationDose!);
  });
});

describe('calibrated nominal cabin (real ISS telemetry)', () => {
  const cal = cabinCalibration.variables;
  const nominal = createSimulatedCabinTimeline(20260).samples(100 * DAY, 126 * DAY);

  it('sits at the calibrated level with the fitted spread, not at the old invented constants', () => {
    for (const [key, id] of [
      ['co2', 'co2'],
      ['cabinTemperature', 'cabinTemperature'],
      ['humidity', 'humidity'],
    ] as const) {
      const values = nominal.map((s) => s.values[id]!);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      expect(Math.abs(mean - cal[key].level), key).toBeLessThan(cal[key].noise.sd * 2);
      expect(Math.min(...values), key).toBeGreaterThanOrEqual(cal[key].bounds.low - 1);
      expect(Math.max(...values), key).toBeLessThanOrEqual(cal[key].bounds.high + 1);
    }
  });

  it('is autocorrelated like the real residual (AR(1)), not white noise', () => {
    for (const id of ['co2', 'cabinTemperature', 'humidity'] as const) {
      const v = nominal.map((s) => s.values[id]!);
      const mean = v.reduce((a, b) => a + b, 0) / v.length;
      let num = 0;
      let den = 0;
      for (let i = 1; i < v.length; i += 1) {
        num += (v[i]! - mean) * (v[i - 1]! - mean);
        den += (v[i - 1]! - mean) ** 2;
      }
      expect(num / den, id).toBeGreaterThan(0.9);
    }
  });

  it('does not depend on the requested range: the same slot gives the same value', () => {
    const src = createSimulatedCabinTimeline(20260);
    const whole = src.samples(100 * DAY, 100 * DAY + 600);
    const piece = createSimulatedCabinTimeline(20260).samples(100 * DAY + 300, 100 * DAY + 600);
    expect(whole.slice(whole.length - piece.length)).toEqual(piece);
  });
});
