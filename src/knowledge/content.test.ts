import { describe, expect, it } from 'vitest';
import { content, knowledge } from './index';

describe('explanation content integrity', () => {
  it('has a template for every rule, keyed by rule id (templateId = rule id)', () => {
    for (const rule of knowledge.rules) {
      expect(content.templates.has(rule.templateId), rule.id).toBe(true);
      expect(rule.templateId).toBe(rule.id);
    }
  });

  it('has three non-empty parts in every template and resolvable recommendation ids', () => {
    for (const t of content.templates.values()) {
      expect(t.whatChanged.length, t.id).toBeGreaterThan(0);
      expect(t.whyItMatters.length, t.id).toBeGreaterThan(0);
      expect(t.whatToDo.length, t.id).toBeGreaterThan(0);
      for (const id of t.recommendationIds) expect(content.recommendations.has(id), `${t.id}:${id}`).toBe(true);
    }
    for (const ids of Object.values(content.corroboration.recommendationIdsByZone)) {
      for (const id of ids) expect(content.recommendations.has(id), id).toBe(true);
    }
  });

  it('has no template without a rule', () => {
    const ruleIds = new Set(knowledge.rules.map((r) => r.id));
    for (const id of content.templates.keys()) expect(ruleIds.has(id), id).toBe(true);
  });

  it('phrases recommendations as proposals with an evidence citation', () => {
    expect(content.recommendations.size).toBeGreaterThanOrEqual(6);
    for (const r of content.recommendations.values()) {
      expect(r.evidence.label.length, r.id).toBeGreaterThan(0);
      expect(r.steps.length, r.id).toBeGreaterThan(0);
      expect(typeof r.needsVerification).toBe('boolean');
    }
  });

  it('keeps diagnosis language out of every template', () => {
    const banned = /\b(you have|you are suffering|diagnos(is|ed) with|disorder)\b/i;
    for (const t of content.templates.values()) {
      expect(`${t.whatChanged} ${t.whyItMatters} ${t.whatToDo}`, t.id).not.toMatch(banned);
    }
  });
});
