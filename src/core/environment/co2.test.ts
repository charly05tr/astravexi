import { describe, expect, it } from 'vitest';
import { CO2_OPS_LIMITS, assessCo2, cleanReadings, mmHgToPpm, percentile, ppmToMmHg, summarizeReference } from './co2';

/** `i`-th five-minute instant from 2019-12-03T10:24:00Z (stays within the same day for i < 150). */
const at = (i: number) => {
  const m = 10 * 60 + 24 + i * 5;
  return `2019-12-03T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00Z`;
};

describe('cabin CO2 conversions and limits', () => {
  it('converts mmHg and ppm at 1 atm = 760 mmHg', () => {
    expect(mmHgToPpm(3)).toBeCloseTo(3947.37, 1);
    expect(ppmToMmHg(mmHgToPpm(5.3))).toBeCloseTo(5.3, 10);
    expect(CO2_OPS_LIMITS.attention.ppm).toBeLessThan(CO2_OPS_LIMITS.high.ppm);
  });

  it('carries a source and a verification flag on every limit, like a knowledge rule', () => {
    for (const limit of Object.values(CO2_OPS_LIMITS)) {
      expect(limit.source.url).toMatch(/^https:\/\/(www\.nasa\.gov|ntrs\.nasa\.gov)\//);
      expect(limit.needsVerification).toBe(true);
    }
  });
});

describe('summarizeReference', () => {
  it('drops placeholders and gaps, and takes the p95 as the threshold', () => {
    const values = [128, 2511, 2644, 2655, 2793, 2825, 2665, Number.NaN, 20_000];
    const ref = summarizeReference('RR-19', 'https://example.test/', values.map((ppm, i) => ({ t: at(i), ppm })))!;
    expect(ref.count).toBe(6); // 128 (below ambient), NaN and 20000 (above range) are not air
    expect(ref.maxPpm).toBe(2825);
    expect(ref.thresholdPpm).toBe(2825); // nearest rank: ceil(0.95 * 6) = 6th of 6
    expect(ref.medianPpm).toBe(2655);
    expect(ref.meanPpm).toBe(2682);
    expect(ref.from).toBe(at(1));
    expect(ref.to).toBe(at(6));
  });

  it('is null when nothing plausible remains', () => {
    expect(summarizeReference('RR-23', 'u', [{ t: at(0), ppm: Number.NaN }])).toBeNull();
    expect(summarizeReference('RR-23', 'u', [])).toBeNull();
  });

  it('puts the p95 below the maximum when a spike exists', () => {
    const series = Array.from({ length: 100 }, (_, i) => ({ t: at(i), ppm: i === 99 ? 6000 : 2500 + i }));
    const ref = summarizeReference('X', 'u', series)!;
    expect(ref.maxPpm).toBe(6000);
    expect(ref.thresholdPpm).toBe(2594);
  });

  it('sorts by time and percentile handles the edges', () => {
    expect(cleanReadings([{ t: at(2), ppm: 500 }, { t: at(1), ppm: 600 }]).map((r) => r.ppm)).toEqual([600, 500]);
    expect(percentile([1, 2, 3, 4], 1)).toBe(4);
    expect(percentile([1, 2, 3, 4], 0.01)).toBe(1);
  });
});

describe('assessCo2', () => {
  const threshold = 2986;
  it('is below with no findings under the threshold', () => {
    expect(assessCo2(2500, threshold)).toMatchObject({ position: 'below', deltaPpm: -486, status: 'none' });
  });
  it('is at the threshold within 50 ppm', () => {
    expect(assessCo2(3020, threshold)).toMatchObject({ position: 'at', deltaPpm: 34, status: 'none' });
  });
  it('is a notice above the reference, a caution above the attention limit and a warning above the high limit', () => {
    expect(assessCo2(3300, threshold)).toMatchObject({ position: 'above', status: 'notice' });
    expect(assessCo2(4000, threshold)).toMatchObject({ position: 'above', status: 'caution' });
    expect(assessCo2(7000, threshold)).toMatchObject({ position: 'above', status: 'warning' });
  });
  it('reports the value in mmHg', () => {
    expect(assessCo2(3947.37, threshold).valueMmHg).toBeCloseTo(3, 2);
  });
});
