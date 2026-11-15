import { describe, expect, it } from 'vitest';
import { isNewer, laterOf, parseIso, tsMs } from './time';

describe('parseIso', () => {
  it('returns the epoch milliseconds (Z, offsets, fractions, leap years, before 1970)', () => {
    const expected: Array<[string, number]> = [
      ['1970-01-01T00:00:00Z', 0],
      ['2026-06-01T10:00:00.123Z', 1780308000123],
      ['2026-06-01T10:00:00.123456Z', 1780308000123], // microseconds are truncated to milliseconds
      ['2026-06-01T10:00:00+02:00', 1780300800000],
      ['2026-06-01T10:00:00-05:30', 1780327800000],
      ['2026-06-01T10:00:00-0530', 1780327800000],
      ['2024-02-29T23:59:59.999Z', 1709251199999],
      ['2100-03-01T00:00:00Z', 4107542400000],
      ['1969-12-31T23:59:59Z', -1000],
      ['2026-12-31T23:59:59.5Z', 1798761599500],
    ];
    for (const [iso, ms] of expected) expect(parseIso(iso), iso).toBe(ms);
  });

  it('rejects things that are not a full ISO timestamp with a timezone', () => {
    for (const s of ['', 'nope', '2026-06-01', '2026-06-01T10:00:00', '2026-13-01T00:00:00Z', null, undefined]) {
      expect(parseIso(s as string), String(s)).toBeNull();
    }
  });
});

describe('time helpers', () => {
  it('compare instants, not strings', () => {
    expect(isNewer('2026-06-01T10:00:00.124Z', '2026-06-01T10:00:00.123456Z')).toBe(true);
    expect(isNewer('2026-06-01T10:00:00.123Z', '2026-06-01T10:00:00.123000Z')).toBe(false);
    expect(isNewer('2026-06-01T12:00:00+02:00', '2026-06-01T10:00:00Z')).toBe(false);
  });

  it('treats unparsable values as the epoch', () => {
    expect(tsMs('garbage')).toBe(0);
    expect(isNewer('garbage', '2026-06-01T10:00:00Z')).toBe(false);
    expect(isNewer('2026-06-01T10:00:00Z', 'garbage')).toBe(true);
  });

  it('laterOf ignores nulls and keeps the first on a tie', () => {
    expect(laterOf(null, null)).toBeNull();
    expect(laterOf('2026-06-01T10:00:00Z', null)).toBe('2026-06-01T10:00:00Z');
    expect(laterOf('2026-06-01T10:00:00Z', '2026-06-02T10:00:00Z')).toBe('2026-06-02T10:00:00Z');
    expect(laterOf('2026-06-01T10:00:00.000Z', '2026-06-01T10:00:00Z')).toBe('2026-06-01T10:00:00.000Z');
  });
});
