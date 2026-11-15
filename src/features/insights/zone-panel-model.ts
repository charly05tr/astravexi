import type {
  AsOf,
  BodyZone,
  Evaluation,
  Finding,
  Knowledge,
  Reading,
  ReadingSource,
  RecommendationDecision,
  SourceRef,
  Tier,
  ZoneStatus,
} from '../../core/health/model';
import { compareReadings } from '../../core/health/series';
import { statToDisplay, storedToDisplay, tierRank } from '../../core/health/tiers';
import type { SuggestionFinding } from '../../core/ports';
import type { Content } from '../../knowledge';
import { formatMissionTime, formatValue } from '../shared/format';
import { explainFinding } from './explanation';
import type { FindingExplanation } from './explanation';
import { buildTrend } from './trend-data';
import type { Trend } from './trend-data';

export interface FindingView {
  key: string;
  ruleId: string;
  tier: Tier;
  indicatorLabel: string;
  source: ReadingSource;
  sustained: boolean;
  latched: boolean;
  /** Display text of the latest re-measure of a latched red flag. */
  latestText: string | null;
  unverified: boolean;
  explanation: Omit<FindingExplanation, 'recommendations'>;
  citation: SourceRef;
  needsVerification: boolean;
}

export interface CorroborationView {
  title: string;
  intro: string;
  contributing: Array<{ key: string; ruleId: string; indicatorLabel: string; tier: Tier }>;
  whyItMatters: string;
  whatToDo: string;
  findingKey: string;
}

export interface IndicatorView {
  id: string;
  label: string;
  howToMeasure: string;
  /** Latest reading of any context, as display text. */
  last: { text: string; source: ReadingSource; time: string; afterExercise: boolean } | null;
  /** Plain status lines: "Baseline building, 3 of 7 in the baseline window", "No recent reading". */
  notes: string[];
  trend: Trend;
  unit: string;
  precision: 0 | 1;
}

export interface ZonePanelModel {
  zoneId: BodyZone['id'];
  label: string;
  functionSummary: string;
  status: ZoneStatus;
  monitored: boolean;
  findings: FindingView[];
  corroboration: CorroborationView | null;
  indicators: IndicatorView[];
  /** What a suggestion provider needs: the zone's findings with their curated recommendation ids. */
  suggestionFindings: SuggestionFinding[];
}

export interface ZonePanelInput {
  zone: BodyZone;
  evaluation: Evaluation;
  knowledge: Knowledge;
  content: Content;
  readings: readonly Reading[];
  decisions: readonly RecommendationDecision[];
  asOf: AsOf;
}

function findingView(f: Finding, input: ZonePanelInput): FindingView {
  const rule = input.knowledge.rules.find((r) => r.id === f.ruleId);
  const indicator = input.knowledge.indicators.find((i) => i.id === f.indicatorId)!;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- recommendations go to the suggestion provider
  const { recommendations, ...text } = explainFinding(
    f,
    rule,
    indicator,
    input.content.templates.get(rule?.templateId ?? f.ruleId),
    input.content.recommendations,
  );
  return {
    key: f.key,
    ruleId: f.ruleId,
    tier: f.tier,
    indicatorLabel: indicator.label,
    source: f.source,
    sustained: f.sustained,
    latched: f.latched === true,
    latestText:
      f.latched && f.latestObserved !== undefined
        ? formatValue(statToDisplay(f.latestObserved, indicator), indicator)
        : null,
    unverified: f.unverified === true,
    explanation: text,
    citation: rule?.source ?? { label: 'No citation recorded', url: '', kind: 'design-inference' },
    needsVerification: f.needsVerification,
  };
}

function corroborationView(input: ZonePanelInput): CorroborationView | null {
  const zone = input.evaluation.zones[input.zone.id];
  if (!zone.corroborated) return null;
  const contributing = zone.findings
    .filter((f) => f.sustained && tierRank(f.tier) >= tierRank('notice'))
    .map((f) => ({
      key: f.key,
      ruleId: f.ruleId,
      indicatorLabel: input.knowledge.indicators.find((i) => i.id === f.indicatorId)?.label ?? f.indicatorId,
      tier: f.tier,
    }));
  const tpl = input.content.corroboration;
  const findingKey = `corroboration:${input.zone.id}`;
  return {
    title: tpl.title,
    intro: tpl.intro,
    contributing,
    whyItMatters: tpl.whyItMatters,
    whatToDo: tpl.whatToDo,
    findingKey,
  };
}

function indicatorViews(input: ZonePanelInput): IndicatorView[] {
  const views: IndicatorView[] = [];
  for (const id of input.zone.indicatorIds) {
    const indicator = input.knowledge.indicators.find((i) => i.id === id);
    if (!indicator) continue;
    const status = input.evaluation.indicatorStatus[id];
    const own = input.readings
      .filter((r) => r.indicatorId === id && (r.day < input.asOf.day || (r.day === input.asOf.day && r.t <= input.asOf.t)))
      .sort(compareReadings);
    const latest = own[own.length - 1];
    const notes: string[] = [];
    if (!latest) notes.push('No readings yet');
    else if (status.stale) notes.push('No recent reading');
    if (indicator.baseline && status.baseline === 'building') {
      notes.push(`Baseline building, ${status.baselineDays} of ${indicator.baseline.windowDays} in the baseline window`);
    }
    views.push({
      id,
      label: indicator.label,
      howToMeasure: indicator.howToMeasure,
      unit: indicator.unit,
      precision: indicator.unitScale === 10 ? 1 : 0,
      last: latest
        ? {
            text: formatValue(storedToDisplay(latest.value, indicator), indicator),
            source: latest.source,
            time: formatMissionTime(latest.t),
            afterExercise: latest.context === 'exercise',
          }
        : null,
      notes,
      trend: buildTrend(input.readings, indicator, input.asOf),
    });
  }
  return views;
}

function suggestionFindings(input: ZonePanelInput, findings: FindingView[], corroboration: CorroborationView | null): SuggestionFinding[] {
  const zone = input.evaluation.zones[input.zone.id];
  const out: SuggestionFinding[] = [];
  if (corroboration) {
    out.push({
      key: corroboration.findingKey,
      ruleId: null,
      indicatorId: null,
      indicatorLabel: corroboration.title,
      tier: 'caution',
      whatChanged: corroboration.intro,
      recommendationIds: input.content.corroboration.recommendationIdsByZone[input.zone.id] ?? [],
    });
  }
  for (const f of zone.findings) {
    const view = findings.find((v) => v.key === f.key);
    const rule = input.knowledge.rules.find((r) => r.id === f.ruleId);
    const template = input.content.templates.get(rule?.templateId ?? f.ruleId);
    out.push({
      key: f.key,
      ruleId: f.ruleId,
      indicatorId: f.indicatorId,
      indicatorLabel: view?.indicatorLabel ?? f.indicatorId,
      tier: f.tier,
      whatChanged: view?.explanation.whatChanged ?? '',
      recommendationIds: template?.recommendationIds ?? [],
    });
  }
  return out;
}

/** Everything the zone panel shows, derived from the evaluation. Pure: no store, no React. */
export function buildZonePanelModel(input: ZonePanelInput): ZonePanelModel {
  const zone = input.evaluation.zones[input.zone.id];
  const monitored = input.zone.indicatorIds.length > 0;
  // A zone that is not monitored shows its function text only: no findings, trends or scores.
  const findings = monitored ? zone.findings.map((f) => findingView(f, input)) : [];
  const corroboration = monitored ? corroborationView(input) : null;
  return {
    zoneId: input.zone.id,
    label: input.zone.label,
    functionSummary: input.zone.functionSummary,
    status: zone.status,
    monitored,
    findings,
    corroboration,
    indicators: monitored ? indicatorViews(input) : [],
    suggestionFindings: monitored ? suggestionFindings(input, findings, corroboration) : [],
  };
}
