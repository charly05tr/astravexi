import type { SyncGateway } from '../core/ports';
import { SyncAuthError, SyncUnavailableError, SyncValidationError } from '../core/sync/errors';
import type {
  ItemStatus,
  PullQuery,
  PullResponse,
  PushRequest,
  PushResponse,
  RecordKind,
  WireProfile,
  WireRecord,
} from '../core/sync/model';

const OVERLAP_MS = 120_000;
const MAX_FUTURE_MS = 300_000;

interface StoredProfile {
  owner: string;
  wire: WireProfile;
  serverMs: number;
}
interface StoredRecord {
  owner: string;
  wire: WireRecord;
  serverMs: number;
}

/** Server time as the backend prints it: microsecond precision, `Z`. */
const stamp = (ms: number) => new Date(ms).toISOString().replace('Z', '000Z');

export interface FakeServerOptions {
  /** Server wall clock in ms (default: now). Advances by 1 s per write. */
  startMs?: number;
  /** Caps `limit` per collection, to force paging. */
  pageLimit?: number;
}

/**
 * An in-memory stand-in for the Django backend, faithful to backend/README.md: per-device ownership, per-item
 * statuses, last-write-wins by client timestamp, a 120 s pull overlap and keyset paging with a cursor.
 */
export function createFakeSyncServer(options: FakeServerOptions = {}) {
  let clock = options.startMs ?? Date.now();
  const profiles = new Map<string, StoredProfile>();
  const records = new Map<string, StoredRecord>();
  const tokens = new Map<string, string>();
  const log = { push: [] as PushRequest[], pull: [] as PullQuery[] };
  const failures: Array<() => Error | null> = [];
  let deviceCounter = 0;

  const tick = () => (clock += 1000);
  const deviceOf = (token: string): string => {
    const id = tokens.get(token);
    if (!id) throw new SyncAuthError();
    return id;
  };
  const maybeFail = () => {
    const next = failures.shift();
    const error = next?.();
    if (error) throw error;
  };
  const key = (p: string, k: RecordKind, id: string) => `${p}\u0000${k}\u0000${id}`;

  function item(owner: string | undefined, device: string, clientMs: number, existingMs: number | null): ItemStatus {
    if (owner !== undefined && owner !== device) return 'forbidden';
    if (clientMs > clock + MAX_FUTURE_MS) return 'rejected_future';
    if (existingMs !== null && clientMs <= existingMs) return 'stale';
    return 'applied';
  }

  function gatewayFor(deviceToken: string | null): SyncGateway {
    return {
      async enroll() {
        throw new Error('use server.gateway.enroll');
      },
      async push(token, body) {
        maybeFail();
        const device = deviceOf(token ?? deviceToken ?? '');
        log.push.push(structuredClone(body));
        const out: PushResponse = { profiles: [], records: [] };
        for (const p of body.profiles) {
          if (typeof p.id !== 'string' || !p.updated_at) throw new SyncValidationError();
          const have = profiles.get(p.id);
          const status = item(have?.owner, device, Date.parse(p.updated_at), have ? Date.parse(have.wire.updated_at) : null);
          if (status === 'applied') profiles.set(p.id, { owner: device, wire: structuredClone(p), serverMs: tick() });
          out.profiles.push({ id: p.id, status });
        }
        for (const r of body.records) {
          if (typeof r.client_id !== 'string' || !r.client_updated_at) throw new SyncValidationError();
          const profile = profiles.get(r.profile);
          const k = key(r.profile, r.kind, r.client_id);
          const have = records.get(k);
          const status = profile && profile.owner === device
            ? item(device, device, Date.parse(r.client_updated_at), have ? Date.parse(have.wire.client_updated_at) : null)
            : 'forbidden';
          if (status === 'applied') records.set(k, { owner: device, wire: structuredClone(r), serverMs: tick() });
          out.records.push({ profile: r.profile, kind: r.kind, client_id: r.client_id, status });
        }
        return out;
      },
      async pull(token, query) {
        maybeFail();
        const device = deviceOf(token ?? deviceToken ?? '');
        log.pull.push({ ...query });
        const limit = Math.min(query.limit ?? 500, options.pageLimit ?? 1000);
        let lower = 0;
        let running = 0;
        let pi = 0;
        let ri = 0;
        if (query.cursor) {
          ({ lower, running, pi, ri } = JSON.parse(query.cursor) as { lower: number; running: number; pi: number; ri: number });
        } else if (query.since) {
          running = Date.parse(query.since);
          lower = running - OVERLAP_MS;
        }
        const mine = <T extends { owner: string; serverMs: number }>(all: Iterable<T>) =>
          [...all].filter((x) => x.owner === device && x.serverMs >= lower).sort((a, b) => a.serverMs - b.serverMs);
        const allP = mine(profiles.values());
        const allR = mine(records.values());
        const pRows = allP.slice(pi, pi + limit);
        const rRows = allR.slice(ri, ri + limit);
        const hasMore = pi + limit < allP.length || ri + limit < allR.length;
        for (const x of [...pRows, ...rRows]) running = Math.max(running, x.serverMs);
        const nextSince = running > 0 ? stamp(running) : null;
        const res: PullResponse = {
          profiles: pRows.map((p) => ({ ...structuredClone(p.wire), server_updated_at: stamp(p.serverMs) })),
          records: rRows.map((r) => ({ ...structuredClone(r.wire), server_updated_at: stamp(r.serverMs) })),
          has_more: hasMore,
          next_cursor: hasMore ? JSON.stringify({ lower, running, pi: pi + limit, ri: ri + limit }) : null,
          next_since: nextSince,
        };
        return res;
      },
    };
  }

  return {
    profiles,
    records,
    log,
    /** Registers a device and returns its token (what a successful enrollment would produce). */
    addDevice(): { deviceId: string; token: string; gateway: SyncGateway } {
      deviceCounter += 1;
      const deviceId = `device-${deviceCounter}`;
      const token = `token-${deviceCounter}`;
      tokens.set(token, deviceId);
      return { deviceId, token, gateway: gatewayFor(token) };
    },
    /** A gateway whose `enroll` accepts only `validCode`. Other methods authenticate by the token they are given. */
    gatewayWithEnrollment(validCode: string): SyncGateway {
      const base = gatewayFor(null);
      return {
        ...base,
        enroll: async ({ code }) => {
          if (code !== validCode) throw new SyncValidationError();
          const d = this.addDevice();
          return { deviceId: d.deviceId, token: d.token };
        },
      };
    },
    revoke(token: string) {
      tokens.delete(token);
    },
    /** Makes the next requests fail with these errors (null entries let a request through). */
    failNext(...errors: Array<Error | null>) {
      for (const e of errors) failures.push(() => e);
    },
    unavailable: () => new SyncUnavailableError(),
    /** Test hook: change the server clock. */
    setClock(ms: number) {
      clock = ms;
    },
    now: () => clock,
    /** Writes a row as if another request had stored it, owned by `device`. */
    seedProfile(deviceId: string, wire: WireProfile) {
      profiles.set(wire.id, { owner: deviceId, wire, serverMs: tick() });
    },
    seedRecord(deviceId: string, wire: WireRecord) {
      records.set(key(wire.profile, wire.kind, wire.client_id), { owner: deviceId, wire, serverMs: tick() });
    },
  };
}

export type FakeSyncServer = ReturnType<typeof createFakeSyncServer>;
