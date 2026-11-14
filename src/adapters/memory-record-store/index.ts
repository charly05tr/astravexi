import type { OutboxMessage } from '../../core/health/model';
import type { RecordStore, StoreSnapshot } from '../../core/ports';

const copy = <T>(value: T): T => structuredClone(value);

/** In-memory store: the fallback when IndexedDB is unavailable, and the store used in tests. */
export function createMemoryRecordStore(name = 'memory'): RecordStore {
  let readings = new Map<string, StoreSnapshot['manualReadings'][number]>();
  let decisions = new Map<string, StoreSnapshot['decisions'][number]>();
  let acks = new Map<string, StoreSnapshot['acks'][number]>();
  let outbox = new Map<string, OutboxMessage>();
  let meta = new Map<string, unknown>();

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
      return meta.has(key) ? copy(meta.get(key) as T) : undefined;
    },
    async setMeta<T>(key: string, value: T) {
      meta.set(key, copy(value));
    },
    async clearAll() {
      readings = new Map();
      decisions = new Map();
      acks = new Map();
      outbox = new Map();
      meta = new Map();
    },
  };
}
