import { describe, expect, it } from 'vitest';
import { knowledge } from '../../knowledge';
import { reading } from '../../test-support/builders';
import { buildDailySeries, prepareReadings } from './series';

const ind = knowledge.indicators;
const valueOf = (m: ReturnType<typeof buildDailySeries>, id: Parameters<typeof m.get>[0], day: number) =>
  m.get(id)?.find((v) => v.day === day);

describe('daily series', () => {
  it('uses resting readings only for context-aware indicators', () => {
    const rs = [
      reading('temperature', 37.7, 5, { minute: 400 }),
      reading('temperature', 40.5, 5, { context: 'exercise', minute: 900 }),
    ];
    const s = buildDailySeries(rs, ind);
    expect(valueOf(s, 'temperature', 5)?.value).toBe(377);
  });

  it('keeps exercise-only days out of the series', () => {
    const s = buildDailySeries([reading('heartRate', 120, 5, { context: 'exercise' })], ind);
    expect(s.get('heartRate')).toEqual([]);
  });

  it('ranks MANUAL above SYNTHETIC even when the synthetic reading is later', () => {
    const rs = [
      reading('heartRate', 73, 5, { source: 'MANUAL', minute: 400 }),
      reading('heartRate', 62, 5, { source: 'SYNTHETIC', minute: 900 }),
    ];
    const v = valueOf(buildDailySeries(rs, ind), 'heartRate', 5);
    expect(v?.value).toBe(73);
    expect(v?.source).toBe('MANUAL');
  });

  it('takes the latest reading within the same source', () => {
    const rs = [
      reading('heartRate', 60, 5, { minute: 400 }),
      reading('heartRate', 64, 5, { minute: 800 }),
    ];
    expect(valueOf(buildDailySeries(rs, ind), 'heartRate', 5)?.value).toBe(64);
  });

  it('never overwrites or mutates the input readings', () => {
    const rs = [
      reading('heartRate', 73, 5, { source: 'MANUAL' }),
      reading('heartRate', 62, 5, { source: 'SYNTHETIC', minute: 100 }),
    ];
    const copy = structuredClone(rs);
    buildDailySeries(rs, ind);
    expect(rs).toEqual(copy);
    expect(rs).toHaveLength(2);
  });
});

describe('prepareReadings', () => {
  it('drops readings after the as-of instant and sorts by day, t, id', () => {
    const a = reading('glucose', 90, 3);
    const b = reading('glucose', 91, 2);
    const late = reading('glucose', 92, 4, { minute: 900 });
    const out = prepareReadings([a, late, b], { day: 4, t: 3 * 1440 + 800 });
    expect(out.map((r) => r.day)).toEqual([2, 3]);
  });
});
