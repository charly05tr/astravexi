/**
 * Core domain model. Pure types only: no runtime dependencies.
 *
 * Units:
 * - Reading.value is an INTEGER in stored units (temperature and sleep in tenths, the rest whole units).
 * - "Stat units" are stored units x STAT_SCALE (10). Every derived statistic (median, MAD, mean, SD,
 *   delta, percentage threshold) is an integer in stat units, produced by `roundHalfAway`.
 */

export type Tier = 'information' | 'notice' | 'caution' | 'warning';
/** none = monitored with data and no active finding; noData = monitored but no recent reading; unmonitored = no MVP indicator. */
export type ZoneStatus = Tier | 'none' | 'noData' | 'unmonitored';
export type ZoneId = 'brain' | 'eyes' | 'heart' | 'bone' | 'metabolism' | 'immune';
export type IndicatorId =
  | 'sleepHours'
  | 'phq2'
  | 'heartRate'
  | 'temperature'
  | 'bpSystolic'
  | 'bpDiastolic'
  | 'glucose';
export type HazardId =
  | 'radiation'
  | 'isolation-confinement'
  | 'distance-from-earth'
  | 'gravity-fields'
  | 'hostile-closed-environments';
export type MissionMinute = number;
export type MissionDay = number;
export interface AsOf {
  day: MissionDay;
  t: MissionMinute;
}
export type Audience = 'astronaut' | 'cmo' | 'flightSurgeon';
export type ReadingSource = 'SYNTHETIC' | 'MANUAL';
export type ReadingContext = 'rest' | 'exercise';

export interface SourceRef {
  label: string;
  url: string;
  kind: 'primary' | 'secondary' | 'design-inference';
}
export interface Hazard {
  id: HazardId;
  name: string;
  source: SourceRef;
}
export interface Risk {
  id: string;
  name: string;
  hazardIds: HazardId[];
  zoneIds: ZoneId[];
  source: SourceRef;
  mappingIsInference: boolean;
}
export interface BodyZone {
  id: ZoneId;
  label: string;
  functionSummary: string;
  riskIds: string[];
  /** Empty = not monitored. */
  indicatorIds: IndicatorId[];
}

export interface BaselineConfig {
  /** W: days in the baseline window (immediately before the evaluation window). */
  windowDays: number;
  /** m: days in the evaluation window ending on the as-of day. */
  evalWindowDays: number;
  /** Minimum daily values in the baseline window for status 'ready' (round 2: 5 of 7 for W 7). */
  minDays: number;
  /** Floor for the spread, in stored units. */
  minSpread: number;
}
export interface Indicator {
  id: IndicatorId;
  label: string;
  unit: string;
  /** stored value = display value x unitScale (temperature and sleep: 10). */
  unitScale: 1 | 10;
  /** Display units. */
  min: number;
  max: number;
  howToMeasure: string;
  privacy: 'shareable' | 'tierOnly';
  /** Signal group; bpSystolic and bpDiastolic share 'bp'. */
  signal: string;
  contextAware: boolean;
  baseline?: BaselineConfig;
  staleAfterDays: number;
}
export interface Reading {
  id: string;
  indicatorId: IndicatorId;
  value: number;
  day: MissionDay;
  t: MissionMinute;
  source: ReadingSource;
  context: ReadingContext;
  symptomatic: boolean;
  groupId: string;
}
export interface PersonalBaseline {
  indicatorId: IndicatorId;
  median: number;
  mad: number;
  mean: number;
  sd: number;
  n: number;
  fromDay: MissionDay;
  toDay: MissionDay;
  status: 'ready' | 'building';
}

export type Op = 'gt' | 'gte' | 'lt' | 'lte';
/** Condition values are in stored units after loading (except percentages, SD multiples and z-scores). */
export type Condition =
  | { kind: 'latest'; op: Op; value: number }
  | { kind: 'rollingMean'; days: number; minN: number; op: Op; value: number }
  | { kind: 'consecutiveDays'; days: number; op: Op; value: number }
  | { kind: 'trend'; days: number; direction: 'rising' | 'falling' }
  | { kind: 'baselineDelta' | 'baselinePct' | 'robustZ'; direction: 'above' | 'below'; value: number }
  | {
      kind: 'meanVsBaseline';
      days: number;
      minN: number;
      direction: 'above' | 'below';
      sd: number;
      /** Absolute rise over the baseline mean also required (round 2), stored units. */
      minRise: number;
    }
  | { kind: 'requiresSymptom' }
  | { kind: 'baselineBuilding' }
  | { kind: 'and'; all: Condition[] };

export type Layer = 'absolute' | 'inFlightShift' | 'baseline';
export interface Rule {
  id: string;
  description: string;
  layer: Layer;
  indicatorId: IndicatorId;
  zoneId: ZoneId;
  riskId: string;
  condition: Condition;
  /** Which readings the rule may evaluate. Context-aware indicators default to 'rest'. */
  readingContext: 'rest' | 'any';
  expectedShift?: { value: number; explainedBelowDelta: number; source: SourceRef };
  persistence?: { hits: number; ofDays: number };
  tier: Tier;
  maxTier: Tier;
  templateId: string;
  recommendationId?: string;
  source: SourceRef;
  needsVerification: boolean;
}
export interface Knowledge {
  indicators: Indicator[];
  zones: BodyZone[];
  rules: Rule[];
}

export interface Finding {
  /** Single reading: `${ruleId}:${readingId}`. Multi-day (sustained): `${ruleId}:${episodeStartDay}`. */
  key: string;
  ruleId: string;
  layer: Layer;
  indicatorId: IndicatorId;
  zoneId: ZoneId;
  tier: Tier;
  readingId: string;
  groupId: string;
  source: ReadingSource;
  /** Stat units. */
  observed: number;
  baseline?: PersonalBaseline;
  persistence?: { hits: number; ofDays: number };
  sustained: boolean;
  shiftExplained?: boolean;
  /** Temperature at or above 38.0 with no baseline yet: Notice, flagged unverified. */
  unverified?: boolean;
  latched?: boolean;
  /** Stat units: latest eligible reading of the indicator, for "Warning - latest re-measure X". */
  latestObserved?: number;
  needsVerification: boolean;
  confidence: 'low' | 'medium' | 'high';
}
export interface IndicatorStatus {
  baseline: 'ready' | 'building' | 'none';
  baselineDays: number;
  /** Days needed for 'ready'; 0 when the indicator has no baseline. */
  baselineMinDays: number;
  lastReadingT: MissionMinute | null;
  lastReadingDay: MissionDay | null;
  stale: boolean;
}
export interface ZoneEvaluation {
  zoneId: ZoneId;
  status: ZoneStatus;
  corroborated: boolean;
  findings: Finding[];
}
export interface Evaluation {
  asOf: AsOf;
  zones: Record<ZoneId, ZoneEvaluation>;
  highest: Tier | 'none';
  audiences: Audience[];
  indicatorStatus: Record<IndicatorId, IndicatorStatus>;
}
/** A routine change phrased as a proposal; the user accepts or dismisses it. Never an order. */
export interface Recommendation {
  id: string;
  zoneIds: ZoneId[];
  title: string;
  steps: string[];
  evidence: SourceRef;
  needsVerification: boolean;
}
/**
 * Explanation text keyed by rule id. Placeholders filled from the finding: {observed}, {baseline}, {delta},
 * {latest}. Plain templates only: no generated text, no diagnosis language.
 */
export interface FindingTemplate {
  id: string;
  whatChanged: string;
  whyItMatters: string;
  whatToDo: string;
  recommendationIds: string[];
}
/** Shown when a zone is raised to Caution by two sustained signals; lists the contributing findings. */
export interface CorroborationTemplate {
  title: string;
  intro: string;
  whyItMatters: string;
  whatToDo: string;
  recommendationIdsByZone: Partial<Record<ZoneId, string[]>>;
}
export interface Attribution {
  id: string;
  name: string;
  license: string;
  url: string;
  use: string;
}
export interface RecommendationDecision {
  id: string;
  recommendationId: string;
  findingKey: string;
  decision: 'accepted' | 'dismissed';
  t: MissionMinute;
}
/** Releases the latched red flags of one (zone, check-in group) with one click. */
export interface Acknowledgement {
  id: string;
  zoneId: ZoneId;
  groupId: string;
  by: 'cmo';
  t: MissionMinute;
}
export interface ProjectedItem {
  zoneId: ZoneId;
  status: ZoneStatus;
  ruleId: string;
  indicatorId: IndicatorId;
  tier: Tier;
  source: ReadingSource;
  /** Identity of the finding behind the item, and the check-in group an Acknowledge applies to. */
  findingKey: string;
  groupId: string;
  /** Red flag still active after a normal re-measure. */
  latched?: boolean;
  /** Display units; omitted when the indicator privacy is 'tierOnly' for a non-astronaut audience. */
  value?: number;
  unit?: string;
  /** Latest re-measure of a latched red flag, display units; omitted under the same privacy rule as `value`. */
  latestValue?: number;
}
export interface OutboxPayload {
  crewMember: string;
  source: ReadingSource;
  trigger: Array<{
    ruleId: string;
    indicatorId: IndicatorId;
    tier: Tier;
    source: ReadingSource;
    value?: number;
    unit?: string;
  }>;
  zoneTiers: Record<ZoneId, ZoneStatus>;
}
export interface OutboxMessage {
  id: string;
  /** `${zoneId}:${groupId}` */
  dedupeKey: string;
  zoneId: ZoneId;
  groupId: string;
  createdAt: MissionMinute;
  to: 'flightSurgeon';
  payload: OutboxPayload;
  state: 'queued' | 'held' | 'sent' | 'replyPossible';
  sentAt?: MissionMinute;
  oneWayDelayMin?: number;
  replyPossibleAt?: MissionMinute;
}
