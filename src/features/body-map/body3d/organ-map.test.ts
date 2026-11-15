import { describe, expect, it } from 'vitest';
import { createRuleSuggestionProvider } from '../../../adapters/rule-suggestions';
import { content } from '../../../knowledge';
import type { SuggestionContext } from '../../../core/ports';
import { meshesOfZone, pickZone } from './organ-map';

describe('organ picking', () => {
  it('passes through the skull to the brain behind it', () => {
    expect(pickZone(['Skull', 'Brain', 'Skull'])).toBe('brain');
  });

  it('passes through the ribcage to the heart', () => {
    expect(pickZone(['Ribcage', 'ArteriasMesh', 'Heart', 'Spine'])).toBe('heart');
  });

  it('picks the bone when nothing is behind the shell', () => {
    expect(pickZone(['Skull'])).toBe('bone');
    expect(pickZone(['Legs'])).toBe('bone');
  });

  it('does not select through an organ that has no zone', () => {
    expect(pickZone(['HumanLungs', 'Spine'])).toBeNull();
  });

  it('ignores unknown meshes', () => {
    expect(pickZone(['Helper', 'Liver'])).toBe('metabolism');
  });

  it('keeps every mesh opaque for the systemic immune zone', () => {
    expect(meshesOfZone('immune').has('Skull')).toBe(true);
    expect(meshesOfZone('brain')).toEqual(new Set(['Brain']));
  });
});

describe('rule suggestion provider', () => {
  const provider = createRuleSuggestionProvider(content.recommendations);
  const id = [...content.recommendations.keys()][0]!;
  const context = (decisions: SuggestionContext['decisions'] = []): SuggestionContext => ({
    zone: { id: 'brain', label: 'Brain', status: 'caution' },
    missionDay: 150,
    findings: [
      { key: 'f1', ruleId: 'r', indicatorId: 'sleepHours', indicatorLabel: 'Sleep', tier: 'caution', whatChanged: 'Lower.', recommendationIds: [id, 'missing'] },
    ],
    decisions,
  });

  it('returns the curated recommendations of each finding and skips unknown ids', async () => {
    const out = await provider.suggest(context());
    expect(out.map((s) => s.id)).toEqual([id]);
    expect(out[0]!.origin).toBe('rules');
    expect(out[0]!.rationale).toContain('Sleep');
  });

  it('drops dismissed and marks accepted suggestions', async () => {
    const decision = (d: 'accepted' | 'dismissed') => [{ id: 'd', recommendationId: id, findingKey: 'f1', decision: d, t: 0 }];
    expect(await provider.suggest(context(decision('dismissed')))).toEqual([]);
    expect((await provider.suggest(context(decision('accepted'))))[0]!.decision).toBe('accepted');
  });
});
