import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { Acknowledgement, OutboxMessage, Reading, RecommendationDecision } from '../../core/health/model';
import type { RecordStore } from '../../core/ports';

interface MetaRow {
  key: string;
  value: unknown;
}

class AstravexiDb extends Dexie {
  manualReadings!: Table<Reading, string>;
  decisions!: Table<RecommendationDecision, string>;
  acks!: Table<Acknowledgement, string>;
  outbox!: Table<OutboxMessage, string>;
  meta!: Table<MetaRow, string>;

  constructor(name: string) {
    super(name);
    // Version 1. LIVE schema changes must add a new version with an upgrade; they never wipe.
    this.version(1).stores({
      manualReadings: 'id, day, indicatorId',
      decisions: 'id, t',
      acks: 'id',
      outbox: 'id, &dedupeKey, state',
      meta: 'key',
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
      await db.acks.put(ack);
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
      await db.meta.put({ key, value });
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
