import type { AttributedReading } from '../core/attribution/analyze';
import type { IndicatorId } from '../core/health/model';
import { CATALOG, buildScenario, catalogSeeds, classOf, runEngine } from './scenario-instance';
import type { InjectedAnomaly, PredictedClass, ScenarioCatalog, ScenarioInstance, TruthClass } from './scenario-instance';
import { round4, wilson95 } from './stats';

export const TRUTH_CLASSES: readonly TruthClass[] = ['individual', 'environmental', 'shared'];
export const PREDICTED_COLUMNS = ['individual', 'environmental', 'shared', 'undetermined', 'missed'] as const;
export type PredictedColumn = (typeof PREDICTED_COLUMNS)[number];
/** Magnitude buckets in SD units, lower bound inclusive. The last bucket includes its upper bound. */
export const MAGNITUDE_BUCKETS: ReadonlyArray<{ label: string; lo: number; hi: number }> = [
  { label: '2-3 SD', lo: 2, hi: 3 },
  { label: '3-4 SD', lo: 3, hi: 4 },
  { label: '4-5 SD', lo: 4, hi: 5 },
  { label: '5-6 SD', lo: 5, hi: 6.0000001 },
];

export interface AnomalyRecord {
  id: string;
  person: number;
  indicatorId: IndicatorId;
  truth: TruthClass;
  magnitudeSd: number;
  detected: boolean;
  /** Majority class of the matching findings; null when not detected. */
  predicted: PredictedClass | null;
  /** Number of matching findings. */
  findings: number;
  /** Reason of the earliest matching finding; null when not detected. */
  firstReason: string | null;
}
export interface ScenarioRecord {
  typeId: string;
  seed: number;
  onsetDay: number | null;
  endDay: number | null;
  judgedCrewDays: number;
  anomalies: AnomalyRecord[];
  /** Findings that match no injected anomaly. */
  falseAlarms: number;
  falseAlarmsByIndicator: Partial<Record<IndicatorId, number>>;
  falseAlarmsByReason: Record<string, number>;
  /** All findings of the scenario, by reason (matched and unmatched). */
  findingsByReason: Record<string, number>;
}

function matches(f: AttributedReading, a: InjectedAnomaly, personIndexOf: Map<string, number>): boolean {
  return personIndexOf.get(f.profileId) === a.personIndex && f.indicatorId === a.indicatorId && f.t >= a.startT && f.t <= a.endT;
}

/** Majority class; ties go to the class of the earliest finding among the tied classes. */
function majorityClass(findings: readonly AttributedReading[]): PredictedClass {
  const ordered = [...findings].sort((a, b) => a.t - b.t);
  const counts = new Map<PredictedClass, number>();
  for (const f of ordered) counts.set(classOf(f), (counts.get(classOf(f)) ?? 0) + 1);
  const best = Math.max(...counts.values());
  return ordered.map(classOf).find((c) => counts.get(c) === best)!;
}

export function scoreScenario(s: ScenarioInstance, findings: readonly AttributedReading[]): ScenarioRecord {
  const personIndexOf = new Map(s.people.map((p, i) => [p.profileId, i] as const));
  const matched = new Set<string>();
  const anomalies: AnomalyRecord[] = s.anomalies.map((a) => {
    const hits = findings.filter((f) => matches(f, a, personIndexOf));
    for (const h of hits) matched.add(h.id);
    const earliest = [...hits].sort((x, y) => x.t - y.t)[0];
    return {
      id: a.id,
      person: a.personIndex,
      indicatorId: a.indicatorId,
      truth: a.truth,
      magnitudeSd: a.magnitudeSd,
      detected: hits.length > 0,
      predicted: hits.length > 0 ? majorityClass(hits) : null,
      findings: hits.length,
      firstReason: earliest ? earliest.reason : null,
    };
  });
  const falseAlarmsByIndicator: Partial<Record<IndicatorId, number>> = {};
  const falseAlarmsByReason: Record<string, number> = {};
  const findingsByReason: Record<string, number> = {};
  let falseAlarms = 0;
  for (const f of findings) {
    findingsByReason[f.reason] = (findingsByReason[f.reason] ?? 0) + 1;
    if (matched.has(f.id)) continue;
    falseAlarms += 1;
    falseAlarmsByIndicator[f.indicatorId] = (falseAlarmsByIndicator[f.indicatorId] ?? 0) + 1;
    falseAlarmsByReason[f.reason] = (falseAlarmsByReason[f.reason] ?? 0) + 1;
  }
  return {
    typeId: s.typeId,
    seed: s.seed,
    onsetDay: s.onsetDay,
    endDay: s.endDay,
    judgedCrewDays: s.people.length * Math.round((s.toT + 1 - s.fromT) / 1440),
    anomalies,
    falseAlarms,
    falseAlarmsByIndicator,
    falseAlarmsByReason,
    findingsByReason,
  };
}

export function runScenario(typeId: string, seed: number, catalog: ScenarioCatalog = CATALOG): ScenarioRecord {
  const s = buildScenario(typeId, seed, catalog);
  return scoreScenario(s, runEngine(s));
}

export function runAllScenarios(catalog: ScenarioCatalog = CATALOG, seeds: readonly number[] = catalogSeeds(catalog)): ScenarioRecord[] {
  const records: ScenarioRecord[] = [];
  for (const type of catalog.scenarioTypes) for (const seed of seeds) records.push(runScenario(type.id, seed, catalog));
  return records;
}

// ---------------------------------------------------------------------------------------------------------------
// Aggregation (pure function of the records, so the committed records verify the committed totals).

export interface Rate {
  k: number;
  n: number;
  rate: number | null;
  ci95: { lo: number; hi: number } | null;
}
const rate = (k: number, n: number): Rate => {
  const ci = wilson95(k, n);
  return { k, n, rate: n > 0 ? round4(k / n) : null, ci95: ci ? { lo: round4(ci.lo), hi: round4(ci.hi) } : null };
};

export interface Totals {
  scenarios: number;
  anomalies: number;
  detected: Rate;
  falseAlarms: number;
  judgedCrewDays: number;
  falseAlarmsPer100CrewDays: number | null;
  /** Z of K: correct among detected. */
  attributionAmongDetected: Rate;
  /** Z' of M: correct among all injected (undetected count as wrong). */
  attributionAmongInjected: Rate;
}

function totalsOf(records: readonly ScenarioRecord[]): Totals {
  const anomalies = records.flatMap((r) => r.anomalies);
  const detected = anomalies.filter((a) => a.detected);
  const correct = detected.filter((a) => a.predicted === a.truth);
  const falseAlarms = records.reduce((s, r) => s + r.falseAlarms, 0);
  const judgedCrewDays = records.reduce((s, r) => s + r.judgedCrewDays, 0);
  return {
    scenarios: records.length,
    anomalies: anomalies.length,
    detected: rate(detected.length, anomalies.length),
    falseAlarms,
    judgedCrewDays,
    falseAlarmsPer100CrewDays: judgedCrewDays > 0 ? round4((falseAlarms / judgedCrewDays) * 100) : null,
    attributionAmongDetected: rate(correct.length, detected.length),
    attributionAmongInjected: rate(correct.length, anomalies.length),
  };
}

export interface EvaluationSummary {
  totals: Totals;
  byType: Array<{ typeId: string } & Totals>;
  byMagnitude: Array<{ bucket: string; anomalies: number; detected: Rate; attributionAmongDetected: Rate; attributionAmongInjected: Rate }>;
  /** Rows: ground truth. Columns: predicted class or missed. */
  confusion: Record<TruthClass, Record<PredictedColumn, number>>;
  byTruthClass: Array<{ truth: TruthClass; anomalies: number; detected: Rate; attributionAmongDetected: Rate; attributionAmongInjected: Rate }>;
  /** Detected anomalies by (truth class, reason of the earliest matching finding). */
  reasonByTruth: Record<string, Record<string, number>>;
  falseAlarms: {
    total: number;
    per100CrewDays: number | null;
    noAnomalyType: { scenarios: number; total: number; per100CrewDays: number | null; scenariosWithAtLeastOne: number };
    byIndicator: Partial<Record<IndicatorId, number>>;
    byReason: Record<string, number>;
  };
  /** Every VerdictReason seen in any finding. Reasons with zero occurrences are absent. */
  findingsByReason: Record<string, number>;
}

export function summarize(records: readonly ScenarioRecord[], catalog: ScenarioCatalog = CATALOG): EvaluationSummary {
  const anomalies = records.flatMap((r) => r.anomalies);
  const byMagnitude = MAGNITUDE_BUCKETS.map((b) => {
    const inB = anomalies.filter((a) => a.magnitudeSd >= b.lo && a.magnitudeSd < b.hi);
    const det = inB.filter((a) => a.detected);
    const ok = det.filter((a) => a.predicted === a.truth);
    return {
      bucket: b.label,
      anomalies: inB.length,
      detected: rate(det.length, inB.length),
      attributionAmongDetected: rate(ok.length, det.length),
      attributionAmongInjected: rate(ok.length, inB.length),
    };
  });

  const confusion = Object.fromEntries(
    TRUTH_CLASSES.map((t) => [t, Object.fromEntries(PREDICTED_COLUMNS.map((c) => [c, 0]))]),
  ) as Record<TruthClass, Record<PredictedColumn, number>>;
  const reasonByTruth: Record<string, Record<string, number>> = {};
  for (const a of anomalies) {
    confusion[a.truth][a.detected ? a.predicted! : 'missed'] += 1;
    if (a.detected) {
      const byReason = (reasonByTruth[a.truth] ??= {});
      byReason[a.firstReason!] = (byReason[a.firstReason!] ?? 0) + 1;
    }
  }

  const byTruthClass = TRUTH_CLASSES.map((t) => {
    const inT = anomalies.filter((a) => a.truth === t);
    const det = inT.filter((a) => a.detected);
    const ok = det.filter((a) => a.predicted === a.truth);
    return {
      truth: t,
      anomalies: inT.length,
      detected: rate(det.length, inT.length),
      attributionAmongDetected: rate(ok.length, det.length),
      attributionAmongInjected: rate(ok.length, inT.length),
    };
  });

  const total = totalsOf(records);
  const control = records.filter((r) => r.typeId === 'no-anomaly');
  const controlFA = control.reduce((s, r) => s + r.falseAlarms, 0);
  const controlDays = control.reduce((s, r) => s + r.judgedCrewDays, 0);
  const byIndicator: Partial<Record<IndicatorId, number>> = {};
  const byReason: Record<string, number> = {};
  const findingsByReason: Record<string, number> = {};
  for (const r of records) {
    for (const [k, v] of Object.entries(r.falseAlarmsByIndicator)) byIndicator[k as IndicatorId] = (byIndicator[k as IndicatorId] ?? 0) + v;
    for (const [k, v] of Object.entries(r.falseAlarmsByReason)) byReason[k] = (byReason[k] ?? 0) + v;
    for (const [k, v] of Object.entries(r.findingsByReason)) findingsByReason[k] = (findingsByReason[k] ?? 0) + v;
  }
  return {
    totals: total,
    byType: catalog.scenarioTypes.map((t) => ({ typeId: t.id, ...totalsOf(records.filter((r) => r.typeId === t.id)) })),
    byMagnitude,
    confusion,
    byTruthClass,
    reasonByTruth,
    falseAlarms: {
      total: total.falseAlarms,
      per100CrewDays: total.falseAlarmsPer100CrewDays,
      noAnomalyType: {
        scenarios: control.length,
        total: controlFA,
        per100CrewDays: controlDays > 0 ? round4((controlFA / controlDays) * 100) : null,
        scenariosWithAtLeastOne: control.filter((r) => r.falseAlarms > 0).length,
      },
      byIndicator,
      byReason,
    },
    findingsByReason,
  };
}

const pct = (r: Rate): string => (r.rate === null ? 'n/a' : `${(r.rate * 100).toFixed(1)}%`);

/** The sentence the evaluation exists to complete. */
export function completedSentence(s: EvaluationSummary): string {
  const t = s.totals;
  return (
    `In ${t.scenarios} simulated scenarios with ${t.anomalies} injected anomalies, the engine detected ${t.detected.k} ` +
    `(${pct(t.detected)}), generated ${t.falseAlarms} false alarms and assigned the correct attribution ` +
    `(individual, environmental or shared) in ${t.attributionAmongDetected.k} of ${t.attributionAmongDetected.n} cases.`
  );
}
