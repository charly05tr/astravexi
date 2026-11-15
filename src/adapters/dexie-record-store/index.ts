import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { Acknowledgement, OutboxMessage, Reading, RecommendationDecision } from '../../core/health/model';
import type { RecordStore } from '../../core/ports';
import { LEGACY_PROFILE_ID } from '../../core/profiles/model';

interface MetaRow {
  key: string;
  value: unknown;
  updatedAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const nowIso = () => new Date().toISOString();

interface Row {
  id: string;
  updatedAt?: string;
  by?: unknown;
  payload?: Record<string, unknown>;
}

/** Re-keys a table to UUIDs and stamps `updatedAt`. A primary key cannot be modified in place, so rows are rewritten. */
async function rekey(table: Table<Row, string>, fix: (row: Row) => Row = (r) => r): Promise<void> {
  const rows = await table.toArray();
  const stamp = nowIso();
  await table.clear();
  await table.bulkAdd(
    rows.map((row) => fix({ ...row, id: UUID.test(row.id) ? row.id : crypto.randomUUID(), updatedAt: row.updatedAt ?? stamp })),
  );
}

class AstravexiDb extends Dexie {
  manualReadings!: Table<Reading, string>;
  decisions!: Table<RecommendationDecision, string>;
  acks!: Table<Acknowledgement, string>;
  outbox!: Table<OutboxMessage, string>;
  meta!: Table<MetaRow, string>;

  constructor(name: string) {
    super(name);
    // LIVE schema changes must add a new version with an upgrade; they never wipe.
    this.version(1).stores({
      manualReadings: 'id, day, indicatorId',
      decisions: 'id, t',
      acks: 'id',
      outbox: 'id, &dedupeKey, state',
      meta: 'key',
    });
    // Version 2 (sync-ready): every id becomes a UUID, every row gets `updatedAt`, acknowledgements carry the
    // acknowledging profile and role instead of the literal 'cmo', and outbox payloads carry a profile id.
    this.version(2)
      .stores({
        manualReadings: 'id, day, indicatorId',
        decisions: 'id, t',
        acks: 'id, [zoneId+groupId]',
        outbox: 'id, &dedupeKey, state',
        meta: 'key',
      })
      .upgrade(async (tx) => {
        await rekey(tx.table('manualReadings'));
        await rekey(tx.table('decisions'));
        await rekey(tx.table('acks'), (row) =>
          typeof row.by === 'string' ? { ...row, by: { profileId: LEGACY_PROFILE_ID, role: row.by } } : row,
        );
        await rekey(tx.table('outbox'), (row) => ({
          ...row,
          payload: { ...row.payload, profileId: row.payload?.profileId ?? LEGACY_PROFILE_ID },
        }));
        const stamp = nowIso();
        await tx.table('meta').toCollection().modify((row: MetaRow) => {
          row.updatedAt ??= stamp;
        });
      });
  }
}

export interface DexieStoreOptions {
  /** DEMO only: on a schema mismatch, delete the database and reopen it empty (the seed regenerates). */
  wipeOnSchemaError?: boolean;
}

/** Opens the named database. Rejects when IndexedDB is unavailable; the caller falls back to memory. */
export async function openDexieRecordStore(name: string, options: DexieStoreOptions = {}): Promise<RecordStore> {
  let db = new AstravexiDb(name);
  try {
    await db.open();
  } catch (error) {
    if (options.wipeOnSchemaError && error instanceof Dexie.DexieError && error.name === 'VersionError') {
      await Dexie.delete(name);
      db = new AstravexiDb(name);
      await db.open();
    } else {
      throw error;
    }
  }

  return {
    name,
    persistent: true,
    async load() {
      const [manualReadings, decisions, acks, outbox] = await Promise.all([
        db.manualReadings.toArray(),
        db.decisions.toArray(),
        db.acks.toArray(),
        db.outbox.toArray(),
      ]);
      return { manualReadings, decisions, acks, outbox };
    },
    async addReadings(readings) {
      await db.manualReadings.bulkPut([...readings]);
    },
    async addDecision(decision) {
      await db.decisions.put(decision);
    },
    async addAck(ack) {
      // Idempotent by (zone, group), whatever the new record's id is.
      await db.transaction('rw', db.acks, async () => {
        const existing = await db.acks.where('[zoneId+groupId]').equals([ack.zoneId, ack.groupId]).first();
        if (!existing) await db.acks.put(ack);
      });
    },
    async putOutboxIfAbsent(message) {
      return db.transaction('rw', db.outbox, async () => {
        const existing = await db.outbox.where('dedupeKey').equals(message.dedupeKey).first();
        if (existing) return false;
        await db.outbox.add(message);
        return true;
      });
    },
    async updateOutbox(messages) {
      if (messages.length > 0) await db.outbox.bulkPut([...messages]);
    },
    async getMeta<T>(key: string) {
      const row = await db.meta.get(key);
      return row ? (row.value as T) : undefined;
    },
    async setMeta<T>(key: string, value: T) {
      await db.meta.put({ key, value, updatedAt: nowIso() });
    },
    async clearAll() {
      await db.transaction('rw', [db.manualReadings, db.decisions, db.acks, db.outbox, db.meta], async () => {
        await Promise.all([
          db.manualReadings.clear(),
          db.decisions.clear(),
          db.acks.clear(),
          db.outbox.clear(),
          db.meta.clear(),
        ]);
      });
    },
  };
}

/** True when a database of that name already exists (never creates it). False when IndexedDB is unavailable. */
export async function dexieDatabaseExists(name: string): Promise<boolean> {
  try {
    return await Dexie.exists(name);
  } catch {
    return false;
  }
}
