import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { Acknowledgement, OutboxMessage, Reading, RecommendationDecision } from '../../core/health/model';
import type { Habit, HabitBadge, HabitCompletion } from '../../core/habits/model';
import type { RecordStore } from '../../core/ports';
import { LEGACY_PROFILE_ID } from '../../core/profiles/model';
import { emptyChanges } from '../../core/sync/model';
import type { RecordChanges } from '../../core/sync/model';
import { isNewer, tsMs } from '../../core/sync/time';

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
  habits!: Table<Habit, string>;
  habitCompletions!: Table<HabitCompletion, string>;
  habitBadges!: Table<HabitBadge, string>;

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
    // Version 3 (habits): three new tables, nothing existing is touched. They are device-local and never synced.
    this.version(3).stores({
      habits: 'id, &sourceKey',
      habitCompletions: 'id, habitId, day',
      habitBadges: 'id',
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
    async changedSince(since) {
      const due = (updatedAt: string | undefined) => since === null || tsMs(updatedAt) >= tsMs(since);
      const changes: RecordChanges = emptyChanges();
      await db.transaction('r', [db.manualReadings, db.decisions, db.acks, db.outbox, db.meta], async () => {
        changes.manualReadings = await db.manualReadings.filter((r) => due(r.updatedAt)).toArray();
        changes.decisions = await db.decisions.filter((r) => due(r.updatedAt)).toArray();
        changes.acks = await db.acks.filter((r) => due(r.updatedAt)).toArray();
        changes.outbox = await db.outbox.filter((r) => due(r.updatedAt)).toArray();
        changes.meta = (await db.meta.filter((r) => due(r.updatedAt)).toArray()).map((r) => ({
          key: r.key,
          value: r.value,
          updatedAt: r.updatedAt,
        }));
      });
      return changes;
    },
    async applyRemote(changes) {
      let written = 0;
      await db.transaction('rw', [db.manualReadings, db.decisions, db.acks, db.outbox, db.meta], async () => {
        for (const r of changes.manualReadings) {
          const have = await db.manualReadings.get(r.id);
          if (!have || isNewer(r.updatedAt, have.updatedAt)) {
            await db.manualReadings.put(r);
            written += 1;
          }
        }
        for (const d of changes.decisions) {
          const have = await db.decisions.get(d.id);
          if (!have || isNewer(d.updatedAt, have.updatedAt)) {
            await db.decisions.put(d);
            written += 1;
          }
        }
        for (const a of changes.acks) {
          const have = await db.acks.get(a.id);
          if (have) {
            if (!isNewer(a.updatedAt, have.updatedAt)) continue;
          } else if (await db.acks.where('[zoneId+groupId]').equals([a.zoneId, a.groupId]).first()) {
            continue; // already acknowledged here under another id
          }
          await db.acks.put(a);
          written += 1;
        }
        for (const m of changes.outbox) {
          const have = await db.outbox.get(m.id);
          if (have) {
            if (!isNewer(m.updatedAt, have.updatedAt)) continue;
          } else if (await db.outbox.where('dedupeKey').equals(m.dedupeKey).first()) {
            continue; // same (zone, group) message already exists here under another id
          }
          await db.outbox.put(m);
          written += 1;
        }
        for (const m of changes.meta) {
          const have = await db.meta.get(m.key);
          if (!have || isNewer(m.updatedAt, have.updatedAt)) {
            await db.meta.put({ key: m.key, value: m.value, updatedAt: m.updatedAt });
            written += 1;
          }
        }
      });
      return written;
    },
    async loadHabits() {
      const [habits, completions, badges] = await Promise.all([
        db.habits.toArray(),
        db.habitCompletions.toArray(),
        db.habitBadges.toArray(),
      ]);
      return { habits, completions, badges };
    },
    async putHabitIfAbsent(habit) {
      return db.transaction('rw', db.habits, async () => {
        if ((await db.habits.get(habit.id)) || (await db.habits.where('sourceKey').equals(habit.sourceKey).first())) return false;
        await db.habits.add(habit);
        return true;
      });
    },
    async updateHabit(habit) {
      await db.transaction('rw', db.habits, async () => {
        if (await db.habits.get(habit.id)) await db.habits.put(habit);
      });
    },
    async deleteHabit(id) {
      await db.transaction('rw', db.habits, db.habitCompletions, async () => {
        await db.habitCompletions.where('habitId').equals(id).delete();
        await db.habits.delete(id);
      });
    },
    async putCompletion(completion) {
      await db.habitCompletions.put(completion);
    },
    async removeCompletion(habitId, day) {
      await db.habitCompletions.where('habitId').equals(habitId).and((c) => c.day === day).delete();
    },
    async putBadgeIfAbsent(badge) {
      return db.transaction('rw', db.habitBadges, async () => {
        if (await db.habitBadges.get(badge.id)) return false;
        await db.habitBadges.add(badge);
        return true;
      });
    },
    async clearAll() {
      await db.transaction(
        'rw',
        [db.manualReadings, db.decisions, db.acks, db.outbox, db.meta, db.habits, db.habitCompletions, db.habitBadges],
        async () => {
          await Promise.all([
            db.manualReadings.clear(),
            db.decisions.clear(),
            db.acks.clear(),
            db.outbox.clear(),
            db.meta.clear(),
            db.habits.clear(),
            db.habitCompletions.clear(),
            db.habitBadges.clear(),
          ]);
        },
      );
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
