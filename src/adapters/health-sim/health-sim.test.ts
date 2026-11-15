import { describe, expect, it } from 'vitest';
import { seededMinute } from '../seeded-history';
import { HEALTH_SIM_PARAMS, SIM_INDICATORS, drawTraits, generatePersonReadings } from '.';
import type { SimParam } from '.';
import { knowledge } from '../../knowledge';

function allParams(): Array<[string, SimParam]> {
  const out: Array<[string, SimParam]> = Object.entries(HEALTH_SIM_PARAMS.global);
  for (const id of SIM_INDICATORS) {
    const p = HEALTH_SIM_PARAMS.indicators[id];
    out.push([`${id}.baselineMean`, p.baselineMean], [`${id}.baselineBetweenSd`, p.baselineBetweenSd], [`${id}.withinSd`, p.withinSd]);
    out.push([`${id}.ar1`, p.ar1], [`${id}.measurementSd`, p.measurementSd]);
    if (p.circadian) for (const [k, v] of Object.entries(p.circadian)) out.push([`${id}.circadian.${k}`, v]);
  }
  return out;
}

describe('health simulator parameters', () => {
  it('covers every monitored indicator', () => {
    expect([...SIM_INDICATORS].sort()).toEqual(knowledge.indicators.map((i) => i.id).sort());
  });

  it('gives every parameter a source or an explicit assumption flag, never neither', () => {
    for (const [name, p] of allParams()) {
      const sourced = typeof p.source === 'string' && p.source.length > 0;
      expect(sourced || p.assumption === true, `${name} has neither a source nor assumption: true`).toBe(true);
      expect(typeof p.assumption, name).toBe('boolean');
    }
  });
});

describe('health simulator', () => {
  const traits = drawTraits(42, 0);
  const days = generatePersonReadings(42, traits, 121, 200);

  it('is deterministic and extends without changing the past', () => {
    expect(generatePersonReadings(42, traits, 121, 200)).toEqual(days);
    expect(generatePersonReadings(42, traits, 121, 150)).toEqual(days.filter((r) => r.day <= 150));
    expect(drawTraits(43, 0)).not.toEqual(traits);
    expect(drawTraits(42, 1)).not.toEqual(traits);
  });

  it('emits one SYNTHETIC rest reading per indicator per day on the app schedule (within the time jitter)', () => {
    expect(days).toHaveLength(80 * SIM_INDICATORS.length);
    const max = HEALTH_SIM_PARAMS.global.readingTimeJitterClampMin.value;
    for (const r of days) {
      expect(r.source).toBe('SYNTHETIC');
      expect(r.context).toBe('rest');
      expect(Math.abs(r.t - seededMinute(r.day, r.indicatorId))).toBeLessThanOrEqual(max);
      expect(Number.isInteger(r.value)).toBe(true);
    }
  });

  it('keeps values inside the indicator ranges and PHQ-2 on its 0-6 scale', () => {
    for (const r of days) {
      const ind = knowledge.indicators.find((i) => i.id === r.indicatorId)!;
      expect(r.value).toBeGreaterThanOrEqual(ind.min * ind.unitScale);
      expect(r.value).toBeLessThanOrEqual(ind.max * ind.unitScale);
    }
  });

  it('realises the declared day-to-day SD of heart rate (sanity, wide tolerance)', () => {
    const long = generatePersonReadings(7, drawTraits(7, 0), 1, 2000).filter((r) => r.indicatorId === 'heartRate');
    const mean = long.reduce((s, r) => s + r.value, 0) / long.length;
    const sd = Math.sqrt(long.reduce((s, r) => s + (r.value - mean) ** 2, 0) / long.length);
    expect(sd / drawTraits(7, 0).totalSd.heartRate).toBeGreaterThan(0.85);
    expect(sd / drawTraits(7, 0).totalSd.heartRate).toBeLessThan(1.15);
  });

  it('adds an injection only on its days and indicator', () => {
    const shifted = generatePersonReadings(42, traits, 121, 200, [{ indicatorId: 'heartRate', fromDay: 150, toDay: 151, delta: 20 }]);
    const changed = shifted.filter((r, i) => r.value !== days[i]!.value);
    expect(changed.map((r) => `${r.day}:${r.indicatorId}`)).toEqual(['150:heartRate', '151:heartRate']);
    for (const r of changed) expect(r.value - days.find((d) => d.id === r.id)!.value).toBeGreaterThanOrEqual(19);
  });

  it('shows the circadian temperature component: later reading times read warmer', () => {
    const early = generatePersonReadings(5, drawTraits(5, 0), 1, 3000).filter((r) => r.indicatorId === 'temperature');
    const byOffset = (sign: number) => {
      const xs = early.filter((r) => Math.sign(r.t - seededMinute(r.day, 'temperature')) === sign).map((r) => r.value);
      return xs.reduce((s, v) => s + v, 0) / xs.length;
    };
    expect(byOffset(1)).toBeGreaterThan(byOffset(-1));
  });
});
