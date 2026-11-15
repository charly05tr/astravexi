// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createInitialSymptomReports } from '../body-map/symptom-model';
import { createDefaultEnvironmentConfig } from '../environment/environment-model';
import { mountApp } from '../../test-support/mount';
import type { Evaluation, ZoneId } from '../../core/health/model';
import {
  READINESS_DISCLAIMER,
  evaluateMissionReadiness,
} from './readiness-model';

function makeEvaluation(overrides: Partial<Record<ZoneId, 'none' | 'notice' | 'caution' | 'warning'>> = {}): Evaluation {
  const mk = (zoneId: ZoneId) => ({
    zoneId,
    status: (overrides[zoneId] ?? 'none') as Evaluation['zones'][ZoneId]['status'],
    findings: [],
    corroborated: false,
  });
  return {
    asOf: { day: 150, t: 150 * 1440 },
    zones: {
      brain: mk('brain'),
      eyes: mk('eyes'),
      heart: mk('heart'),
      metabolism: mk('metabolism'),
      bone: mk('bone'),
      immune: mk('immune'),
    },
    highest: 'none',
    audiences: ['astronaut'],
    indicatorStatus: {} as Evaluation['indicatorStatus'],
  };
}

describe('readiness-model semaphore & task translation', () => {
  it('returns green when zones, symptoms, and cabin parameters are nominal', () => {
    const res = evaluateMissionReadiness({
      evaluation: makeEvaluation(),
      environment: createDefaultEnvironmentConfig('base'),
      symptomReports: createInitialSymptomReports(),
    });
    expect(res.level).toBe('green');
    expect(res.activities.map((a) => a.id)).toEqual(['eva', 'robotics', 'exercise', 'maintenance']);
    expect(res.activities.every((a) => a.clearance === 'go')).toBe(true);
    expect(res.disclaimer).toBe(READINESS_DISCLAIMER);
  });

  it('returns yellow and Mitigation clearances on Caution / elevated cabin CO2', () => {
    const res = evaluateMissionReadiness({
      evaluation: makeEvaluation({ brain: 'caution' }),
      environment: createDefaultEnvironmentConfig('rover'),
      symptomReports: createInitialSymptomReports(),
    });
    expect(res.level).toBe('yellow');
    const eva = res.activities.find((a) => a.id === 'eva')!;
    const robotics = res.activities.find((a) => a.id === 'robotics')!;
    expect(eva.clearance).toBe('mitigate');
    expect(robotics.clearance).toBe('mitigate');
  });

  it('escalates to red and Stand down clearances on Warning, SPE, or chest-tightness symptom', () => {
    const speEnv = { ...createDefaultEnvironmentConfig('transit'), speActive: true };
    const speRes = evaluateMissionReadiness({
      evaluation: makeEvaluation(),
      environment: speEnv,
      symptomReports: createInitialSymptomReports(),
    });
    expect(speRes.level).toBe('red');
    expect(speRes.activities.find((a) => a.id === 'eva')!.clearance).toBe('hold');

    const chestReports = {
      ...createInitialSymptomReports(),
      heart: { zoneId: 'heart' as const, discomfort: 7, tags: ['chest-tightness'] },
    };
    const chestRes = evaluateMissionReadiness({
      evaluation: makeEvaluation(),
      environment: createDefaultEnvironmentConfig('station'),
      symptomReports: chestReports,
    });
    expect(chestRes.level).toBe('red');
    expect(chestRes.activities.find((a) => a.id === 'exercise')!.clearance).toBe('hold');
  });
});

describe('Role views & Readiness UI integration', () => {
  it('supports switching between All, Crew, and CMO views inside the single-row header and shows task translations', async () => {
    const m = await mountApp('demo');

    const roleGroup = screen.getByRole('group', { name: /role profile/i });
    expect(within(roleGroup).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('role-banner')).toBeNull();

    // Demo day 150 starts at Yellow due to brain Caution findings
    const trigger = screen.getByTestId('readiness-trigger');
    expect(trigger).toHaveAttribute('data-readiness-level', 'yellow');

    await m.user.click(within(roleGroup).getByRole('button', { name: 'Crew' }));
    expect(screen.getByTestId('role-banner')).toHaveAttribute('data-role', 'crew');

    await m.user.click(within(roleGroup).getByRole('button', { name: 'CMO' }));
    const cmoBanner = screen.getByTestId('role-banner');
    expect(cmoBanner).toHaveAttribute('data-role', 'cmo');

    // Open Readiness modal and inspect all 4 activity clearances
    await m.user.click(trigger);
    const dialog = screen.getByTestId('readiness-dialog');
    expect(within(dialog).getByText('EVA / Spacewalk')).toBeInTheDocument();
    expect(within(dialog).getByText('Robotics & Piloting')).toBeInTheDocument();
    expect(within(dialog).getByText('Exercise (ARED / SPRINT)')).toBeInTheDocument();
    expect(within(dialog).getByText('Cabin Maintenance')).toBeInTheDocument();
    expect(within(dialog).getByText(/does not substitute official flight surgeon/i)).toBeInTheDocument();
    await m.user.click(screen.getByRole('button', { name: /close mission readiness/i }));

    // Trigger SPE to confirm semaphore escalates to Red in real time
    await m.user.click(screen.getByTestId('habitat-trigger'));
    await m.user.click(within(screen.getByTestId('environment-dialog')).getByLabelText(/solar particle event/i));
    await m.user.click(within(screen.getByTestId('environment-dialog')).getByRole('button', { name: /^done$/i }));
    expect(screen.getByTestId('readiness-trigger')).toHaveAttribute('data-readiness-level', 'red');

    // Jump to Comms from CMO banner and verify readiness card appears cleanly
    await m.user.click(within(screen.getByTestId('role-banner')).getByRole('button', { name: /triage/i }));
    expect(screen.getByTestId('comms-readiness')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /crew medical officer/i })).toBeInTheDocument();
  }, 15000);
});
