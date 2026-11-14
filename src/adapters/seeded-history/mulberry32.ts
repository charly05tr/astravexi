/** mulberry32: a small, fast, deterministic PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [lo, hi] inclusive. */
export function randInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** Mix a seed with a day number so each day has its own independent stream. */
export function daySeed(seed: number, day: number): number {
  return (seed ^ Math.imul(day + 0x9e3779b9, 0x85ebca6b)) >>> 0;
}
