import type { CabinCalibrationArtifact } from '../calibration/artifact';
import type { ForecastModelArtifact } from './model';
import { FORECAST_VARIABLES } from './types';
import type { ForecastVariable, HorizonH } from './types';

export interface ModelCardHorizon {
  horizonH: HorizonH;
  enabled: boolean;
  modelMae: number;
  persistenceMae: number;
  seasonalNaiveMae: number;
  /** Relative MAE improvement over the better baseline, in percent (negative when the model is worse). */
  improvementPct: number;
  missionsBeatingBoth: number;
  testMissions: number;
  reason: string | null;
}

export interface ModelCardVariable {
  variable: ForecastVariable;
  unit: string;
  trainingMissions: string[];
  /** Days of real ISS telemetry on the 15-minute grid behind the calibration and the training. */
  days: number;
  horizons: ModelCardHorizon[];
}

export interface ModelCard {
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  testMethod: string;
  variables: ModelCardVariable[];
  /** True when at least one horizon is disabled. */
  hasDisabled: boolean;
}

/** The facts of the forecast model that the model card shows, taken straight from the committed artifacts. */
export function buildModelCard(model: ForecastModelArtifact, calibration: CabinCalibrationArtifact): ModelCard {
  const variables = FORECAST_VARIABLES.map((variable): ModelCardVariable => {
    const prov = model.provenance.variables[variable];
    return {
      variable,
      unit: prov.unit,
      trainingMissions: prov.missions.map((m) => m.mission),
      days: calibration.provenance.variables[variable].days,
      horizons: model.variables[variable].horizons.map((h) => {
        const best = Math.min(h.metrics.persistence.mae, h.metrics.seasonalNaive.mae);
        return {
          horizonH: h.horizonH,
          enabled: h.enabled,
          modelMae: h.metrics.model.mae,
          persistenceMae: h.metrics.persistence.mae,
          seasonalNaiveMae: h.metrics.seasonalNaive.mae,
          improvementPct: ((best - h.metrics.model.mae) / best) * 100,
          missionsBeatingBoth: h.metrics.missionsBeatingBoth,
          testMissions: h.metrics.testMissions.length,
          reason: h.enabled ? null : (h.disabledReason ?? 'Test MAE does not beat both baselines.'),
        };
      }),
    };
  });
  return {
    source: model.provenance.source,
    sourceUrl: model.provenance.sourceUrl,
    fetchedAt: model.provenance.fetchedAt,
    testMethod: 'Leave-mission-out: every mission is held out once and never trains the model that is scored on it.',
    variables,
    hasDisabled: variables.some((v) => v.horizons.some((h) => !h.enabled)),
  };
}
