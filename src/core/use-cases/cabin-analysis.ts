import { analyzeCabinAndCrew } from '../attribution/analyze';
import type { CabinCrewAnalysis } from '../attribution/analyze';
import type { CabinKnowledge, CabinLink, CabinSample, CabinVariableDef } from '../attribution/model';
import { assessVariable, recentSeries } from '../attribution/variable-status';
import type { CabinCalibrationArtifact } from '../calibration/artifact';
import { preventiveAlert } from '../forecast/alert';
import type { ForecastAlert } from '../forecast/alert';
import { forecastVariable } from '../forecast/model';
import type { ForecastModelArtifact, ForecastPoint } from '../forecast/model';
import { buildModelCard } from '../forecast/model-card';
import type { ModelCard } from '../forecast/model-card';
import { FORECAST_VARIABLES } from '../forecast/types';
import type { ForecastVariable } from '../forecast/types';
import type { ZoneStatus } from '../health/model';
import type { SimulatedCabinTimeline } from '../ports';
import { assertCan } from '../profiles/policy';
import { loadCrew } from './crew';
import type { CrewSource } from './crew';
import type { Deps } from './session';

/** How far back the page looks for atypical readings, in mission days. */
export const ANALYSIS_DAYS = 30;
const MINUTES_PER_DAY = 1440;

export type CabinAnalysisDeps = Deps & {
  /** Our simulated cabin on the mission clock. Null in LIVE: no simulated values are ever shown there. */
  timeline: SimulatedCabinTimeline | null;
  cabin: CabinKnowledge;
  /** The committed forecast model and the calibration it shares its provenance with. */
  forecast: { model: ForecastModelArtifact; calibration: CabinCalibrationArtifact };
};

export interface CabinVariableView {
  def: CabinVariableDef;
  /** Latest value, or null when there is no cabin data. */
  latest: number | null;
  status: ZoneStatus;
  /** The last 48 hours, oldest first. Empty without data. */
  trend: number[];
  /** Mission minutes of each `trend` value, same length and order. */
  trendT: number[];
  /** Enabled forecast horizons computed from the series above. Empty without data or for variables with no model. */
  forecast: ForecastPoint[];
  /** Informational heads-up that a forecast interval reaches a NASA limit. Never feeds the attribution verdict. */
  forecastAlert: ForecastAlert | null;
}

export interface CabinAnalysisView {
  /** False in LIVE: the cabin variables have no real source, so they show "no data". */
  simulated: boolean;
  variables: CabinVariableView[];
  analysis: CabinCrewAnalysis;
  /** Profiles whose records could not be read. */
  unavailable: string[];
  spanDays: number;
  /** The mission minute the view was built at. */
  nowT: number;
  /** The documented cabin-to-indicator links, each with its citation. */
  links: CabinLink[];
  modelCard: ModelCard;
}

/**
 * The cabin variables against their NASA limits, and every atypical reading of the crew with the three signals that
 * say whether the cause looks external (the cabin) or internal (the person). CMO only. The verdict is qualitative.
 */
export async function loadCabinAnalysis(deps: CabinAnalysisDeps, source: CrewSource): Promise<CabinAnalysisView> {
  assertCan(deps.actor.role, 'viewCabinEnvironment');
  const review = await loadCrew(deps, source);
  const now = deps.clock.now();
  const fromT = Math.max(0, now - ANALYSIS_DAYS * MINUTES_PER_DAY);
  const maxLag = Math.max(0, ...deps.cabin.links.map((l) => l.lagMin));
  const samples: CabinSample[] | null = deps.timeline ? deps.timeline.samples(Math.max(0, fromT - maxLag), now) : null;

  const analysis = analyzeCabinAndCrew({
    members: review.members.map((m) => ({ profileId: m.profileId, name: m.name, readings: m.readings })),
    indicators: deps.knowledge.indicators,
    cabin: deps.cabin,
    samples,
    fromT,
    toT: now,
  });

  const variables = deps.cabin.variables.map((def): CabinVariableView => {
    const series = recentSeries(samples ?? [], def.id, now);
    const latest = series.length > 0 ? series[series.length - 1]!.value : null;
    const forecast = (FORECAST_VARIABLES as readonly string[]).includes(def.id)
      ? forecastVariable(deps.forecast.model, def.id as ForecastVariable, series)
      : [];
    return {
      def,
      latest,
      status: assessVariable(def, latest),
      trend: series.map((s) => s.value),
      trendT: series.map((s) => s.t),
      forecast,
      forecastAlert: preventiveAlert(forecast, def.operating, latest),
    };
  });
  return {
    simulated: samples !== null,
    variables,
    analysis,
    unavailable: review.unavailable.map((u) => u.name),
    spanDays: ANALYSIS_DAYS,
    nowT: now,
    links: deps.cabin.links,
    modelCard: buildModelCard(deps.forecast.model, deps.forecast.calibration),
  };
}
