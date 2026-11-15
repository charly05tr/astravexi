import { describe, expect, it } from 'vitest';
import type { Indicator } from '../../core/health/model';
import type { Suggestion, SuggestionContext, SuggestionFinding } from '../../core/ports';
import { reading } from '../../test-support/builders';
import { CONTEXT_DAYS, buildFollowUpContext } from './follow-up-context';

const indicators = [
  { id: 'sleepHours', label: 'Sleep', unit: 'h', unitScale: 10, privacy: 'shareable' },
  { id: 'phq2', label: 'Mood', unit: 'pts', unitScale: 1, privacy: 'tierOnly' },
] as Indicator[];

const accepted: Suggestion = {
  id: 'rec-1',
  findingKey: 'f1',
  title: 'Keep a fixed lights-out time',
  steps: ['Set an alarm'],
  rationale: 'Sleep: fell',
  evidence: null,
  needsVerification: false,
  origin: 'rules',
  decision: 'accepted',
};

const sleep: SuggestionFinding = { key: 'f1', ruleId: 'r1', indicatorId: 'sleepHours', indicatorLabel: 'Sleep', tier: 'caution', whatChanged: 'Fell.', recommendationIds: ['rec-1'] };
const mood: SuggestionFinding = { key: 'f2', ruleId: 'r2', indicatorId: 'phq2', indicatorLabel: 'Mood', tier: 'notice', whatChanged: 'Low mood score.', recommendationIds: ['rec-1'] };
const other: SuggestionFinding = { key: 'f3', ruleId: 'r3', indicatorId: 'sleepHours', indicatorLabel: 'Other', tier: 'notice', whatChanged: 'x', recommendationIds: ['rec-2'] };

const contextOf = (...findings: SuggestionFinding[]): SuggestionContext => ({
  zone: { id: 'brain', label: 'Brain', status: 'caution' },
  missionDay: 20,
  decisions: [],
  findings,
});

describe('buildFollowUpContext', () => {
  it('keeps recent shareable readings in display units and drops old readings and mood', () => {
    const out = buildFollowUpContext({
      accepted,
      context: contextOf(sleep, mood, other),
      indicators,
      readings: [
        reading('sleepHours', 5.5, 20),
        reading('sleepHours', 7, 20 - CONTEXT_DAYS), // outside the window
        reading('phq2', 4, 20),
      ],
    })!;
    expect(out.readings).toEqual([{ indicator: 'Sleep', unit: 'h', value: 5.5, day: 20, context: 'rest' }]);
    expect(out.accepted).toMatchObject({ id: 'rec-1', title: 'Keep a fixed lights-out time' });
  });

  it('never sends a tierOnly finding: not its label, tier or explanation', () => {
    const out = buildFollowUpContext({ accepted, context: contextOf(sleep, mood), indicators, readings: [] })!;
    expect(out.findings.map((f) => f.indicatorLabel)).toEqual(['Sleep']);
    expect(JSON.stringify(out)).not.toMatch(/Mood|Low mood score|notice/);
  });

  it('rebuilds the rationale from a shareable finding when the accepted suggestion came from a private one', () => {
    const fromMood: Suggestion = { ...accepted, findingKey: 'f2', rationale: 'Mood: Low mood score.' };
    const out = buildFollowUpContext({ accepted: fromMood, context: contextOf(mood, sleep), indicators, readings: [] })!;
    expect(out.accepted.rationale).toBe('Sleep: Fell.');
    expect(JSON.stringify(out)).not.toMatch(/Mood|Low mood score/);
  });

  it('returns null when the recommendation answers only private findings, so nothing is sent', () => {
    const fromMood: Suggestion = { ...accepted, findingKey: 'f2', rationale: 'Mood: Low mood score.' };
    expect(buildFollowUpContext({ accepted: fromMood, context: contextOf(mood), indicators, readings: [] })).toBeNull();
  });

  it('keeps a zone-level (corroboration) finding that has no indicator', () => {
    const zoneLevel: SuggestionFinding = { key: 'corroboration:brain', ruleId: null, indicatorId: null, indicatorLabel: 'Brain: two signals', tier: 'caution', whatChanged: 'Two sustained signals.', recommendationIds: ['rec-1'] };
    const out = buildFollowUpContext({ accepted, context: contextOf(zoneLevel), indicators, readings: [] })!;
    expect(out.findings.map((f) => f.indicatorLabel)).toEqual(['Brain: two signals']);
  });
});
