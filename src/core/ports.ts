import type { FollowUpSuggestion } from './follow-up/blocks';
import type { PartialFollowUp } from './follow-up/partial';
import type { CrewProfile, PinRecord } from './profiles/model';
import type {
  DeviceCredentials,
  PullQuery,
  PullResponse,
  PushRequest,
  PushResponse,
  RecordChanges,
  SyncState,
} from './sync/model';
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

/**
 * What a follow-up provider may use: the recommendation the astronaut just accepted, the finding(s) behind it
 * and a few recent shareable readings. Tiers and explanation text only for findings; readings of `tierOnly`
 * indicators (mood) are never included, so this can leave the device.
 */
export interface FollowUpContext {
  accepted: { id: string; title: string; steps: readonly string[]; rationale: string };
  zone: { id: ZoneId; label: string; status: ZoneStatus };
  missionDay: MissionDay;
  findings: ReadonlyArray<{ indicatorLabel: string; tier: Tier; whatChanged: string }>;
  readings: ReadonlyArray<{
    indicator: string;
    unit: string;
    value: number;
    day: MissionDay;
    context: 'rest' | 'exercise';
  }>;
}

/**
 * Proposes what to do next once a recommendation was accepted. The rules stay the source of truth: this only
 * builds on an accepted recommendation and never changes a tier. It rejects with a `FollowUpError`; callers
 * fall back to showing just the accepted recommendation.
 */
export interface FollowUpSuggestionProvider {
  readonly id: string;
  /** False until the user configured it (for an LLM adapter: a key and a model). */
  isConfigured(): boolean;
  /** Notifies when configuration changes. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** `onPartial` receives the finished, valid parts while the answer is still streaming. */
  suggest(
    context: FollowUpContext,
    options?: { signal?: AbortSignal; onPartial?: (partial: PartialFollowUp) => void },
  ): Promise<FollowUpSuggestion>;
}

/** Lists the models a key can call, which doubles as a connection test. Rejects with a `FollowUpError`. */
export interface AiModelCatalog {
  listModels(settings: Pick<AiSettings, 'apiKey' | 'baseUrl'>, options?: { signal?: AbortSignal }): Promise<string[]>;
  /** The model to prefer from a listing, or null when it is empty. */
  pickDefault(models: readonly string[]): string | null;
}

/** The user's own model access (bring your own key). Kept on the device; never synced. */
export interface AiSettings {
  apiKey: string;
  model: string;
  /** OpenAI-compatible base URL, e.g. a hosted endpoint or a local server. */
  baseUrl: string;
  /** True when the key may be kept across browser sessions on this device. */
  remember: boolean;
}

export interface AiSettingsStore {
  readonly presets: { readonly models: readonly string[]; readonly defaultBaseUrl: string };
  get(): AiSettings;
  set(settings: AiSettings): void;
  /** Forgets the key and every saved setting, in memory and in storage. */
  clear(): void;
  isConfigured(): boolean;
  subscribe(listener: () => void): () => void;
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
  /** Idempotent by (zone, group): acknowledging the same pair twice stores one record, whatever the ids. */
  addAck(ack: Acknowledgement): Promise<void>;
  /** Stores the message only when its dedupeKey is unknown. Returns true when it was stored. */
  putOutboxIfAbsent(message: OutboxMessage): Promise<boolean>;
  /** Writes the given (changed) messages. Callers pass only what changed. */
  updateOutbox(messages: readonly OutboxMessage[]): Promise<void>;
  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta<T>(key: string, value: T): Promise<void>;
  /** Every row (all kinds, and the meta rows) whose `updatedAt` is at or after `since`; null returns everything. */
  changedSince(since: string | null): Promise<RecordChanges>;
  /**
   * Applies rows that came from the server, last-write-wins: a row is written only when it is absent or its
   * `updatedAt` is strictly newer than the stored one, so a newer local row is never overwritten. An
   * acknowledgement for a (zone, group) already acknowledged, and an outbox message whose dedupeKey is already
   * taken by another id, are skipped. Idempotent. Returns how many rows were written.
   */
  applyRemote(changes: RecordChanges): Promise<number>;
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

/** Persisted profiles of one mode. Soft delete only: a deleted row stays so the deletion can sync. */
export interface ProfileStore {
  readonly name: string;
  readonly persistent: boolean;
  /** Non-deleted profiles by default, oldest first. */
  list(options?: { includeDeleted?: boolean }): Promise<CrewProfile[]>;
  /** Also returns a deleted profile. */
  get(id: string): Promise<CrewProfile | undefined>;
  /** Inserts or replaces by id. */
  upsert(profile: CrewProfile): Promise<void>;
  /** Marks the profile deleted and bumps `updatedAt`. No-op for an unknown id. */
  softDelete(id: string, updatedAt: string): Promise<void>;
  /**
   * Last-write-wins upsert for a profile that came from the server: stores it when it is absent or its
   * `updatedAt` is strictly newer. The server never holds a PIN, so the stored PIN is kept when the incoming
   * profile has none. Returns true when the row was written.
   */
  upsertIfNewer(profile: CrewProfile): Promise<boolean>;
}

/** Which profile this device last used in a mode. Same shape as the mode preference. */
export interface ActiveProfile {
  get(): string | null;
  set(profileId: string): void;
  clear(): void;
}

/** Derives a PIN record and checks a PIN against it. The core never touches WebCrypto. */
export interface PinHasher {
  hash(pin: string): Promise<PinRecord>;
  verify(pin: string, record: PinRecord): Promise<boolean>;
}

/** The HTTP API of the backend. `token` is the device token; it never appears in logs or errors. */
export interface SyncGateway {
  /** Exchanges a single-use enrollment code for a device id and token. Throws the typed errors of `core/sync/errors`. */
  enroll(input: { code: string; name: string }): Promise<{ deviceId: string; token: string }>;
  push(token: string, body: PushRequest): Promise<PushResponse>;
  pull(token: string, query: PullQuery): Promise<PullResponse>;
}

/** Device-wide enrollment and sync state. LIVE only; not per profile, and never written in DEMO. */
export interface DeviceCredentialStore {
  get(): Promise<DeviceCredentials | null>;
  set(credentials: DeviceCredentials): Promise<void>;
  /** Removes the credentials and resets the sync state (watermarks included). */
  clear(): Promise<void>;
  getState(): Promise<SyncState>;
  setState(state: SyncState): Promise<void>;
}
