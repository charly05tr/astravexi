import type {
  Acknowledgement,
  MissionDay,
  MissionMinute,
  OutboxMessage,
  Reading,
  RecommendationDecision,
} from './health/model';

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
