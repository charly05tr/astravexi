import { describe, expect, it } from 'vitest';
import { cabinKnowledge, knowledge } from './index';

describe('cabin knowledge integrity', () => {
  it('cites every variable and every link with a NASA URL', () => {
    for (const v of cabinKnowledge.variables) {
      expect(v.source.url, v.id).toMatch(/^https:\/\/(www\.nasa\.gov|ntrs\.nasa\.gov|standards\.nasa\.gov)\//);
      expect(typeof v.needsVerification).toBe('boolean');
    }
    for (const l of cabinKnowledge.links) {
      expect(l.source.url, `${l.variable}:${l.indicatorId}`).toMatch(/^https:\/\/(www\.nasa\.gov|ntrs\.nasa\.gov|standards\.nasa\.gov)\//);
      expect(l.effect.length).toBeGreaterThan(0);
      expect(l.lagMin).toBeGreaterThan(0);
    }
  });

  it('links only known variables to monitored indicators', () => {
    const variables = new Set(cabinKnowledge.variables.map((v) => v.id));
    const indicators = new Set(knowledge.indicators.map((i) => i.id as string));
    for (const l of cabinKnowledge.links) {
      expect(variables.has(l.variable)).toBe(true);
      expect(indicators.has(l.indicatorId)).toBe(true);
    }
    for (const id of indicators) expect(cabinKnowledge.config.spreadFloor[id as 'heartRate'], id).toBeGreaterThan(0);
  });

  it('keeps radiation as context: a cumulative limit, no operating range, no link to any indicator', () => {
    const dose = cabinKnowledge.variables.find((v) => v.id === 'radiationDose')!;
    expect(dose.contextOnly).toBe(true);
    expect(dose.operating).toBeNull();
    expect(dose.cumulativeLimit).toBe(600);
    expect(cabinKnowledge.links.some((l) => l.variable === 'radiationDose')).toBe(false);
  });

  it('carries the NASA-STD-3001 ranges for temperature and humidity', () => {
    const get = (id: string) => cabinKnowledge.variables.find((v) => v.id === id)!;
    expect(get('cabinTemperature').operating).toEqual({ min: 18, max: 27 });
    expect(get('cabinTemperature').comfort).toEqual({ min: 20, max: 25 });
    expect(get('humidity').operating).toEqual({ min: 25, max: 75 });
    expect(get('humidity').comfort).toEqual({ min: 30, max: 60 });
    expect(get('co2').operating).toEqual({ max: 3947 });
  });
});
