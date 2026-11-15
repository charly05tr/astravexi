import type { DeviceCredentialStore, ProfileStore, RecordStore, SyncGateway } from '../ports';
import type { CrewProfile } from '../profiles/model';
import { SyncAuthError, SyncRateLimitError, SyncUnavailableError, SyncValidationError } from './errors';
import { changesToWire, profileToWire, wireToChanges, wireToProfile } from './mapping';
import { changeCount, initialSyncState } from './model';
import type { DeviceCredentials, ItemStatus, RecordKind, SyncIssue, SyncLastError, SyncState } from './model';
import { laterOf, tsMs } from './time';

/** The server accepts at most this many items per request in practice; stay at or under it. */
export const MAX_BATCH = 200;
export const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGES = 1000;

export interface SyncDeps {
  gateway: SyncGateway;
  credentials: DeviceCredentialStore;
  /** The LIVE profile store of this device. */
  profiles: ProfileStore;
  /** Opens the LIVE record database of one profile (throws when it cannot be persisted). */
  openRecords(profileId: string): Promise<RecordStore>;
  nowIso(): string;
  batchSize?: number;
  pageSize?: number;
}

export interface SyncRunResult {
  /** `disconnected`: the token was revoked and the credentials were cleared. */
  outcome: 'ok' | 'disconnected' | 'error' | 'not-enrolled';
  pushed: number;
  /** Rows actually written locally (rows that were not newer than the local copy are not counted). */
  pulled: number;
  /** Profiles whose row or records changed locally: a UI showing one of them should reload. */
  changedProfileIds: string[];
  error: SyncLastError | null;
}

const chunk = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

interface Tally {
  forbidden: number;
  future: number;
  sampleForbidden?: SyncIssue['sample'];
  sampleFuture?: SyncIssue['sample'];
}

function tally(t: Tally, status: ItemStatus, sample: SyncIssue['sample']) {
  if (status === 'forbidden') {
    t.forbidden += 1;
    t.sampleForbidden ??= sample;
  } else if (status === 'rejected_future') {
    t.future += 1;
    t.sampleFuture ??= sample;
  }
  // `applied` is fine, and so is `stale`: the server already holds a newer copy and the pull brings it.
}

/**
 * One sync: push local changes, then pull the server's. Pure orchestration over ports.
 *
 * Push: the device's profiles, then, per profile, every row of its LIVE database changed since that profile's
 * watermark. A watermark moves only after every chunk of its stage succeeded, and not at all when the server
 * answered `rejected_future` for an item (the clock is ahead: the row must be retried). `forbidden` moves it:
 * retrying would never help, and the issue is recorded in the sync state instead.
 *
 * Pull: pages with `cursor` while `has_more`, upserts last-write-wins by `updatedAt` (never overwriting a newer
 * local row; the 120 s server overlap makes redelivery normal), and stores `next_since` only after the last page.
 */
export async function runSync(deps: SyncDeps): Promise<SyncRunResult> {
  const creds = await deps.credentials.get();
  if (!creds) return { outcome: 'not-enrolled', pushed: 0, pulled: 0, changedProfileIds: [], error: null };

  const state = await deps.credentials.getState();
  const changed = new Set<string>();
  const counts = { pushed: 0, pulled: 0 };

  /** Persists only while this device is still the enrolled one (Disconnect may happen mid-run). */
  const persist = async () => {
    const now = await deps.credentials.get();
    if (now?.token === creds.token) await deps.credentials.setState(state);
  };

  try {
    counts.pushed = await push(deps, creds, state, persist);
    counts.pulled = await pull(deps, creds, state, changed, persist);
    state.lastError = null;
    state.lastSyncAt = deps.nowIso();
    await persist();
    return { outcome: 'ok', ...counts, changedProfileIds: [...changed], error: null };
  } catch (error) {
    const at = deps.nowIso();
    if (error instanceof SyncAuthError) {
      const still = await deps.credentials.get();
      if (still?.token !== creds.token) {
        return { outcome: 'not-enrolled', ...counts, changedProfileIds: [...changed], error: null };
      }
      await deps.credentials.clear();
      const last: SyncLastError = { code: 'disconnected', message: error.message, at };
      await deps.credentials.setState({ ...initialSyncState(), lastError: last });
      return { outcome: 'disconnected', ...counts, changedProfileIds: [...changed], error: last };
    }
    const last = toLastError(error, at);
    state.lastError = last;
    await persist().catch(() => undefined);
    return { outcome: 'error', ...counts, changedProfileIds: [...changed], error: last };
  }
}

function toLastError(error: unknown, at: string): SyncLastError {
  if (error instanceof SyncRateLimitError) return { code: 'rate_limited', message: error.message, at };
  if (error instanceof SyncUnavailableError) return { code: 'unavailable', message: error.message, at };
  if (error instanceof SyncValidationError) return { code: 'rejected', message: error.message, at };
  return { code: 'storage', message: error instanceof Error ? error.message : String(error), at };
}

const newest = (profiles: readonly CrewProfile[]): string | null =>
  profiles.reduce<string | null>((acc, p) => laterOf(acc, p.updatedAt), null);

async function push(
  deps: SyncDeps,
  creds: DeviceCredentials,
  state: SyncState,
  persist: () => Promise<void>,
): Promise<number> {
  const size = Math.max(1, Math.min(deps.batchSize ?? MAX_BATCH, MAX_BATCH));
  const t: Tally = { forbidden: 0, future: 0 };
  let sent = 0;

  // 1. Profiles. Included in full when their `updatedAt` is at or after the watermark.
  const all = await deps.profiles.list({ includeDeleted: true });
  const wm = state.pushed.profiles;
  const dueProfiles = all.filter((p) => wm === null || tsMs(p.updatedAt) >= tsMs(wm));
  if (dueProfiles.length > 0) {
    const futureBefore = t.future;
    for (const part of chunk(dueProfiles.map(profileToWire), size)) {
      const res = await deps.gateway.push(creds.token, { profiles: part, records: [] });
      for (const item of res.profiles) tally(t, item.status, { profileId: item.id });
      sent += part.length;
    }
    if (t.future === futureBefore) state.pushed.profiles = newest(dueProfiles);
    await persist();
  }

  // 2. Records, one LIVE database per profile.
  for (const profile of all) {
    const store = await deps.openRecords(profile.id);
    const changes = await store.changedSince(state.pushed.records[profile.id] ?? null);
    if (changeCount(changes) === 0) continue;
    const wire = changesToWire(profile.id, changes);
    const futureBefore = t.future;
    for (const part of chunk(wire, size)) {
      const res = await deps.gateway.push(creds.token, { profiles: [], records: part });
      for (const item of res.records) {
        tally(t, item.status, { profileId: item.profile, recordKind: item.kind as RecordKind, clientId: item.client_id });
      }
      sent += part.length;
    }
    if (t.future === futureBefore) {
      const newestRow = wire.reduce<string | null>((acc, w) => laterOf(acc, w.client_updated_at), null);
      if (newestRow) state.pushed.records[profile.id] = newestRow;
    }
    await persist();
  }

  const at = deps.nowIso();
  // Forbidden items are never retried, so the issue stays until the device is disconnected.
  if (t.forbidden > 0 && t.sampleForbidden) {
    const prev = state.issues.forbidden;
    state.issues.forbidden = {
      kind: 'forbidden',
      count: (prev?.count ?? 0) + t.forbidden,
      sample: prev?.sample ?? t.sampleForbidden,
      at,
    };
  }
  // Rejected-future items are retried every run, so this is recomputed from scratch.
  state.issues.rejectedFuture =
    t.future > 0 && t.sampleFuture ? { kind: 'rejected_future', count: t.future, sample: t.sampleFuture, at } : null;
  await persist();
  return sent;
}

async function pull(
  deps: SyncDeps,
  creds: DeviceCredentials,
  state: SyncState,
  changed: Set<string>,
  persist: () => Promise<void>,
): Promise<number> {
  const limit = deps.pageSize ?? DEFAULT_PAGE_SIZE;
  const stores = new Map<string, RecordStore>();
  const storeOf = async (id: string) => {
    let s = stores.get(id);
    if (!s) {
      s = await deps.openRecords(id);
      stores.set(id, s);
    }
    return s;
  };

  let written = 0;
  let cursor: string | undefined;
  let nextSince: string | null;
  for (let page = 0; ; page += 1) {
    if (page >= MAX_PAGES) throw new SyncUnavailableError('The server kept paging without finishing.');
    const query = cursor ? { cursor, limit } : { ...(state.lastSince ? { since: state.lastSince } : {}), limit };
    const res = await deps.gateway.pull(creds.token, query);

    for (const wire of res.profiles) {
      const profile = wireToProfile(wire);
      if (profile && (await deps.profiles.upsertIfNewer(profile))) {
        written += 1;
        changed.add(profile.id);
      }
    }
    for (const [profileId, changes] of wireToChanges(res.records)) {
      const n = await (await storeOf(profileId)).applyRemote(changes);
      if (n > 0) {
        written += n;
        changed.add(profileId);
      }
    }

    nextSince = res.next_since;
    if (!res.has_more) break;
    if (!res.next_cursor || res.next_cursor === cursor) {
      throw new SyncUnavailableError('The server sent a paging cursor that does not advance.');
    }
    cursor = res.next_cursor;
  }

  // Only now, after the last page, is it safe to move the pull watermark.
  if (nextSince) state.lastSince = nextSince;
  await persist();
  return written;
}
