import type { CrewCooccurrence } from '../../core/attribution/crew-cooccurrence';
import type { EnvironmentLink } from '../../core/attribution/environment-link';
import type { Verdict, VerdictReason } from '../../core/attribution/model';
import type { AttributedReading } from '../../core/attribution/analyze';

export const VERDICT_LABEL: Record<Verdict, string> = {
  'likely-external': 'Likely external (cabin)',
  'possibly-external': 'Possibly external',
  'likely-internal': 'Likely internal (this person)',
  'insufficient-data': 'Not enough data',
};

export const VERDICT_ORDER: readonly Verdict[] = ['likely-external', 'possibly-external', 'likely-internal', 'insufficient-data'];

/** One plain sentence on why the verdict is what it is. No score, no diagnosis. */
export const REASON_TEXT: Record<VerdictReason, string> = {
  'crew-wide-and-linked-excursion':
    'The rest of the crew moved the same way and a cabin variable with a documented link was outside its NASA limit just before.',
  'linked-excursion-individual-susceptibility':
    'A cabin variable with a documented link was outside its NASA limit, but the rest of the crew did not move: this may be individual susceptibility.',
  'linked-excursion-crew-unknown':
    'A cabin variable with a documented link was outside its NASA limit; there is not enough crew data to compare.',
  'crew-wide-no-monitored-excursion':
    'The rest of the crew moved the same way but no monitored cabin variable explains it: look for a shared cause outside the monitored environment, such as schedule or diet.',
  'crew-wide-environment-unknown':
    'The rest of the crew moved the same way; there is no cabin data to say whether the environment played a part.',
  'no-external-signal':
    'Atypical for this person, the rest of the crew did not move with them, and no linked cabin variable was outside its limit.',
  'insufficient-baseline': 'This person has too few earlier readings of this indicator to know what is usual for them.',
  'insufficient-crew-data': 'Too few crewmates have data for this indicator to compare, and no cabin excursion explains it.',
  'no-environment-data': 'There is no cabin data to check, and the rest of the crew did not move with this person.',
};

const UNIT_SPACE = (unit: string) => (unit === '%' ? unit : ` ${unit}`);
export const withUnit = (value: number, unit: string, digits = 1): string =>
  `${Number.isInteger(value) ? value : value.toFixed(digits)}${UNIT_SPACE(unit)}`;

const signed = (n: number, digits = 1): string => `${n > 0 ? '+' : n < 0 ? '-' : ''}${Math.abs(n).toFixed(digits)}`;

/** A number for display with thousands separators and its unit: "3,947 ppm", "27 °C", "45%". */
export const formatValue = (value: number, unit: string, digits = 1): string =>
  `${value.toLocaleString('en-US', { maximumFractionDigits: digits })}${UNIT_SPACE(unit)}`;

/** The mission day (1-based) of a mission minute. */
export const missionDay = (t: number): number => Math.floor(t / 1440) + 1;

/** "06:24" from a mission minute. */
export function clockLabel(t: number): string {
  const minute = ((t % 1440) + 1440) % 1440;
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

/** "Day 133, 06:24" from a mission minute. */
export function missionTimeLabel(t: number): string {
  const day = Math.floor(t / 1440) + 1;
  const minute = t % 1440;
  const hh = String(Math.floor(minute / 60)).padStart(2, '0');
  const mm = String(minute % 60).padStart(2, '0');
  return `Day ${day}, ${hh}:${mm}`;
}

export function personalText(f: AttributedReading): string {
  const p = f.personal;
  return (
    `${withUnit(p.value, f.unit)} against their own usual ${withUnit(p.median, f.unit)} ` +
    `(${signed(p.value - p.median)}${UNIT_SPACE(f.unit)}), from ${p.n} earlier readings. Robust z ${signed(p.z)}.`
  );
}

export function crewText(crew: CrewCooccurrence): string {
  if (crew.status === 'insufficient-crew-data') {
    return `Not enough crew data: ${crew.othersWithData} other crewmate${crew.othersWithData === 1 ? '' : 's'} with data, ${crew.required} needed.`;
  }
  const lead = crew.status === 'crew-wide' ? 'Crew-wide' : 'Individual';
  return `${lead}: ${crew.deviating} of ${crew.othersWithData} other crewmates moved the same way (${crew.needed} needed for crew-wide).`;
}

export function environmentText(env: EnvironmentLink): string {
  switch (env.status) {
    case 'no-documented-link':
      return 'No cabin variable has a documented link to this indicator in this direction, so the monitored cabin cannot explain it.';
    case 'no-data':
      return 'No cabin data for the linked variables in this window.';
    case 'no-linked-excursion':
      return 'Every linked cabin variable stayed inside its NASA operating limits in the window before the reading.';
    case 'linked-excursion':
      return env.excursions
        .map(
          (e) =>
            `${e.label} ${e.side === 'above' ? 'above' : 'below'} its NASA limit of ${withUnit(e.limit, e.unit)} (peak ${withUnit(e.peak, e.unit)}).`,
        )
        .join(' ');
  }
}

export function countByVerdict(findings: readonly AttributedReading[]): Record<Verdict, number> {
  const counts: Record<Verdict, number> = { 'likely-external': 0, 'possibly-external': 0, 'likely-internal': 0, 'insufficient-data': 0 };
  for (const f of findings) counts[f.verdict] += 1;
  return counts;
}

/** A forecast value rounded for display: whole ppm for CO2, one decimal for temperature and humidity. */
export const forecastNumber = (variable: string, value: number): number => (variable === 'co2' ? Math.round(value) : Math.round(value * 10) / 10);

/** A mean absolute error for the model card table: 1 decimal for CO2 (ppm), 3 for the small-valued variables. */
export const maeNumber = (variable: string, value: number): string => value.toFixed(variable === 'co2' ? 1 : 3);
