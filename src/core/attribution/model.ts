import type { IndicatorId, MissionMinute, SourceRef } from '../health/model';

/** The cabin variables the attribution knows about. */
export type CabinVariableId = 'co2' | 'cabinTemperature' | 'humidity' | 'radiationDose';

export interface Range {
  min?: number;
  max?: number;
}

export interface CabinVariableDef {
  id: CabinVariableId;
  label: string;
  unit: string;
  /** NASA operating limits. Null when the variable has no instantaneous limit (cumulative dose). */
  operating: Range | null;
  /** Narrower comfort and performance zone, shown as a notice. Null when the standard defines none. */
  comfort: Range | null;
  /** Cumulative variables only: the career limit the running total is compared with. */
  cumulativeLimit?: number;
  /** True when the variable is shown as context and never explains an acute vital-sign outlier. */
  contextOnly: boolean;
  source: SourceRef;
  needsVerification: boolean;
  note: string;
}

/** A documented physiological link from one cabin variable to one indicator. Every link carries its citation. */
export interface CabinLink {
  variable: CabinVariableId;
  indicatorId: IndicatorId;
  /** How far back before the reading an excursion still counts, in minutes. A design parameter, not a NASA value. */
  lagMin: number;
  /** Which side of the operating range counts as an excursion for this link. */
  excursionSide: 'above' | 'below' | 'either';
  /** Which way the reading must deviate for the link to explain it. */
  outlierDirection: 'above' | 'below';
  effect: string;
  source: SourceRef;
  needsVerification: boolean;
}

export interface AttributionConfig {
  /** Fewest prior readings of a person and indicator for a personal baseline. */
  minBaselineReadings: number;
  /** |robust z| at or above this marks a reading as atypical for the person. */
  outlierZ: number;
  /** |robust z| at or above this, in the same direction, marks a crewmate as deviating too. */
  crewZ: number;
  /** Fewest crewmates with data (and fewest deviating ones) for a crew-wide call. */
  crewMinOthers: number;
  /** Share of the crewmates with data that must deviate for a crew-wide call. */
  crewFraction: number;
  /** A crewmate's reading counts as the same time window when within this many minutes. */
  crewWindowMin: number;
  /** The baseline uses prior readings no older than this. */
  baselineWindowMin: number;
  /** Floor for the robust scale, in display units, so a flat history never gives an infinite z. */
  spreadFloor: Record<IndicatorId, number>;
}

export interface CabinKnowledge {
  config: AttributionConfig;
  variables: CabinVariableDef[];
  links: CabinLink[];
}

/** One simulated cabin sample. Cumulative variables (dose) carry the running total. */
export interface CabinSample {
  t: MissionMinute;
  values: Partial<Record<CabinVariableId, number>>;
}

export type Verdict = 'likely-external' | 'possibly-external' | 'likely-internal' | 'insufficient-data';

export type VerdictReason =
  | 'crew-wide-and-linked-excursion'
  | 'linked-excursion-individual-susceptibility'
  | 'linked-excursion-crew-unknown'
  | 'crew-wide-no-monitored-excursion'
  | 'crew-wide-environment-unknown'
  | 'no-external-signal'
  | 'insufficient-baseline'
  | 'insufficient-crew-data'
  | 'no-environment-data';
