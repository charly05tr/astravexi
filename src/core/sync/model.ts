import type { Acknowledgement, OutboxMessage, Reading, RecommendationDecision } from '../health/model';
import type { Role } from '../profiles/model';

/** The record kinds the server accepts. `routine` and `routineProgress` are reserved and not produced yet. */
export type RecordKind = 'manualReading' | 'decision' | 'ack' | 'outbox' | 'meta' | 'routine' | 'routineProgress';

export type ItemStatus = 'applied' | 'stale' | 'forbidden' | 'rejected_future';

export interface DeviceCredentials {
  deviceId: string;
  token: string;
  deviceName: string;
  /** ISO-8601 time of enrollment. */
  enrolledAt: string;
}

/** A row of the device-wide key/value (meta) table, as it travels. */
export interface MetaEntry {
  key: string;
  value: unknown;
  updatedAt: string;
}

/** Typed rows of one LIVE record database. Used both for "changed since" and for "apply remote". */
export interface RecordChanges {
  manualReadings: Reading[];
  decisions: RecommendationDecision[];
  acks: Acknowledgement[];
  outbox: OutboxMessage[];
  meta: MetaEntry[];
}

export const emptyChanges = (): RecordChanges => ({ manualReadings: [], decisions: [], acks: [], outbox: [], meta: [] });

export const changeCount = (c: RecordChanges): number =>
  c.manualReadings.length + c.decisions.length + c.acks.length + c.outbox.length + c.meta.length;

// --- Wire format (mirrors backend/README.md "API contract") ------------------------------------------------

export interface WireProfile {
  id: string;
  name: string;
  role: Role;
  created_at: string;
  updated_at: string;
  deleted: boolean;
  server_updated_at?: string;
}

export interface WireRecord {
  profile: string;
  kind: RecordKind;
  client_id: string;
  payload: unknown;
  client_updated_at: string;
  deleted: boolean;
  server_updated_at?: string;
}

export interface PushRequest {
  profiles: WireProfile[];
  records: WireRecord[];
}

export interface PushResponse {
  profiles: Array<{ id: string; status: ItemStatus }>;
  records: Array<{ profile: string; kind: RecordKind; client_id: string; status: ItemStatus }>;
}

export interface PullQuery {
  since?: string;
  cursor?: string;
  profile?: string;
  limit?: number;
}

export interface PullResponse {
  profiles: WireProfile[];
  records: WireRecord[];
  has_more: boolean;
  next_cursor: string | null;
  next_since: string | null;
}

// --- Persisted sync state ----------------------------------------------------------------------------------

/** What a push could not do, kept so the UI can surface it. `rejected_future` means the device clock is ahead. */
export interface SyncIssue {
  kind: 'forbidden' | 'rejected_future';
  count: number;
  /** First offending item, for diagnostics. */
  sample: { profileId: string; recordKind?: RecordKind; clientId?: string };
  at: string;
}

export interface SyncLastError {
  /** `disconnected`: the token was revoked. The rest are transient or request-level. */
  code: 'disconnected' | 'rate_limited' | 'unavailable' | 'rejected' | 'storage' | 'unknown';
  message: string;
  at: string;
}

export interface SyncState {
  /** `next_since` of the last pull that finished. Null: pull everything. */
  lastSince: string | null;
  /** ISO time of the last run that finished without an error. */
  lastSyncAt: string | null;
  lastError: SyncLastError | null;
  /**
   * Push watermarks: the newest `updatedAt` of the rows included in the last fully accepted push. A row is
   * pushed again while its `updatedAt` is at or after the watermark, so a write in the same millisecond as the
   * watermark is never lost (the server answers `stale` for an unchanged row).
   */
  pushed: { profiles: string | null; records: Record<string, string> };
  issues: { forbidden: SyncIssue | null; rejectedFuture: SyncIssue | null };
}

export const initialSyncState = (): SyncState => ({
  lastSince: null,
  lastSyncAt: null,
  lastError: null,
  pushed: { profiles: null, records: {} },
  issues: { forbidden: null, rejectedFuture: null },
});
