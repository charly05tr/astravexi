import { describe, expect, it } from 'vitest';
import { knowledge } from '../../knowledge';
import { DEMO_CLOCK_START_OFFSET_MIN, DEMO_DAY, FIRST_DAY, generate, mulberry32 } from './index';

describe('mulberry32', () => {
  it('is deterministic and stays in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i += 1) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('seeded history', () => {
  const SEED = 20260;
  const h = generate(SEED, DEMO_DAY);

  it('spans days 121-150 with 7 readings a day, all SYNTHETIC and at rest', () => {
    expect(h).toHaveLength(30 * 7);
    expect(Math.min(...h.map((r) => r.day))).toBe(FIRST_DAY);
    expect(Math.max(...h.map((r) => r.day))).toBe(150);
    expect(h.every((r) => r.source === 'SYNTHETIC' && r.context === 'rest' && !r.symptomatic)).toBe(true);
  });

  it('is deterministic: the same seed gives identical data, another seed does not', () => {
    expect(generate(SEED, DEMO_DAY)).toEqual(h);
    expect(generate(SEED + 1, DEMO_DAY)).not.toEqual(h);
  });

  it('extends deterministically: day 151 leaves days 121-150 untouched', () => {
    const next = generate(SEED, 151);
    expect(next.slice(0, h.length)).toEqual(h);
    expect(next).toHaveLength(31 * 7);
    expect(generate(SEED, 151)).toEqual(next);
  });

  it('stores integers within each indicator range', () => {
    for (const r of h) {
      const ind = knowledge.indicators.find((i) => i.id === r.indicatorId)!;
      expect(Number.isInteger(r.value)).toBe(true);
      expect(r.value).toBeGreaterThanOrEqual(ind.min * ind.unitScale);
      expect(r.value).toBeLessThanOrEqual(ind.max * ind.unitScale);
    }
  });

  it('stamps every reading strictly before that day 08:00 clock start', () => {
    for (const r of h) {
      expect(r.t).toBeLessThan((r.day - 1) * 1440 + DEMO_CLOCK_START_OFFSET_MIN);
      expect(r.t).toBeGreaterThanOrEqual((r.day - 1) * 1440 + 360);
    }
  });

  it('groups each seeded day as one check-in', () => {
    const groups = new Set(h.map((r) => r.groupId));
    expect(groups.size).toBe(30);
  });

  it('injects the scenario: sleep never at or below 5.0 h, drift only inside the evaluation windows', () => {
    const sleep = h.filter((r) => r.indicatorId === 'sleepHours');
    expect(Math.min(...sleep.filter((r) => r.day >= 144).map((r) => r.value))).toBeGreaterThan(50);
    expect(sleep.filter((r) => r.day < 144).every((r) => r.value >= 62 && r.value <= 68)).toBe(true);
    const hr = h.filter((r) => r.indicatorId === 'heartRate');
    expect(hr.filter((r) => r.day < 146).every((r) => r.value >= 61 && r.value <= 63)).toBe(true);
    expect(hr.filter((r) => r.day >= 146).every((r) => r.value >= 73)).toBe(true);
    const temp = h.filter((r) => r.indicatorId === 'temperature');
    expect(temp.every((r) => r.value >= 376 && r.value <= 378)).toBe(true);
  });
});
