import { describe, expect, it } from 'vitest';
import type { Condition } from '../core/health/model';
import { leavesOf } from '../core/health/rule-engine/conditions';
import { tierRank } from '../core/health/tiers';
import { knowledge, loadKnowledge, risks } from './index';

const SPEC_RULE_IDS = [
  'temp-hyperthermia', 'temp-hypothermia', 'temp-fever-symptomatic', 'temp-shift-explained',
  'temp-above-baseline', 'temp-sustained-high', 'hr-tachy-symptomatic', 'hr-brady-symptomatic',
  'hr-above-baseline', 'bp-crisis-systolic', 'bp-crisis-diastolic', 'bp-stage2-systolic',
  'bp-stage2-diastolic', 'glucose-hypo-l2', 'glucose-low', 'glucose-high', 'glucose-fasting-rising',
  'sleep-mean-low', 'sleep-short-run', 'mood-phq2-positive', 'mood-mean-above-baseline',
];
const BASELINE_KINDS = ['baselineDelta', 'baselinePct', 'robustZ', 'meanVsBaseline'];

describe('rule catalog integrity', () => {
  const { rules, indicators, zones } = knowledge;

  it('contains every rule of the spec table plus the round-2 no-baseline temperature rule', () => {
    expect(rules).toHaveLength(22);
    for (const id of SPEC_RULE_IDS) expect(rules.map((r) => r.id)).toContain(id);
    expect(rules.map((r) => r.id)).toContain('temp-fever-no-baseline');
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
  });

  it('gives every rule a source citation and an explicit needsVerification flag', () => {
    for (const r of rules) {
      expect(r.source.label.length, r.id).toBeGreaterThan(0);
      expect(r.source.url.length, r.id).toBeGreaterThan(0);
      expect(['primary', 'secondary', 'design-inference'], r.id).toContain(r.source.kind);
      expect(typeof r.needsVerification, r.id).toBe('boolean');
    }
  });

  it('has both flagged and unflagged rules', () => {
    expect(rules.some((r) => r.needsVerification)).toBe(true);
    expect(rules.some((r) => !r.needsVerification)).toBe(true);
  });

  it('keeps tier <= maxTier, and only temp-sustained-high declares Caution among layer (c) rules', () => {
    for (const r of rules) expect(tierRank(r.tier), r.id).toBeLessThanOrEqual(tierRank(r.maxTier));
    const aboveNotice = rules.filter((r) => r.layer === 'baseline' && tierRank(r.maxTier) > tierRank('notice'));
    expect(aboveNotice.map((r) => r.id)).toEqual(['temp-sustained-high']);
    expect(aboveNotice[0]!.maxTier).toBe('caution');
  });

  it('keeps layer (a) free of baseline kinds and of expectedShift', () => {
    for (const r of rules.filter((x) => x.layer === 'absolute')) {
      expect(leavesOf(r.condition).some((c: Condition) => BASELINE_KINDS.includes(c.kind)), r.id).toBe(false);
      expect(r.expectedShift, r.id).toBeUndefined();
    }
  });

  it('requires persistence or a window mean for every layer (c) rule', () => {
    for (const r of rules.filter((x) => x.layer === 'baseline')) {
      expect(r.persistence !== undefined || r.condition.kind === 'meanVsBaseline', r.id).toBe(true);
    }
  });

  it('resolves every reference', () => {
    const zoneIds = new Set(zones.map((z) => z.id));
    const indicatorIds = new Set(indicators.map((i) => i.id));
    const riskIds = new Set(risks.map((r) => r.id));
    for (const r of rules) {
      expect(zoneIds.has(r.zoneId), r.id).toBe(true);
      expect(indicatorIds.has(r.indicatorId), r.id).toBe(true);
      expect(riskIds.has(r.riskId), r.id).toBe(true);
      const zone = zones.find((z) => z.id === r.zoneId)!;
      expect(zone.indicatorIds, r.id).toContain(r.indicatorId);
    }
    for (const z of zones) {
      for (const id of z.indicatorIds) expect(indicatorIds.has(id)).toBe(true);
      for (const id of z.riskIds) expect(riskIds.has(id)).toBe(true);
    }
  });

  it('stores thresholds as exact integers in stored units', () => {
    const t = (id: string) => rules.find((r) => r.id === id)!.condition;
    expect(t('temp-hyperthermia')).toMatchObject({ value: 400 });
    expect(t('temp-hypothermia')).toMatchObject({ value: 350 });
    expect(t('temp-above-baseline')).toMatchObject({ value: 5 });
    expect(t('temp-sustained-high')).toMatchObject({ value: 10 });
    expect(t('sleep-mean-low')).toMatchObject({ value: 60 });
    expect(t('hr-above-baseline')).toMatchObject({ value: 15 }); // percent, not scaled
    expect(t('mood-mean-above-baseline')).toMatchObject({ minRise: 1 });
    const shift = rules.find((r) => r.id === 'temp-shift-explained')!.expectedShift!;
    expect(shift).toMatchObject({ value: 10, explainedBelowDelta: 5 });
  });

  it('declares the baseline windows from the spec and minDays 5 of 7', () => {
    const cfg = (id: string) => indicators.find((i) => i.id === id)!.baseline;
    expect(cfg('temperature')).toMatchObject({ windowDays: 7, evalWindowDays: 5, minDays: 5 });
    expect(cfg('heartRate')).toMatchObject({ windowDays: 7, evalWindowDays: 5, minDays: 5 });
    expect(cfg('phq2')).toMatchObject({ windowDays: 28, evalWindowDays: 7 });
    expect(cfg('sleepHours')).toMatchObject({ windowDays: 14, evalWindowDays: 7 });
    expect(cfg('bpSystolic')).toBeUndefined();
    expect(cfg('glucose')).toBeUndefined();
  });

  it('marks mood as tier-only for privacy', () => {
    expect(indicators.find((i) => i.id === 'phq2')!.privacy).toBe('tierOnly');
  });

  it('drops glucose, its rules and the metabolism indicator with the flag off', () => {
    const k = loadKnowledge({ glucose: false });
    expect(k.indicators.some((i) => i.id === 'glucose')).toBe(false);
    expect(k.rules.some((r) => r.indicatorId === 'glucose')).toBe(false);
    expect(k.zones.find((z) => z.id === 'metabolism')!.indicatorIds).toEqual([]);
  });

  it('has exactly the six zones; eyes and bone are unmonitored', () => {
    expect(zones.map((z) => z.id).sort()).toEqual(['bone', 'brain', 'eyes', 'heart', 'immune', 'metabolism']);
    expect(zones.find((z) => z.id === 'eyes')!.indicatorIds).toEqual([]);
    expect(zones.find((z) => z.id === 'bone')!.indicatorIds).toEqual([]);
  });
});
