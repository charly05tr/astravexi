import type {
  Attribution,
  BodyZone,
  Condition,
  CorroborationTemplate,
  FindingTemplate,
  Recommendation,
  Indicator,
  Knowledge,
  Risk,
  Rule,
  SourceRef,
} from '../core/health/model';
import { toStored } from '../core/health/rounding';
import attributionsJson from './attributions.json';
import indicatorsJson from './indicators.json';
import recommendationsJson from './recommendations.json';
import risksJson from './risks.json';
import rulesJson from './rules.json';
import templatesJson from './templates.json';
import zonesJson from './zones.json';

/** Feature flags that change what is monitored. */
export interface KnowledgeFlags {
  glucose: boolean;
}
export const DEFAULT_FLAGS: KnowledgeFlags = { glucose: true };

// JSON is written in display units. These raw shapes mirror the core types before scaling.
type RawCondition = { kind: string; [key: string]: unknown };
interface RawIndicator extends Omit<Indicator, 'baseline'> {
  baseline?: { windowDays: number; evalWindowDays: number; minDays: number; minSpread: number };
}
interface RawRule extends Omit<Rule, 'condition' | 'expectedShift'> {
  condition: RawCondition;
  expectedShift?: { value: number; explainedBelowDelta: number; source: SourceRef };
}

/** Scale a display-unit condition to stored units. Percentages, SD multiples and z-scores are not scaled. */
function scaleCondition(raw: RawCondition, unitScale: number): Condition {
  const c = raw as Record<string, unknown> & { kind: string };
  const scale = (key: string) => toStored(c[key] as number, unitScale);
  switch (c.kind) {
    case 'latest':
    case 'rollingMean':
    case 'consecutiveDays':
      return { ...c, value: scale('value') } as unknown as Condition;
    case 'baselineDelta':
      return { ...c, value: scale('value') } as unknown as Condition;
    case 'meanVsBaseline':
      return { ...c, minRise: scale('minRise') } as unknown as Condition;
    case 'and':
      return {
        kind: 'and',
        all: (c.all as RawCondition[]).map((x) => scaleCondition(x, unitScale)),
      };
    default:
      return c as unknown as Condition; // trend, baselinePct, robustZ, requiresSymptom, baselineBuilding
  }
}

function loadIndicator(raw: RawIndicator): Indicator {
  if (!raw.baseline) return raw as Indicator;
  return {
    ...raw,
    baseline: { ...raw.baseline, minSpread: toStored(raw.baseline.minSpread, raw.unitScale) },
  };
}

function loadRule(raw: RawRule, indicators: Map<string, Indicator>): Rule {
  const ind = indicators.get(raw.indicatorId);
  if (!ind) throw new Error(`Rule ${raw.id} references unknown indicator ${raw.indicatorId}`);
  const rule: Rule = {
    ...raw,
    condition: scaleCondition(raw.condition, ind.unitScale),
  };
  if (raw.expectedShift) {
    rule.expectedShift = {
      ...raw.expectedShift,
      value: toStored(raw.expectedShift.value, ind.unitScale),
      explainedBelowDelta: toStored(raw.expectedShift.explainedBelowDelta, ind.unitScale),
    };
  }
  return rule;
}

/**
 * Typed knowledge loader. Scales display-unit JSON to integer stored units and applies the flags:
 * with `glucose: false` the glucose indicator and rules are dropped, so metabolism reads Not monitored.
 */
export function loadKnowledge(flags: KnowledgeFlags = DEFAULT_FLAGS): Knowledge {
  const dropped = new Set<string>();
  if (!flags.glucose) dropped.add('glucose');

  const indicators = (indicatorsJson as unknown as RawIndicator[])
    .filter((i) => !dropped.has(i.id))
    .map(loadIndicator);
  const byId = new Map(indicators.map((i) => [i.id as string, i]));
  const rules = (rulesJson as unknown as RawRule[])
    .filter((r) => !dropped.has(r.indicatorId))
    .map((r) => loadRule(r, byId));
  const zones = (zonesJson as unknown as BodyZone[]).map((z) => ({
    ...z,
    indicatorIds: z.indicatorIds.filter((id) => !dropped.has(id)),
  }));
  return { indicators, zones, rules };
}

export const risks = risksJson as unknown as Risk[];
export const knowledge: Knowledge = loadKnowledge();

/** Explanation texts and routine-change proposals. Plain data: lookups only, nothing generated. */
export interface Content {
  templates: ReadonlyMap<string, FindingTemplate>;
  corroboration: CorroborationTemplate;
  recommendations: ReadonlyMap<string, Recommendation>;
  attributions: readonly Attribution[];
}

export function loadContent(): Content {
  const book = templatesJson as unknown as { findings: FindingTemplate[]; corroboration: CorroborationTemplate };
  return {
    templates: new Map(book.findings.map((t) => [t.id, t])),
    corroboration: book.corroboration,
    recommendations: new Map((recommendationsJson as unknown as Recommendation[]).map((r) => [r.id, r])),
    attributions: attributionsJson as unknown as Attribution[],
  };
}

export const content: Content = loadContent();
