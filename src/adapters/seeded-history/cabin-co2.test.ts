import { describe, expect, it } from 'vitest';
import { createSimulatedCabinCo2 } from './cabin-co2';

const NOW = '2026-06-15T09:07:00.000Z';

describe('simulated cabin CO2', () => {
  it('is deterministic per seed and instant', () => {
    const a = createSimulatedCabinCo2(20260).recent(NOW);
    expect(createSimulatedCabinCo2(20260).recent(NOW)).toEqual(a);
    expect(createSimulatedCabinCo2(1).recent(NOW)).not.toEqual(a);
  });

  it('returns 48 hours of 15-minute samples ending at the current slot', () => {
    const r = createSimulatedCabinCo2(20260).recent(NOW);
    expect(r).toHaveLength(192);
    expect(r[r.length - 1]!.t).toBe('2026-06-15T09:00:00.000Z');
    expect(Date.parse(r[1]!.t) - Date.parse(r[0]!.t)).toBe(15 * 60_000);
  });

  it('extends without changing the past (a later window overlaps the earlier one)', () => {
    const src = createSimulatedCabinCo2(20260);
    const early = src.recent(NOW);
    const later = src.recent('2026-06-15T12:00:00.000Z');
    expect(later.slice(0, early.length - 12)).toEqual(early.slice(12));
  });

  it('stays ISS-like and reaches the attention limit on some days', () => {
    const src = createSimulatedCabinCo2(20260);
    const all = Array.from({ length: 30 }, (_, d) => src.recent(new Date(Date.UTC(2026, 5, 1 + d)).toISOString())).flat();
    const values = all.map((r) => r.ppm);
    expect(Math.min(...values)).toBeGreaterThan(1800);
    expect(Math.max(...values)).toBeLessThan(5500);
    expect(values.some((v) => v > 3947)).toBe(true);
    expect(values.filter((v) => v < 3000).length / values.length).toBeGreaterThan(0.5);
  });
});
