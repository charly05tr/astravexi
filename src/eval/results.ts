import { HEALTH_SIM_PARAMS } from '../adapters/health-sim';
import { cabinKnowledge } from '../knowledge';
import { CATALOG, catalogSeeds } from './scenario-instance';
import { completedSentence, runAllScenarios, summarize } from './run-evaluation';
import type { EvaluationSummary, ScenarioRecord } from './run-evaluation';

export const RESULTS_SCHEMA_VERSION = 1;

export interface EvalResults {
  schemaVersion: number;
  /** The only non-deterministic field: set by the script, ignored by the verifying test. */
  generatedOn: string;
  sentence: string;
  scenarioFileSha256: string;
  healthSimParamsSha256: string;
  attributionConfig: unknown;
  seeds: number[];
  scenarioTypes: string[];
  summary: EvaluationSummary;
  scenarios: ScenarioRecord[];
}

/** SHA-256 (hex) of the canonical JSON of a parsed JSON document: formatting-independent, key order as in the file. */
export async function sha256OfJson(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function buildResults(generatedOn: string, scenarios: ScenarioRecord[] = runAllScenarios()): Promise<EvalResults> {
  const summary = summarize(scenarios);
  return {
    schemaVersion: RESULTS_SCHEMA_VERSION,
    generatedOn,
    sentence: completedSentence(summary),
    scenarioFileSha256: await sha256OfJson(CATALOG),
    healthSimParamsSha256: await sha256OfJson(HEALTH_SIM_PARAMS),
    attributionConfig: cabinKnowledge.config,
    seeds: catalogSeeds(),
    scenarioTypes: CATALOG.scenarioTypes.map((t) => t.id),
    summary,
    scenarios,
  };
}
