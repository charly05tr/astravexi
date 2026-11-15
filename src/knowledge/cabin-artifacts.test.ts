import { describe, expect, it } from 'vitest';
import { cabinCalibration, cabinForecastModel } from '.';
import { FEATURE_NAMES, MIN_HISTORY } from '../core/forecast/feature-builder';
import { forecastVariable } from '../core/forecast/model';
import type { ForecastModelArtifact } from '../core/forecast/model';
import { FORECAST_VARIABLES, HORIZONS_H, SLOT_MIN } from '../core/forecast/types';
import type { ForecastVariable } from '../core/forecast/types';

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

describe('cabin-forecast-model.json', () => {
  const model = cabinForecastModel;

  it('has the documented schema, provenance and one entry per variable and horizon', () => {
    expect(model.schemaVersion).toBe(1);
    expect(model.provenance.sourceUrl).toMatch(/^https:\/\/visualization\.osdr\.nasa\.gov\//);
    expect(model.provenance.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(model.provenance.evaluation).toMatch(/leave-mission-out/i);
    expect(model.provenance.radiation).toMatch(/not used/i);
    for (const v of FORECAST_VARIABLES) {
      const prov = model.provenance.variables[v];
      expect(prov.missions.length).toBeGreaterThanOrEqual(3);
      expect(prov.rawRows).toBeGreaterThanOrEqual(prov.cleanRows);
      expect(prov.days).toBeGreaterThan(0);
      expect(prov.cleaningRules.length).toBeGreaterThan(20);
      expect(model.variables[v].horizons.map((h) => h.horizonH)).toEqual([...HORIZONS_H]);
    }
  });

  it('uses the same feature spec as the code that builds features (no train/serve skew)', () => {
    expect(model.featureSpec.featureNames).toEqual([...FEATURE_NAMES]);
    expect(model.featureSpec.minHistorySlots).toBe(MIN_HISTORY);
    expect(model.featureSpec.slotMinutes).toBe(SLOT_MIN);
  });

  it('stores finite coefficients, a lambda, an ordered interval and metrics for every horizon', () => {
    for (const v of FORECAST_VARIABLES) {
      for (const h of model.variables[v].horizons) {
        expect(h.coefficients).toHaveLength(FEATURE_NAMES.length);
        expect(h.coefficients.every(finite)).toBe(true);
        expect(finite(h.intercept)).toBe(true);
        expect(h.lambda).toBeGreaterThan(0);
        expect(h.interval.q10).toBeLessThan(0);
        expect(h.interval.q90).toBeGreaterThan(0);
        for (const m of [h.metrics.model, h.metrics.persistence, h.metrics.seasonalNaive]) {
          expect(m.mae).toBeGreaterThan(0);
          expect(m.rmse).toBeGreaterThanOrEqual(m.mae);
        }
        expect(h.metrics.testMissions.length).toBeGreaterThanOrEqual(3);
        expect(h.metrics.n).toBeGreaterThan(1000);
      }
    }
  });

  it('enables a horizon only if its stored test MAE beats BOTH baselines, and explains every disabled one', () => {
    let enabled = 0;
    for (const v of FORECAST_VARIABLES) {
      for (const h of model.variables[v].horizons) {
        const beatsBoth = h.metrics.model.mae < h.metrics.persistence.mae && h.metrics.model.mae < h.metrics.seasonalNaive.mae;
        expect(h.enabled, `${v} ${h.horizonH} h`).toBe(beatsBoth);
        if (h.enabled) enabled += 1;
        else expect(h.disabledReason).toMatch(/does not beat/);
      }
    }
    expect(enabled).toBeGreaterThan(0);
  });
});

describe('inference from the committed artifact', () => {
  const flat = (value: number, n = 48) => Array.from({ length: n }, (_, i) => ({ t: 1000 * 15 + i * SLOT_MIN, value }));
  const typical: Record<ForecastVariable, number> = { co2: 3000, cabinTemperature: 22.5, humidity: 41 };

  it('returns only enabled horizons, each with an interval around the value', () => {
    for (const v of FORECAST_VARIABLES) {
      const points = forecastVariable(cabinForecastModel, v, flat(typical[v]));
      const enabledHorizons = cabinForecastModel.variables[v].horizons.filter((h) => h.enabled).map((h) => h.horizonH);
      expect(points.map((p) => p.horizonH)).toEqual(enabledHorizons);
      for (const p of points) {
        expect(p.low).toBeLessThan(p.value);
        expect(p.high).toBeGreaterThan(p.value);
        expect(Math.abs(p.value - typical[v])).toBeLessThan(Math.abs(p.high - p.low) * 3);
      }
    }
  });

  it('is pure and deterministic', () => {
    const a = forecastVariable(cabinForecastModel, 'co2', flat(3000));
    expect(forecastVariable(cabinForecastModel, 'co2', flat(3000))).toEqual(a);
  });

  it('gives nothing when there is no series, too little history, or a gap in the latest stretch', () => {
    expect(forecastVariable(cabinForecastModel, 'co2', [])).toEqual([]);
    expect(forecastVariable(cabinForecastModel, 'co2', flat(3000, MIN_HISTORY - 1))).toEqual([]);
    const gapped = [...flat(3000, 20), ...flat(3000, 5).map((p) => ({ ...p, t: p.t + 100 * SLOT_MIN }))];
    expect(forecastVariable(cabinForecastModel, 'co2', gapped)).toEqual([]);
  });

  it('never returns a disabled horizon, even if the artifact carries coefficients for it', () => {
    const tampered: ForecastModelArtifact = structuredClone(cabinForecastModel);
    for (const h of tampered.variables.co2.horizons) h.enabled = false;
    expect(forecastVariable(tampered, 'co2', flat(3000))).toEqual([]);
  });
});

describe('cabin-calibration.json', () => {
  const cal = cabinCalibration;

  it('has the documented schema and provenance for every variable', () => {
    expect(cal.schemaVersion).toBe(1);
    expect(cal.provenance.sourceUrl).toMatch(/osdr\.nasa\.gov/);
    expect(cal.provenance.gridMinutes).toBe(15);
    for (const v of FORECAST_VARIABLES) {
      const p = cal.variables[v];
      expect(cal.provenance.variables[v].days).toBeGreaterThan(100);
      expect(p.missions.length).toBeGreaterThanOrEqual(3);
      expect(p.days).toBeGreaterThan(100);
      expect(finite(p.level)).toBe(true);
      expect(p.cycle.map((c) => c.harmonic)).toEqual([1, 2]);
      for (const c of p.cycle) {
        expect(c.amplitude).toBeGreaterThanOrEqual(0);
        expect(c.peakSlot).toBeGreaterThanOrEqual(0);
        expect(c.peakSlot).toBeLessThan(96 / c.harmonic);
      }
      expect(p.noise.sd).toBeGreaterThan(0);
      expect(p.noise.ar1).toBeGreaterThan(-1);
      expect(p.noise.ar1).toBeLessThan(1);
      expect(p.noise.innovationSd).toBeLessThan(p.noise.sd);
      expect(p.bounds.low).toBeLessThan(p.level);
      expect(p.bounds.high).toBeGreaterThan(p.level);
      expect(p.excursions.fractionAboveP95).toBeGreaterThan(0);
      expect(p.excursions.fractionAboveP95).toBeLessThan(0.1);
      expect(p.limits).not.toBeNull();
    }
  });

  it('shares its data days with the forecast model provenance', () => {
    for (const v of FORECAST_VARIABLES) {
      expect(cal.provenance.variables[v].days).toBe(cabinForecastModel.provenance.variables[v].days);
    }
  });
});
