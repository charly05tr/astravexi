import { describe, expect, it } from 'vitest';
import { roundHalfAway, toStat, toStored } from './rounding';

describe('roundHalfAway', () => {
  it.each([
    [0.5, 1],
    [1.5, 2],
    [2.5, 3],
    [-0.5, -1],
    [-2.5, -3],
    [0.49, 0],
    [0, 0],
    [-0.2, 0],
  ])('rounds %s to %s', (input, expected) => {
    expect(roundHalfAway(input)).toBe(expected);
  });

  it('absorbs floating-point error', () => {
    expect(roundHalfAway(620 * 1.15)).toBe(713);
    expect(roundHalfAway(0.1 + 0.2 - 0.3 + 71.99999999999)).toBe(72);
    expect(roundHalfAway(37.7 * 10)).toBe(377);
    expect(roundHalfAway(38.2 * 10)).toBe(382);
  });
});

describe('storage units', () => {
  it('stores temperature and sleep in tenths, everything else whole', () => {
    expect(toStored(37.7, 10)).toBe(377);
    expect(toStored(6.5, 10)).toBe(65);
    expect(toStored(62, 1)).toBe(62);
  });

  it('converts stored to stat units without drift', () => {
    expect(toStat(377)).toBe(3770);
  });

  it('keeps the 38.1 vs 38.2 boundary exact against a 37.7 baseline', () => {
    const baseline = toStat(toStored(37.7, 10));
    expect(toStat(toStored(38.1, 10)) - baseline).toBe(40);
    expect(toStat(toStored(38.2, 10)) - baseline).toBe(50);
  });
});
