import { createMemoryRecordStore } from '../adapters/memory-record-store';
import type { RecordStore } from '../core/ports';
import { composeAdapters } from '../app/composition-root';
import type { StoreOpenResult } from '../app/composition-root';
import type { AppMode } from '../app/mode';
import { DB_NAME } from '../app/mode';
import { createAppStore } from '../app/store/app-store';

/** A controllable wall time and a set of in-memory databases that outlive each composed app instance. */
export function createTestWorld(startMs = new Date(2026, 5, 15, 9, 0, 0).getTime()) {
  const time = { ms: startMs };
  const databases = new Map<string, RecordStore>();
  const opened: string[] = [];
  const wrap = new Map<string, (s: RecordStore) => RecordStore>();

  const open = async (name: string): Promise<StoreOpenResult> => {
    opened.push(name);
    let store = databases.get(name);
    if (!store) {
      const base = createMemoryRecordStore(name);
      store = wrap.get(name)?.(base) ?? base;
      databases.set(name, store);
    }
    return { store, storageAvailable: true };
  };

  async function app(mode: AppMode) {
    const adapters = await composeAdapters(mode, { nowMs: () => time.ms, open });
    const store = createAppStore(adapters);
    await store.getState().hydrate();
    return { adapters, store, state: () => store.getState() };
  }

  return {
    time,
    databases,
    opened,
    /** Wrap the database `name` (before it is first opened) with a spy or a gate. */
    instrument(mode: AppMode, wrapper: (s: RecordStore) => RecordStore) {
      wrap.set(DB_NAME[mode], wrapper);
    },
    /** Advance real time by whole seconds. */
    wait(seconds: number) {
      time.ms += seconds * 1000;
    },
    app,
  };
}

export type TestWorld = ReturnType<typeof createTestWorld>;
