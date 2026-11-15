import { describe, expect, it } from 'vitest';
import { fitRidge, predictRidge, solveLinearSystem } from './ridge';

describe('solveLinearSystem', () => {
  it('solves a known 3x3 system', () => {
    // 2x + y - z = 8; -3x - y + 2z = -11; -2x + y + 2z = -3  ->  x = 2, y = 3, z = -1
    const x = solveLinearSystem(
      [
        [2, 1, -1],
        [-3, -1, 2],
        [-2, 1, 2],
      ],
      [8, -11, -3],
    )!;
    expect(x[0]).toBeCloseTo(2, 10);
    expect(x[1]).toBeCloseTo(3, 10);
    expect(x[2]).toBeCloseTo(-1, 10);
  });

  it('needs row pivoting and still solves', () => {
    const x = solveLinearSystem(
      [
        [0, 2],
        [3, 1],
      ],
      [4, 5],
    )!;
    expect(x[0]).toBeCloseTo(1, 10);
    expect(x[1]).toBeCloseTo(2, 10);
  });

  it('returns null for a singular matrix', () => {
    expect(
      solveLinearSystem(
        [
          [1, 2],
          [2, 4],
        ],
        [1, 2],
      ),
    ).toBeNull();
  });
});

describe('fitRidge', () => {
  it('recovers an exact linear relation with lambda 0 (OLS)', () => {
    const x: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const a = i;
      const b = (i * 7) % 5;
      x.push([a, b]);
      y.push(5 + 2 * a - 3 * b);
    }
    const fit = fitRidge(x, y, 0)!;
    expect(fit.intercept).toBeCloseTo(5, 8);
    expect(fit.coefficients[0]).toBeCloseTo(2, 8);
    expect(fit.coefficients[1]).toBeCloseTo(-3, 8);
    expect(predictRidge(fit, [4, 1])).toBeCloseTo(5 + 8 - 3, 8);
  });

  it('matches the closed-form ridge solution on a one-feature example', () => {
    // x = 1, 2, 3 and y = 2, 4, 6. Standardised feature z = (x - 2) / sqrt(2/3), sum of z^2 = n = 3.
    // Slope on the original scale = 6 / (3 + lambda); the intercept keeps the means: 4 - slope * 2.
    const x = [[1], [2], [3]];
    const y = [2, 4, 6];
    const ols = fitRidge(x, y, 0)!;
    expect(ols.coefficients[0]).toBeCloseTo(2, 10);
    const ridge = fitRidge(x, y, 3)!;
    expect(ridge.coefficients[0]).toBeCloseTo(1, 10);
    expect(ridge.intercept).toBeCloseTo(2, 10);
    // A very large lambda shrinks the slope to 0 and predicts the mean of y.
    const flat = fitRidge(x, y, 1e12)!;
    expect(flat.coefficients[0]).toBeCloseTo(0, 6);
    expect(flat.intercept).toBeCloseTo(4, 6);
  });

  it('does not penalise the intercept: a constant shift of y moves only the intercept', () => {
    const x = [[0], [1], [2], [3]];
    const a = fitRidge(x, [1, 2, 3, 4], 2)!;
    const b = fitRidge(x, [11, 12, 13, 14], 2)!;
    expect(b.coefficients[0]).toBeCloseTo(a.coefficients[0]!, 10);
    expect(b.intercept - a.intercept).toBeCloseTo(10, 10);
  });

  it('handles a constant feature without blowing up and returns null without data', () => {
    const fit = fitRidge([[1, 5], [2, 5], [3, 5]], [2, 4, 6], 1)!;
    expect(Number.isFinite(fit.coefficients[1]!)).toBe(true);
    expect(fitRidge([], [], 1)).toBeNull();
  });
});
