import { describe, expect, it } from 'vitest';
import { cleanRows, resampleToSegments } from './prepare';
import type { CleaningRule } from './prepare';
import { CLEANING_RULES } from './rules';

const rule: CleaningRule = { min: 350, max: 10000, placeholders: [2000, 3000], maxFlatMin: 30, description: 'test' };
const iso = (minute: number) => `2020-01-01T${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00Z`;
const rows = (values: unknown[], stepMin = 5) => values.map((value, i) => ({ time: iso(i * stepMin), value }));

describe('cleanRows', () => {
  it('drops nulls, non-numbers, unparsable times, placeholders and out-of-range values, and counts each reason', () => {
    const input = [
      { time: iso(0), value: 2500 },
      { time: iso(5), value: null },
      { time: iso(10), value: 'x' },
      { time: 'not a time', value: 2600 },
      { time: iso(15), value: 2000 },
      { time: iso(20), value: 3000 },
      { time: iso(25), value: 128 },
      { time: iso(30), value: 20000 },
      { time: iso(35), value: 2700 },
    ];
    const r = cleanRows(input, rule);
    expect(r.points.map((p) => p.value)).toEqual([2500, 2700]);
    expect(r.rawRows).toBe(9);
    expect(r.dropped).toMatchObject({ null: 1, notFinite: 1, badTime: 1, placeholder: 2, outOfRange: 2, duplicateTime: 0, flatline: 0 });
  });

  it('keeps one value per minute and sorts by time', () => {
    const r = cleanRows(
      [
        { time: iso(10), value: 2600 },
        { time: iso(5), value: 2500 },
        { time: iso(10), value: 2700 },
      ],
      rule,
    );
    expect(r.points.map((p) => p.value)).toEqual([2500, 2600]);
    expect(r.dropped.duplicateTime).toBe(1);
  });

  it('drops a stuck sensor (identical values for at least the flat limit) but keeps shorter repeats', () => {
    // 5-minute cadence: seven identical readings span 30 minutes.
    const stuck = cleanRows(rows([2500, 2500, 2500, 2500, 2500, 2500, 2500, 2600, 2610]), rule);
    expect(stuck.points.map((p) => p.value)).toEqual([2600, 2610]);
    expect(stuck.dropped.flatline).toBe(7);
    const brief = cleanRows(rows([2500, 2500, 2500, 2600]), rule);
    expect(brief.points).toHaveLength(4);
  });

  it('applies the documented rules of the real variables', () => {
    expect(cleanRows(rows([500, 2000, 3000, 250, 128, 2511]), CLEANING_RULES.co2).points.map((p) => p.value)).toEqual([2511]);
    expect(cleanRows(rows([14.3, 22.1, 40]), CLEANING_RULES.cabinTemperature).points.map((p) => p.value)).toEqual([22.1]);
    expect(cleanRows(rows([125.8, 41, 3]), CLEANING_RULES.humidity).points.map((p) => p.value)).toEqual([41]);
    // Quantised temperature may stay flat for hours: not a stuck sensor.
    expect(cleanRows(rows(new Array(100).fill(23)), CLEANING_RULES.cabinTemperature).points).toHaveLength(100);
  });
});

describe('resampleToSegments', () => {
  const pts = (minutes: number[], value = (m: number) => m) => minutes.map((m) => ({ tMin: m, value: value(m) }));
  const opts = { maxFillSlots: 2, minSlots: 3 };

  it('averages the points inside each 15-minute slot', () => {
    const [seg] = resampleToSegments(pts([0, 5, 10, 15, 20, 25, 30, 35, 40], (m) => m), opts);
    // Slot 0 = mean(0, 5, 10), slot 1 = mean(15, 20, 25), slot 2 = mean(30, 35, 40).
    expect(seg!.values).toEqual([5, 20, 35]);
    expect(seg!.startSlot).toBe(0);
  });

  it('bridges a gap of at most the fill limit by linear interpolation', () => {
    // Slots 0, 1, then 4 (two empty slots: 2 and 3), then 5.
    const segs = resampleToSegments(pts([0, 15, 60, 75], (m) => m), { maxFillSlots: 2, minSlots: 1 });
    expect(segs).toHaveLength(1);
    expect(segs[0]!.values).toEqual([0, 15, 30, 45, 60, 75]);
  });

  it('never interpolates across a longer gap: it splits into contiguous segments', () => {
    // Slot 0..2, then slot 6 (three empty slots), then 7..9.
    const segs = resampleToSegments(pts([0, 15, 30, 90, 105, 120]), { maxFillSlots: 2, minSlots: 1 });
    expect(segs).toHaveLength(2);
    expect(segs[0]).toEqual({ startSlot: 0, values: [0, 15, 30] });
    expect(segs[1]).toEqual({ startSlot: 6, values: [90, 105, 120] });
  });

  it('discards segments shorter than the minimum', () => {
    const segs = resampleToSegments(pts([0, 15, 300, 315, 330, 345]), { maxFillSlots: 2, minSlots: 3 });
    expect(segs).toHaveLength(1);
    expect(segs[0]!.startSlot).toBe(20);
  });
});
