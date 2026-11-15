import { isRole } from '../profiles/model';
import type { CrewProfile } from '../profiles/model';
import type { RecordChanges, RecordKind, WireProfile, WireRecord } from './model';
import { emptyChanges } from './model';
import { parseIso, tsMs } from './time';

const EPOCH = '1970-01-01T00:00:00.000Z';

export function profileToWire(p: CrewProfile): WireProfile {
  // The PIN record never leaves the device.
  return { id: p.id, name: p.name, role: p.role, created_at: p.createdAt, updated_at: p.updatedAt, deleted: p.deleted };
}

/** Null when the server row is not a usable profile. The result has no PIN: the server never holds one. */
export function wireToProfile(w: WireProfile): CrewProfile | null {
  if (typeof w?.id !== 'string' || w.id === '' || typeof w.name !== 'string' || !isRole(w.role)) return null;
  if (parseIso(w.updated_at) === null || parseIso(w.created_at) === null) return null;
  return {
    id: w.id,
    name: w.name,
    role: w.role,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
    deleted: w.deleted === true,
  };
}

/** Maps every changed row of one profile's database to wire records. Meta rows are keyed by their key. */
export function changesToWire(profileId: string, c: RecordChanges): WireRecord[] {
  const out: WireRecord[] = [];
  const add = (kind: RecordKind, clientId: string, payload: unknown, updatedAt: string | undefined) =>
    out.push({
      profile: profileId,
      kind,
      client_id: clientId,
      payload,
      client_updated_at: updatedAt ?? EPOCH,
      deleted: false,
    });
  for (const r of c.manualReadings) add('manualReading', r.id, r, r.updatedAt);
  for (const d of c.decisions) add('decision', d.id, d, d.updatedAt);
  for (const a of c.acks) add('ack', a.id, a, a.updatedAt);
  for (const m of c.outbox) add('outbox', m.id, m, m.updatedAt);
  for (const m of c.meta) add('meta', m.key, { key: m.key, value: m.value }, m.updatedAt);
  return out;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Keeps the entity's own `updatedAt` string when it is the same instant as the server's, so strings stay stable. */
const stamp = (payload: Record<string, unknown>, clientUpdatedAt: string): string =>
  typeof payload.updatedAt === 'string' && tsMs(payload.updatedAt) === tsMs(clientUpdatedAt)
    ? payload.updatedAt
    : clientUpdatedAt;

/**
 * Groups pulled records by profile into typed rows. Tombstones are skipped (no record kind is ever deleted
 * locally), and so are unknown kinds and malformed payloads: one bad row must not fail the whole pull.
 */
export function wireToChanges(records: readonly WireRecord[]): Map<string, RecordChanges> {
  const byProfile = new Map<string, RecordChanges>();
  for (const w of records) {
    if (w?.deleted === true || typeof w?.profile !== 'string' || typeof w.client_id !== 'string') continue;
    if (!isObject(w.payload) || parseIso(w.client_updated_at) === null) continue;
    const changes = byProfile.get(w.profile) ?? emptyChanges();
    const updatedAt = stamp(w.payload, w.client_updated_at);
    // The row identity is the server's (profile, kind, client_id): never trust an id inside the payload.
    const entity = { ...w.payload, id: w.client_id, updatedAt };
    switch (w.kind) {
      case 'manualReading':
        changes.manualReadings.push(entity as unknown as RecordChanges['manualReadings'][number]);
        break;
      case 'decision':
        changes.decisions.push(entity as unknown as RecordChanges['decisions'][number]);
        break;
      case 'ack':
        changes.acks.push(entity as unknown as RecordChanges['acks'][number]);
        break;
      case 'outbox':
        changes.outbox.push(entity as unknown as RecordChanges['outbox'][number]);
        break;
      case 'meta':
        changes.meta.push({ key: w.client_id, value: w.payload.value, updatedAt: w.client_updated_at });
        break;
      default:
        continue; // routine / routineProgress: not stored on the device yet
    }
    byProfile.set(w.profile, changes);
  }
  return byProfile;
}
