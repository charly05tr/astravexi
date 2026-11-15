import type { IndicatorId } from '../health/model';
import type { CabinKnowledge, CabinLink, CabinSample, CabinVariableId } from './model';

export interface Excursion {
  variable: CabinVariableId;
  label: string;
  unit: string;
  side: 'above' | 'below';
  /** The most extreme value inside the lag window. */
  peak: number;
  /** The operating limit that was crossed. */
  limit: number;
  /** First and last sample outside the limit, mission minutes. */
  fromT: number;
  toT: number;
  /** The documented link that makes this excursion relevant to the indicator, with its citation. */
  link: CabinLink;
}

export type EnvironmentLink =
  /** No cabin variable has a documented link to this indicator in this direction: the monitored cabin cannot explain it. */
  | { status: 'no-documented-link' }
  /** There are linked variables but no cabin sample in the window (LIVE, or a gap). */
  | { status: 'no-data'; variables: readonly CabinVariableId[] }
  | { status: 'no-linked-excursion'; checked: readonly CabinVariableId[] }
  | { status: 'linked-excursion'; excursions: readonly Excursion[] };

/**
 * Looks for a cabin variable outside its NASA operating limit in the lag window ending at the reading, AND a
 * documented link from that variable to the indicator. An excursion without a link is not evidence, and a link
 * only counts when the reading deviates the way the link says (a heat excursion explains a high heart rate, not a low one).
 */
export function assessEnvironmentLink(
  indicatorId: IndicatorId,
  readingT: number,
  direction: 'above' | 'below',
  samples: readonly CabinSample[] | null,
  knowledge: Pick<CabinKnowledge, 'variables' | 'links'>,
): EnvironmentLink {
  const links = knowledge.links.filter((l) => l.indicatorId === indicatorId && l.outlierDirection === direction);
  if (links.length === 0) return { status: 'no-documented-link' };

  const excursions: Excursion[] = [];
  const checked: CabinVariableId[] = [];
  const missing: CabinVariableId[] = [];
  for (const link of links) {
    const def = knowledge.variables.find((v) => v.id === link.variable);
    const window = (samples ?? []).filter(
      (s) => s.t >= readingT - link.lagMin && s.t <= readingT && s.values[link.variable] !== undefined,
    );
    if (!def || !def.operating || window.length === 0) {
      missing.push(link.variable);
      continue;
    }
    checked.push(link.variable);
    const { min, max } = def.operating;
    const above = window.filter((s) => max !== undefined && s.values[link.variable]! > max);
    const below = window.filter((s) => min !== undefined && s.values[link.variable]! < min);
    const sides: Array<['above' | 'below', CabinSample[]]> = [];
    if (link.excursionSide !== 'below' && above.length > 0) sides.push(['above', above]);
    if (link.excursionSide !== 'above' && below.length > 0) sides.push(['below', below]);
    for (const [side, hits] of sides) {
      const values = hits.map((s) => s.values[link.variable]!);
      excursions.push({
        variable: link.variable,
        label: def.label,
        unit: def.unit,
        side,
        peak: side === 'above' ? Math.max(...values) : Math.min(...values),
        limit: side === 'above' ? max! : min!,
        fromT: hits[0]!.t,
        toT: hits[hits.length - 1]!.t,
        link,
      });
    }
  }
  if (excursions.length > 0) return { status: 'linked-excursion', excursions };
  if (checked.length === 0) return { status: 'no-data', variables: missing };
  return { status: 'no-linked-excursion', checked };
}
