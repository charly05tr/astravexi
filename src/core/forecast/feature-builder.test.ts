import { describe, expect, it } from 'vitest';
import { buildFeatures, FEATURE_NAMES, LAGS, MIN_HISTORY } from './feature-builder';

const ramp = (n: number, step = 1, start = 0) => Array.from({ length: n }, (_, i) => start + i * step);

describe('buildFeatures', () => {
  it('needs the minimum history and returns null below it', () => {
    expect(buildFeatures(ramp(MIN_HISTORY - 1), 0)).toBeNull();
    expect(buildFeatures(ramp(MIN_HISTORY), 0)).not.toBeNull();
  });

  it('has one value per named feature, in the documented order', () => {
    const f = buildFeatures(ramp(20), 10)!;
    expect(f).toHaveLength(FEATURE_NAMES.length);
    expect(FEATURE_NAMES[0]).toBe('value');
    expect(FEATURE_NAMES.at(-1)).toBe('time_of_day_cos');
  });

  it('is the current value, the lagged differences, the slope per hour and the time of day', () => {
    // A ramp of +2 per 15-minute slot: now = 38, lag k gives 38 - 2k, so the difference is -2k.
    const history = ramp(20, 2);
    const f = buildFeatures(history, 24)!;
    expect(f[0]).toBe(38);
    LAGS.forEach((k, i) => expect(f[1 + i]).toBe(-2 * k));
    // Slope: 2 per slot = 8 per hour.
    expect(f[1 + LAGS.length]).toBeCloseTo(8, 10);
    // Slot 24 of a day of 96 is 06:00: sin = 1, cos = 0.
    expect(f.at(-2)).toBeCloseTo(1, 10);
    expect(f.at(-1)).toBeCloseTo(0, 10);
  });

  it('wraps the time of day by the absolute slot, including negative slots', () => {
    const history = ramp(20);
    const a = buildFeatures(history, 5)!;
    const b = buildFeatures(history, 5 + 96 * 3)!;
    const c = buildFeatures(history, 5 - 96)!;
    expect(b.slice(-2)).toEqual(a.slice(-2));
    expect(c[c.length - 2]).toBeCloseTo(a[a.length - 2]!, 10);
  });

  it('only reads the tail of the history: extra older values change nothing', () => {
    const tail = ramp(MIN_HISTORY, 3, 100);
    expect(buildFeatures([999, 5, ...tail], 7)).toEqual(buildFeatures(tail, 7));
  });
});
