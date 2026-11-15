// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createInitialSymptomReports } from '../body-map/symptom-model';
import { mountApp } from '../../test-support/mount';
import type { ZoneId } from '../../core/health/model';
import {
  ZONE_GLOSSARY,
  ZONE_TRIAGE_QUESTIONS,
  evaluateGuidedTriage,
} from './triage-model';

describe('triage-model differential rules & non-diagnostic safety', () => {
  it('defines screening questions and glossary entries without banned diagnostic phrasing for all 6 zones', () => {
    const banned = /\b(you have|you are suffering|diagnos(is|ed) with|disorder)\b/i;
    const zones: ZoneId[] = ['brain', 'eyes', 'heart', 'immune', 'metabolism', 'bone'];
    for (const z of zones) {
      expect(ZONE_TRIAGE_QUESTIONS[z].length).toBeGreaterThanOrEqual(2);
      expect(ZONE_GLOSSARY[z].length).toBeGreaterThanOrEqual(1);
      for (const q of ZONE_TRIAGE_QUESTIONS[z]) {
        expect(`${q.easyPrompt} ${q.clinicalPrompt}`).not.toMatch(banned);
      }
      for (const term of ZONE_GLOSSARY[z]) {
        expect(`${term.plainTerm} ${term.easyExplanation} ${term.clinicalNote}`).not.toMatch(banned);
      }
    }
  });

  it('escalates from routine/stabilize to urgent when a red-flag screening question is Yes', () => {
    const reports = createInitialSymptomReports();

    const routine = evaluateGuidedTriage({
      zoneId: 'heart',
      zoneStatus: 'none',
      symptomReport: reports.heart,
      envAssessment: null,
      answers: { 'heart-cardiac-redflag': 'no', 'heart-rest-recovery': 'yes' },
    });
    expect(routine.level).toBe('routine');

    const stabilize = evaluateGuidedTriage({
      zoneId: 'brain',
      zoneStatus: 'caution',
      symptomReport: reports.brain,
      envAssessment: null,
      answers: { 'brain-neuro-redflag': 'no' },
    });
    expect(stabilize.level).toBe('stabilize');

    const urgent = evaluateGuidedTriage({
      zoneId: 'brain',
      zoneStatus: 'caution',
      symptomReport: reports.brain,
      envAssessment: null,
      answers: { 'brain-neuro-redflag': 'yes' },
    });
    expect(urgent.level).toBe('urgent');
    expect(urgent.statusEquivalent).toBe('warning');
  });
});

describe('GuidedTriageAction UI integration', () => {
  it('opens guided triage from ZonePanel, toggles Easy read vs Clinical detail, and escalates on red-flag answers', async () => {
    const m = await mountApp('demo');

    const triggerWrap = screen.getByTestId('guided-triage-action');
    await m.user.click(within(triggerWrap).getByRole('button', { name: /guided triage/i }));

    const dialog = screen.getByTestId('triage-dialog');
    const modeGroup = within(dialog).getByRole('group', { name: /reading mode/i });
    expect(within(modeGroup).getByRole('button', { name: 'Easy read' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByText('Short sleep or heavy head')).toBeInTheDocument();

    // Progressive disclosure: switch to Clinical detail for CMO terminology
    await m.user.click(within(modeGroup).getByRole('button', { name: 'Clinical detail' }));
    expect(within(modeGroup).getByRole('button', { name: 'Clinical detail' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByText(/CO2 sensitivity & sleep debt/i)).toBeInTheDocument();

    // Answer Yes to red-flag question -> escalates to Urgent CMO and offers Comms escalation button
    const firstQuestion = dialog.querySelector<HTMLElement>('[data-question-id="brain-neuro-redflag"]')!;
    await m.user.click(within(firstQuestion).getByRole('button', { name: 'Yes' }));

    const protocol = screen.getByTestId('triage-protocol');
    expect(protocol).toHaveAttribute('data-protocol-level', 'urgent');
    expect(within(dialog).getByRole('button', { name: /escalate to cmo in comms/i })).toBeInTheDocument();

    // Resetting answers returns protocol back to Stabilize
    await m.user.click(within(dialog).getByRole('button', { name: /reset answers/i }));
    expect(screen.getByTestId('triage-protocol')).toHaveAttribute('data-protocol-level', 'stabilize');
  }, 15000);
});
