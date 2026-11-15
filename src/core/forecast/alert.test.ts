import { describe, expect, it } from 'vitest';
import { preventiveAlert } from './alert';
import type { ForecastPoint } from './model';

const p = (horizonH: 1 | 3 | 6, value: number, low: number, high: number): ForecastPoint => ({ variable: 'co2', horizonH, value, low, high });

describe('preventiveAlert', () => {
  const limit = { max: 3947 };

  it('is raised for the shortest horizon whose upper bound crosses the NASA maximum', () => {
    const alert = preventiveAlert([p(6, 3900, 3700, 4100), p(3, 3850, 3700, 4000), p(1, 3800, 3700, 3900)], limit, 3800);
    expect(alert).toEqual({ variable: 'co2', horizonH: 3, side: 'above', limit: 3947 });
  });

  it('is not raised when every upper bound stays below the limit', () => {
    expect(preventiveAlert([p(1, 3000, 2900, 3100), p(6, 3000, 2800, 3300)], limit, 3000)).toBeNull();
  });

  it('is not raised once the observed value is already outside the limit (the status tier says so)', () => {
    expect(preventiveAlert([p(1, 4100, 4000, 4200)], limit, 4100)).toBeNull();
  });

  it('also watches the lower bound of a minimum, and needs data and a limit', () => {
    expect(preventiveAlert([p(1, 25, 24, 26)], { min: 25 }, 25.5)).toEqual({ variable: 'co2', horizonH: 1, side: 'below', limit: 25 });
    expect(preventiveAlert([], limit, 3000)).toBeNull();
    expect(preventiveAlert([p(1, 9, 1, 99)], null, 3)).toBeNull();
    expect(preventiveAlert([p(1, 9, 1, 99)], limit, null)).toBeNull();
  });
});
