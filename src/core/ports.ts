import type {
  Acknowledgement,
  IndicatorId,
  MissionDay,
  MissionMinute,
  OutboxMessage,
  Reading,
  RecommendationDecision,
  SourceRef,
  Tier,
  ZoneId,
  ZoneStatus,
} from './health/model';

/** One finding that crossed a threshold, as a suggestion provider sees it. */
export interface SuggestionFinding {
  /** The finding key decisions are stored against (or `corroboration:<zone>`). */
  key: string;
  ruleId: string | null;
  indicatorId: IndicatorId | null;
  indicatorLabel: string;
  tier: Tier;
  /** Plain-language "what changed" line, already filled from its template. */
  whatChanged: string;
  /** Curated recommendation ids the knowledge base links to this finding. */
  recommendationIds: readonly string[];
}

/**
 * Everything a provider may use to suggest routine changes for one zone. It carries tiers and explanation
 * text, never raw mood scores, so an LLM adapter can send it off-device without a privacy review per field.
 */
export interface SuggestionContext {
  zone: { id: ZoneId; label: string; status: ZoneStatus };
  missionDay: MissionDay;
  findings: readonly SuggestionFinding[];
  decisions: readonly RecommendationDecision[];
}

export interface Suggestion {
  /** Stable id: decisions are stored as (id, findingKey). */
  id: string;
  findingKey: string;
  title: string;
  steps: readonly string[];
  /** Why this suggestion, tied to the finding it answers. */
  rationale: string;
  evidence: SourceRef | null;
  needsVerification: boolean;
  /** Who produced it. The UI labels generated advice differently from curated advice. */
  origin: 'rules' | 'llm';
  decision?: 'accepted';
}

/**
 * Suggests changes to the daily routine when a zone has findings. Async on purpose: today a rule lookup
 * answers at once, tomorrow an LLM adapter answers over the network behind the same contract.
 */
export interface SuggestionProvider {
  readonly id: string;
  suggest(context: SuggestionContext, options?: { signal?: AbortSignal }): Promise<Suggestion[]>;
}

/** Everything the record store holds. Synthetic history is never part of it. */
export interface StoreSnapshot {
  manualReadings: Reading[];
  decisions: RecommendationDecision[];
  acks: Acknowledgement[];
  outbox: OutboxMessage[];
}

/** Local persistence. One instance per mode; the two modes never share a store. */
export interface RecordStore {
  /** Database name, for diagnostics and isolation tests. */
  readonly name: string;
  /** False when this is the in-memory fallback: entries will not survive a reload. */
  readonly persistent: boolean;
  load(): Promise<StoreSnapshot>;
  addReadings(readings: readonly Reading[]): Promise<void>;
  addDecision(decision: RecommendationDecision): Promise<void>;
  /** Idempotent by id: acknowledging the same (zone, group) twice stores one record. */
  addAck(ack: Acknowledgement): Promise<void>;
  /** Stores the message only when its dedupeKey is unknown. Returns true when it was stored. */
  putOutboxIfAbsent(message: OutboxMessage): Promise<boolean>;
  /** Writes the given (changed) messages. Callers pass only what changed. */
  updateOutbox(messages: readonly OutboxMessage[]): Promise<void>;
  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta<T>(key: string, value: T): Promise<void>;
  /** Deletes every table. Only the DEMO reset use-case may call it. */
  clearAll(): Promise<void>;
}

export interface HistorySource {
  /** Deterministic synthetic readings up to and including `throughDay`. LIVE returns none. */
  generate(seed: number, throughDay: MissionDay): Reading[];
}

export interface MissionClock {
  /** 1-based mission day. */
  today(): MissionDay;
  /** Integer minutes since launch. */
  now(): MissionMinute;
  /** Label for the delay control, e.g. "1 s = 1 min". */
  readonly scaleLabel: string;
}

/** Persisted mode choice. Generic so the core does not know the app's mode names. */
export interface ModePreference<M extends string = string> {
  get(): M | null;
  set(mode: M): void;
}
