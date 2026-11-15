/**
 * Solves A x = b for a small dense symmetric positive definite system by Gaussian elimination with partial pivoting.
 * Returns null when the matrix is singular.
 */
export function solveLinearSystem(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    if (Math.abs(m[pivot]![col]!) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    for (let r = col + 1; r < n; r += 1) {
      const f = m[r]![col]! / m[col]![col]!;
      for (let c = col; c <= n; c += 1) m[r]![c] = m[r]![c]! - f * m[col]![c]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r -= 1) {
    let s = m[r]![n]!;
    for (let c = r + 1; c < n; c += 1) s -= m[r]![c]! * x[c]!;
    x[r] = s / m[r]![r]!;
  }
  return x;
}

export interface RidgeFit {
  /** One coefficient per feature, on the original (unstandardized) feature scale. */
  coefficients: number[];
  intercept: number;
}

/**
 * Ridge regression by the normal equations on centered data: minimise |y - Xw - b|^2 + lambda |w|^2, with the
 * intercept b left unpenalised. Features are standardised internally (so one lambda treats them alike) and the
 * result is mapped back to the original scale. Returns null when there are no rows or the system is singular.
 */
export function fitRidge(x: readonly (readonly number[])[], y: readonly number[], lambda: number): RidgeFit | null {
  const n = x.length;
  if (n === 0 || n !== y.length) return null;
  const p = x[0]!.length;
  const mean = new Array<number>(p).fill(0);
  for (const row of x) for (let j = 0; j < p; j += 1) mean[j] = mean[j]! + row[j]! / n;
  const scale = new Array<number>(p).fill(0);
  for (const row of x) for (let j = 0; j < p; j += 1) scale[j] = scale[j]! + (row[j]! - mean[j]!) ** 2 / n;
  for (let j = 0; j < p; j += 1) scale[j] = Math.sqrt(scale[j]!) || 1;
  const yMean = y.reduce((s, v) => s + v, 0) / n;

  const gram: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const xty = new Array<number>(p).fill(0);
  const z = new Array<number>(p).fill(0);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < p; j += 1) z[j] = (x[i]![j]! - mean[j]!) / scale[j]!;
    const yc = y[i]! - yMean;
    for (let j = 0; j < p; j += 1) {
      xty[j] = xty[j]! + z[j]! * yc;
      for (let k = j; k < p; k += 1) gram[j]![k] = gram[j]![k]! + z[j]! * z[k]!;
    }
  }
  for (let j = 0; j < p; j += 1) {
    for (let k = 0; k < j; k += 1) gram[j]![k] = gram[k]![j]!;
    gram[j]![j] = gram[j]![j]! + lambda;
  }
  const w = solveLinearSystem(gram, xty);
  if (!w) return null;
  const coefficients = w.map((wj, j) => wj / scale[j]!);
  const intercept = yMean - coefficients.reduce((s, c, j) => s + c * mean[j]!, 0);
  return { coefficients, intercept };
}

export const predictRidge = (fit: RidgeFit, features: readonly number[]): number =>
  fit.coefficients.reduce((s, c, j) => s + c * features[j]!, fit.intercept);
