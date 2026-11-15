import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fitVariable } from '../../src/core/calibration/fit';
import type { MissionSegments, VariableCalibration } from '../../src/core/calibration/fit';
import { evaluateAndFit, passesGate } from '../../src/core/forecast/evaluate';
import { FEATURE_NAMES, MIN_HISTORY } from '../../src/core/forecast/feature-builder';
import type { ForecastModelArtifact, HorizonModel, MissionRange, VariableProvenance } from '../../src/core/forecast/model';
import { FORECAST_VARIABLES, HORIZONS_H, SLOT_MIN } from '../../src/core/forecast/types';
import type { ForecastVariable } from '../../src/core/forecast/types';
import cabin from '../../src/knowledge/cabin.json';
import { GRID_PATH } from './prepare-grid';
import type { GridFile } from './prepare-grid';

const KNOWLEDGE = join('src', 'knowledge');
const CABIN_ID: Record<ForecastVariable, string> = { co2: 'co2', cabinTemperature: 'cabinTemperature', humidity: 'humidity' };
const UNIT: Record<ForecastVariable, { unit: string; note: string }> = {
  co2: { unit: 'ppm', note: 'Documented by NASA OSDR (parts per million).' },
  cabinTemperature: {
    unit: 'degrees Celsius',
    note: 'Not stated on the EDA reference page; inferred from the magnitude (cabin median 22 C, NASA limit 18-27 C).',
  },
  humidity: {
    unit: 'percent relative humidity',
    note: 'Not stated on the EDA reference page; inferred from the magnitude (median 38-49) and the 0-100 range.',
  },
};

/** Rounds to `digits` significant digits so the committed JSON stays small and diff-friendly. */
const sig = (x: number, digits = 6): number => (Number.isFinite(x) && x !== 0 ? Number(x.toPrecision(digits)) : x);
const roundDeep = <T>(v: T): T =>
  JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'number' ? sig(x) : x))) as T;

function missionsOf(grid: GridFile, variable: ForecastVariable): MissionSegments[] {
  return Object.entries(grid.grid[variable]).map(([mission, segments]) => ({ mission, segments }));
}

function variableProvenance(grid: GridFile, variable: ForecastVariable): VariableProvenance {
  const missions: MissionRange[] = [];
  let raw = 0;
  let clean = 0;
  let slots = 0;
  for (const [mission, byVar] of Object.entries(grid.provenance)) {
    const p = byVar[variable];
    if (!p || p.gridSlots === 0) continue;
    missions.push({ mission, firstDay: p.firstDay!, lastDay: p.lastDay!, days: p.gridDays });
    raw += p.rawRows;
    clean += p.cleanRows;
    slots += p.gridSlots;
  }
  return {
    sourceField: grid.sourceFields[variable],
    unit: UNIT[variable].unit,
    unitNote: UNIT[variable].note,
    missions,
    days: Math.round(((slots * SLOT_MIN) / 1440) * 10) / 10,
    rawRows: raw,
    cleanRows: clean,
    cleaningRules: grid.rules[variable].description,
  };
}

export async function main(): Promise<void> {
  const grid = JSON.parse(await readFile(GRID_PATH, 'utf8')) as GridFile;
  const generatedOn = grid.preparedOn;
  const provenanceVars = Object.fromEntries(FORECAST_VARIABLES.map((v) => [v, variableProvenance(grid, v)])) as Record<ForecastVariable, VariableProvenance>;

  // Calibration of the simulator.
  const calibration: Record<string, VariableCalibration> = {};
  for (const v of FORECAST_VARIABLES) {
    const def = cabin.variables.find((d) => d.id === CABIN_ID[v])!;
    const fit = fitVariable(missionsOf(grid, v), { operating: def.operating, comfort: def.comfort });
    if (!fit) throw new Error(`no data to calibrate ${v}`);
    calibration[v] = fit;
  }
  const calibrationArtifact = roundDeep({
    schemaVersion: 1,
    provenance: {
      source: 'NASA Open Science Data Repository, Environmental Data Application (EDA) API, ISS-side telemetry',
      sourceUrl: 'https://visualization.osdr.nasa.gov/eda/api_reference',
      fetchedAt: grid.fetchedAt,
      generatedOn,
      gridMinutes: SLOT_MIN,
      method:
        'Per variable and mission: remove the mission median, fit the first two daily harmonics by least squares over all missions (time of day in UTC), then take the residual standard deviation and its lag-1 autocorrelation (AR(1)) inside contiguous segments. The level is the median across missions of the mission medians. Excursions are maximal runs above each mission own 95th percentile.',
      variables: provenanceVars,
    },
    variables: calibration,
  });
  await writeFile(join(KNOWLEDGE, 'cabin-calibration.json'), JSON.stringify(calibrationArtifact, null, 2) + '\n');

  // Forecast models.
  const variables = {} as ForecastModelArtifact['variables'];
  for (const v of FORECAST_VARIABLES) {
    const horizons: HorizonModel[] = [];
    for (const h of HORIZONS_H) {
      const result = evaluateAndFit(missionsOf(grid, v), h);
      if (!result) throw new Error(`cannot train ${v} ${h}h`);
      const e = result.evaluation;
      const enabled = passesGate(e);
      const losses: string[] = [];
      if (!(e.model.mae < e.persistence.mae)) losses.push('persistence');
      if (!(e.model.mae < e.seasonalNaive.mae)) losses.push('seasonal naive');
      horizons.push({
        horizonH: h,
        enabled,
        lambda: result.lambda,
        coefficients: result.fit.coefficients,
        intercept: result.fit.intercept,
        metrics: {
          n: e.n,
          testMissions: e.testMissions,
          model: e.model,
          persistence: e.persistence,
          seasonalNaive: e.seasonalNaive,
          missionsBeatingBoth: e.missionsBeatingBoth,
          foldLambdas: e.foldLambdas,
        },
        interval: { q10: e.residualQ10, q90: e.residualQ90 },
        ...(enabled ? {} : { disabledReason: `Test MAE does not beat ${losses.join(' and ')}.` }),
      });
      console.log(
        `${v} ${h}h: model MAE ${e.model.mae.toFixed(3)} RMSE ${e.model.rmse.toFixed(3)} | persistence ${e.persistence.mae.toFixed(3)} / ${e.persistence.rmse.toFixed(3)} | seasonal ${e.seasonalNaive.mae.toFixed(3)} / ${e.seasonalNaive.rmse.toFixed(3)} | n=${e.n} lambda=${result.lambda} q10=${e.residualQ10.toFixed(2)} q90=${e.residualQ90.toFixed(2)} missions beating both ${e.missionsBeatingBoth}/${e.testMissions.length} -> ${enabled ? 'ENABLED' : 'disabled'}`,
      );
    }
    variables[v] = { horizons };
  }
  const forecastArtifact: ForecastModelArtifact = roundDeep({
    schemaVersion: 1 as const,
    provenance: {
      source: 'NASA Open Science Data Repository, Environmental Data Application (EDA) API, ISS-side telemetry',
      sourceUrl: 'https://visualization.osdr.nasa.gov/eda/api_reference',
      fetchedAt: grid.fetchedAt,
      generatedOn,
      gridMinutes: SLOT_MIN,
      resampling: grid.resample.method,
      evaluation:
        'Leave-mission-out: each mission is the test set once and is never in its own training set; nothing is shuffled across time. The ridge lambda of each fold is chosen by an inner leave-one-mission-out on the training missions only. Metrics pool the held-out predictions and score only origins with 24 h of history, for the model and both baselines alike. The shipped coefficients are fitted on all missions with a lambda chosen by leave-mission-out validation; the stored metrics are the held-out ones. The 80% interval uses the 10th and 90th percentile of the held-out residuals.',
      gate: 'A horizon is enabled only if the held-out MAE of the model is lower than the MAE of both persistence and seasonal naive (same time 24 h earlier).',
      variables: provenanceVars,
      radiation:
        'Radiation (gcr, saa, total) is daily and its unit is not documented on the EDA reference page or in the API responses, so it is not used for calibration or forecasting; the simulated radiation stays illustrative.',
    },
    featureSpec: {
      slotMinutes: SLOT_MIN,
      minHistorySlots: MIN_HISTORY,
      featureNames: [...FEATURE_NAMES],
      target: 'value at the horizon minus value now',
    },
    variables,
  });
  await writeFile(join(KNOWLEDGE, 'cabin-forecast-model.json'), JSON.stringify(forecastArtifact, null, 2) + '\n');
  console.log('calibration:', JSON.stringify(Object.fromEntries(Object.entries(calibration).map(([k, c]) => [k, { level: c.level, cycle: c.cycle, noise: c.noise, bounds: c.bounds, exc: c.excursions, lim: c.limits, days: c.days, spread: c.levelAcrossMissions }])), null, 1));
}
