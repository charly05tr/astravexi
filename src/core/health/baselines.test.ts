import { describe, expect, it } from 'vitest';
import { knowledge } from '../../knowledge';
import { daily, steady } from '../../test-support/builders';
import { baselineWindow, computeBaseline, evaluationWindow } from './baselines';
import { buildDailySeries } from './series';

const cfg = knowledge.indicators.find((i) => i.id === 'heartRate')!.baseline!;

function baselineFor(values: number[], asOfDay: number) {
  const s = buildDailySeries(daily('heartRate', values, 1), knowledge.indicators);
  return computeBaseline('heartRate', s.get('heartRate')!, cfg, asOfDay);
}

describe('lagged baseline windows', () => {
  it('never overlaps the evaluation window', () => {
    const [pFrom, pTo] = evaluationWindow(20, cfg);
    const [bFrom, bTo] = baselineWindow(20, cfg);
    expect([pFrom, pTo]).toEqual([16, 20]);
    expect([bFrom, bTo]).toEqual([9, 15]);
    expect(bTo).toBeLessThan(pFrom);
  });

  it('is not pulled by a drift inside the evaluation window', () => {
    const values = [...Array(15).fill(62), 73, 73, 73, 73, 73];
    const b = baselineFor(values, 20);
    expect(b.median).toBe(620);
    expect(b.status).toBe('ready');
  });

  it('computes integer stat-unit statistics', () => {
    const b = baselineFor([60, 61, 62, 63, 64, 60, 64, 70, 70, 70, 70, 70], 12);
    // baseline window for as-of day 12 = days 1..7 -> 60 61 62 63 64 60 64
    expect(b.n).toBe(7);
    expect(b.median).toBe(620);
    expect(b.mad).toBe(20);
    expect(b.mean).toBe(620); // 434 / 7 = 62.0
    expect(Number.isInteger(b.sd)).toBe(true);
  });

  it('is building below minDays (5 of 7)', () => {
    const s = buildDailySeries(steady('heartRate', 62, 1, 4), knowledge.indicators);
    const b = computeBaseline('heartRate', s.get('heartRate')!, cfg, 4 + 5);
    expect(b.n).toBe(4);
    expect(b.status).toBe('building');
  });

  it('is ready at exactly minDays', () => {
    const s = buildDailySeries(steady('heartRate', 62, 1, 5), knowledge.indicators);
    const b = computeBaseline('heartRate', s.get('heartRate')!, cfg, 5 + 5);
    expect(b.n).toBe(5);
    expect(b.status).toBe('ready');
  });
});
