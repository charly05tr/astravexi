/** 95% Wilson score interval for a proportion k/n, as fractions. Null when n is 0. */
export function wilson95(k: number, n: number): { lo: number; hi: number } | null {
  if (n <= 0) return null;
  const z = 1.959964;
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

/** Rounds to 4 decimals so committed JSON is stable across platforms. */
export const round4 = (x: number): number => Math.round(x * 10000) / 10000;
