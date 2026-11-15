import type { OutboxMessage } from '../../core/health/model';
import type { Habit, HabitBadge, HabitCompletion } from '../../core/habits/model';
import type { RecordStore, StoreSnapshot } from '../../core/ports';
import { emptyChanges } from '../../core/sync/model';
import type { RecordChanges } from '../../core/sync/model';
import { isNewer, tsMs } from '../../core/sync/time';

const copy = <T>(value: T): T => structuredClone(value);

/** In-memory store: the fallback when IndexedDB is unavailable, and the store used in tests. */
export function createMemoryRecordStore(name = 'memory'): RecordStore {
  let readings = new Map<string, StoreSnapshot['manualReadings'][number]>();
  let decisions = new Map<string, StoreSnapshot['decisions'][number]>();
  let acks = new Map<string, StoreSnapshot['acks'][number]>();
  let outbox = new Map<string, OutboxMessage>();
  let meta = new Map<string, { value: unknown; updatedAt: string }>();
  let habits = new Map<string, Habit>();
  let completions = new Map<string, HabitCompletion>();
  let badges = new Map<string, HabitBadge>();

  return {
    name,
    persistent: false,
    async load() {
      return {
        manualReadings: copy([...readings.values()]),
        decisions: copy([...decisions.values()]),
        acks: copy([...acks.values()]),
        outbox: copy([...outbox.values()]),
      };
    },
    async addReadings(rs) {
      for (const r of rs) readings.set(r.id, copy(r));
    },
    async addDecision(d) {
      decisions.set(d.id, copy(d));
    },
    async addAck(a) {
      // Idempotent by (zone, group), whatever the new record's id is.
      for (const existing of acks.values()) if (existing.zoneId === a.zoneId && existing.groupId === a.groupId) return;
      acks.set(a.id, copy(a));
    },
    async putOutboxIfAbsent(message) {
      for (const m of outbox.values()) if (m.dedupeKey === message.dedupeKey) return false;
      outbox.set(message.id, copy(message));
      return true;
    },
    async updateOutbox(messages) {
      for (const m of messages) outbox.set(m.id, copy(m));
    },
    async getMeta<T>(key: string) {
      return meta.has(key) ? copy(meta.get(key)!.value as T) : undefined;
    },
    async setMeta<T>(key: string, value: T) {
      meta.set(key, { value: copy(value), updatedAt: new Date().toISOString() });
    },
    async changedSince(since) {
      const due = (updatedAt: string | undefined) => since === null || tsMs(updatedAt) >= tsMs(since);
      const changes: RecordChanges = emptyChanges();
      changes.manualReadings = copy([...readings.values()].filter((r) => due(r.updatedAt)));
      changes.decisions = copy([...decisions.values()].filter((r) => due(r.updatedAt)));
      changes.acks = copy([...acks.values()].filter((r) => due(r.updatedAt)));
      changes.outbox = copy([...outbox.values()].filter((r) => due(r.updatedAt)));
      changes.meta = copy(
        [...meta.entries()].filter(([, row]) => due(row.updatedAt)).map(([key, row]) => ({ key, ...row })),
      );
      return changes;
    },
    async applyRemote(changes) {
      let written = 0;
      for (const r of changes.manualReadings) {
        const have = readings.get(r.id);
        if (!have || isNewer(r.updatedAt, have.updatedAt)) {
          readings.set(r.id, copy(r));
          written += 1;
        }
      }
      for (const d of changes.decisions) {
        const have = decisions.get(d.id);
        if (!have || isNewer(d.updatedAt, have.updatedAt)) {
          decisions.set(d.id, copy(d));
          written += 1;
        }
      }
      for (const a of changes.acks) {
        const have = acks.get(a.id);
        if (have) {
          if (!isNewer(a.updatedAt, have.updatedAt)) continue;
        } else if ([...acks.values()].some((x) => x.zoneId === a.zoneId && x.groupId === a.groupId)) {
          continue;
        }
        acks.set(a.id, copy(a));
        written += 1;
      }
      for (const m of changes.outbox) {
        const have = outbox.get(m.id);
        if (have) {
          if (!isNewer(m.updatedAt, have.updatedAt)) continue;
        } else if ([...outbox.values()].some((x) => x.dedupeKey === m.dedupeKey)) {
          continue;
        }
        outbox.set(m.id, copy(m));
        written += 1;
      }
      for (const m of changes.meta) {
        const have = meta.get(m.key);
        if (!have || isNewer(m.updatedAt, have.updatedAt)) {
          meta.set(m.key, { value: copy(m.value), updatedAt: m.updatedAt });
          written += 1;
        }
      }
      return written;
    },
    async loadHabits() {
      return {
        habits: copy([...habits.values()]),
        completions: copy([...completions.values()]),
        badges: copy([...badges.values()]),
      };
    },
    async putHabitIfAbsent(habit) {
      for (const h of habits.values()) if (h.id === habit.id || h.sourceKey === habit.sourceKey) return false;
      habits.set(habit.id, copy(habit));
      return true;
    },
    async updateHabit(habit) {
      if (habits.has(habit.id)) habits.set(habit.id, copy(habit));
    },
    async deleteHabit(id) {
      habits.delete(id);
      for (const [key, c] of completions) if (c.habitId === id) completions.delete(key);
    },
    async putCompletion(completion) {
      completions.set(completion.id, copy(completion));
    },
    async removeCompletion(habitId, day) {
      for (const [key, c] of completions) if (c.habitId === habitId && c.day === day) completions.delete(key);
    },
    async putBadgeIfAbsent(badge) {
      if (badges.has(badge.id)) return false;
      badges.set(badge.id, copy(badge));
      return true;
    },
    async clearAll() {
      readings = new Map();
      decisions = new Map();
      acks = new Map();
      outbox = new Map();
      meta = new Map();
      habits = new Map();
      completions = new Map();
      badges = new Map();
    },
  };
}
