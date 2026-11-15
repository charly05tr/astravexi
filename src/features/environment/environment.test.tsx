// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { knowledge, nasaDatasets } from '../../knowledge';
import { mountApp } from '../../test-support/mount';
import { buildSymptomLlmSuggestions } from '../body-map/symptom-advisor';
import type { ZonePanelModel } from '../insights/zone-panel-model';
import {
  CO2_ATTENTION_MMHG,
  RADIATION_ELEVATED_MSV_DAY,
  co2PpmFromMmHg,
  computeAccumulatedMsv,
  createDefaultEnvironmentConfig,
  evaluateZoneEnvironment,
} from './environment-model';

const SAMPLE_PANEL_MODEL: ZonePanelModel = {
  zoneId: 'brain',
  label: 'Brain',
  functionSummary: 'Sleep, mood & cognition.',
  monitored: true,
  status: 'none',
  findings: [],
  corroboration: null,
  suggestionFindings: [],
  indicators: [],
};

describe('nasaDatasets catalog', () => {
  it('exposes OSDR OSD-569, OSD-575, RadLab and OCHMO-TB-004 benchmarks mapped to valid zones', () => {
    const validZones = new Set(knowledge.zones.map((z) => z.id));
    expect(nasaDatasets.map((d) => d.id)).toEqual(['osdr-569', 'osdr-575', 'radlab-msl', 'ochmo-tb-004']);
    for (const ds of nasaDatasets) {
      expect(ds.source.url).toMatch(/^https:\/\//);
      expect(ds.zoneIds.length).toBeGreaterThan(0);
      for (const z of ds.zoneIds) expect(validZones.has(z)).toBe(true);
    }
  });
});

describe('environment-model attribution & LLM feeding', () => {
  it('distinguishes environmental factors from intrinsic physiological signals', () => {
    const rover = createDefaultEnvironmentConfig('rover');
    expect(rover.ppCo2MmHg).toBeGreaterThanOrEqual(CO2_ATTENTION_MMHG);

    const envOnly = evaluateZoneEnvironment({
      zoneId: 'eyes',
      zoneStatus: 'unmonitored',
      findingsCount: 0,
      hasSymptoms: true,
      missionDay: 150,
      config: rover,
    });
    expect(envOnly.attribution).toBe('environmental');
    expect(envOnly.badgeLabel).toBe('Env factor');
    expect(envOnly.drivers.some((d) => d.includes('ppCO2'))).toBe(true);

    const mixed = evaluateZoneEnvironment({
      zoneId: 'brain',
      zoneStatus: 'caution',
      findingsCount: 2,
      hasSymptoms: true,
      missionDay: 150,
      config: rover,
    });
    expect(mixed.attribution).toBe('mixed');
    expect(mixed.badgeLabel).toBe('Env + intrinsic');

    const station = createDefaultEnvironmentConfig('station');
    const intrinsicOnly = evaluateZoneEnvironment({
      zoneId: 'brain',
      zoneStatus: 'caution',
      findingsCount: 2,
      hasSymptoms: false,
      missionDay: 150,
      config: station,
    });
    expect(intrinsicOnly.attribution).toBe('intrinsic');
    expect(intrinsicOnly.drivers).toHaveLength(0);
  });

  it('adds +18 mSv storm transient and switches immune attribution during an active SPE', () => {
    const baseCfg = createDefaultEnvironmentConfig('station');
    expect(baseCfg.radiationMsvDay).toBeLessThan(RADIATION_ELEVATED_MSV_DAY);

    const nominal = evaluateZoneEnvironment({
      zoneId: 'immune',
      zoneStatus: 'none',
      findingsCount: 0,
      hasSymptoms: false,
      missionDay: 100,
      config: baseCfg,
    });
    expect(nominal.attribution).toBe('nominal');
    expect(nominal.accumulatedMsv).toBe(computeAccumulatedMsv(100, baseCfg.radiationMsvDay, false));

    const speCfg = { ...baseCfg, speActive: true };
    const speAssessment = evaluateZoneEnvironment({
      zoneId: 'immune',
      zoneStatus: 'none',
      findingsCount: 0,
      hasSymptoms: false,
      missionDay: 100,
      config: speCfg,
    });
    expect(speAssessment.attribution).toBe('environmental');
    expect(speAssessment.accumulatedMsv).toBe(Number((nominal.accumulatedMsv + 18).toFixed(1)));
    expect(speAssessment.benchmark?.code).toBe('RadLab / MSL-RAD');
  });

  it('feeds active habitat telemetry directly into the simulated LLM symptom suggestion', () => {
    const rover = createDefaultEnvironmentConfig('rover');
    const items = buildSymptomLlmSuggestions({
      model: SAMPLE_PANEL_MODEL,
      symptomReport: { zoneId: 'brain', discomfort: 4, tags: ['co2-headache'] },
      missionDay: 150,
      decisions: [],
      environment: rover,
    });
    expect(items).toHaveLength(1);
    const suggestion = items[0]!;
    expect(suggestion.rationales?.some((r) => r.includes('Pressurized rover') && r.includes(`${co2PpmFromMmHg(rover.ppCo2MmHg)} ppm`))).toBe(true);
    expect(suggestion.steps[0]).toMatch(/mitigate active habitat factor/i);
  });
});

describe('Environment simulator & Sources UI integration', () => {
  it('configures habitat presets on the dashboard, updates ZonePanel attribution, and lists NASA datasets in Sources', async () => {
    const m = await mountApp('demo');

    const trigger = screen.getByTestId('habitat-trigger');
    expect(trigger).toHaveTextContent(/Transit/i);
    expect(screen.getByTestId('env-attribution')).toHaveTextContent(/Intrinsic signal/i);

    await m.user.click(trigger);
    const dialog = screen.getByTestId('environment-dialog');
    await m.user.click(within(dialog).getByRole('button', { name: /pressurized rover/i }));
    await m.user.click(within(dialog).getByLabelText(/solar particle event/i));
    await m.user.click(within(dialog).getByRole('button', { name: /^done$/i }));

    expect(screen.getByTestId('habitat-trigger')).toHaveTextContent(/Rover.*3\.4 mmHg.*SPE/i);
    expect(screen.getByTestId('env-attribution')).toHaveTextContent(/Env \+ intrinsic/i);

    // Open Zone detail to verify NASA benchmark section
    await m.user.click(screen.getByRole('button', { name: /view details/i }));
    expect(screen.getByRole('heading', { name: /nasa reference benchmark/i })).toBeInTheDocument();
    await m.user.click(screen.getByRole('button', { name: /close details/i }));

    // Verify Sources view shows NASA OSDR / RadLab table cleanly
    await m.user.click(screen.getByRole('button', { name: /^sources$/i }));
    expect(document.querySelectorAll('tr[data-dataset-id]')).toHaveLength(4);
    expect(screen.getByText('OSD-569')).toBeInTheDocument();
    expect(screen.getByText('OSD-575')).toBeInTheDocument();
  });
});
