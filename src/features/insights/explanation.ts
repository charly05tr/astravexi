import type {
  Finding,
  Indicator,
  Recommendation,
  Rule,
  FindingTemplate,
} from '../../core/health/model';
import { statToDisplay } from '../../core/health/tiers';
import { formatDelta, formatValue } from '../shared/format';

export interface FindingExplanation {
  whatChanged: string;
  whyItMatters: string;
  whatToDo: string;
  recommendations: Recommendation[];
}

/** Replaces {name} tokens. Unknown tokens become an empty string, so no raw braces reach the screen. */
export function fillTemplate(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? '');
}

/** The values a template may mention, in display units with the indicator's precision. */
export function templateValues(finding: Finding, rule: Rule | undefined, indicator: Indicator): Record<string, string> {
  const observed = statToDisplay(finding.observed, indicator);
  const values: Record<string, string> = { observed: formatValue(observed, indicator) };
  if (finding.baseline && finding.baseline.n > 0) {
    // A window-mean rule compares against the baseline mean; every other rule against the median.
    const stat = rule?.condition.kind === 'meanVsBaseline' ? finding.baseline.mean : finding.baseline.median;
    const base = statToDisplay(stat, indicator);
    values.baseline = formatValue(base, indicator);
    values.delta = formatDelta(observed - base, indicator);
  } else {
    values.baseline = 'not available yet';
    values.delta = 'no comparison yet';
  }
  if (finding.latestObserved !== undefined) {
    values.latest = formatValue(statToDisplay(finding.latestObserved, indicator), indicator);
  }
  return values;
}

/**
 * Builds the three-part explanation (what changed, why it matters, what to do) of one finding from its
 * template. Plain template filling: nothing is generated and nothing is a diagnosis.
 */
export function explainFinding(
  finding: Finding,
  rule: Rule | undefined,
  indicator: Indicator,
  template: FindingTemplate | undefined,
  recommendations: ReadonlyMap<string, Recommendation>,
): FindingExplanation {
  if (!template) {
    return {
      whatChanged: rule?.description ?? finding.ruleId,
      whyItMatters: 'No explanation text is available for this rule.',
      whatToDo: 'Re-measure and tell the Crew Medical Officer if it continues.',
      recommendations: [],
    };
  }
  const values = templateValues(finding, rule, indicator);
  return {
    whatChanged: fillTemplate(template.whatChanged, values),
    whyItMatters: fillTemplate(template.whyItMatters, values),
    whatToDo: fillTemplate(template.whatToDo, values),
    recommendations: template.recommendationIds
      .map((id) => recommendations.get(id))
      .filter((r): r is Recommendation => r !== undefined),
  };
}
