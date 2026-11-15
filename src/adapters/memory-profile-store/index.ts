import type { ProfileStore } from '../../core/ports';
import type { CrewProfile } from '../../core/profiles/model';
import { isNewer } from '../../core/sync/time';

const copy = <T>(value: T): T => structuredClone(value);

/** In-memory profiles: the fallback when IndexedDB is unavailable, and the store used in tests. */
export function createMemoryProfileStore(name = 'memory-profiles'): ProfileStore {
  const rows = new Map<string, CrewProfile>();
  return {
    name,
    persistent: false,
    async list(options) {
      return copy(
        [...rows.values()]
          .filter((p) => options?.includeDeleted || !p.deleted)
          .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1)),
      );
    },
    async get(id) {
      const row = rows.get(id);
      return row ? copy(row) : undefined;
    },
    async upsert(profile) {
      rows.set(profile.id, copy(profile));
    },
    async softDelete(id, updatedAt) {
      const row = rows.get(id);
      if (row) rows.set(id, { ...row, deleted: true, updatedAt });
    },
    async upsertIfNewer(profile) {
      const have = rows.get(profile.id);
      if (have && !isNewer(profile.updatedAt, have.updatedAt)) return false;
      const pin = profile.pin ?? have?.pin;
      rows.set(profile.id, copy({ ...profile, ...(pin ? { pin } : {}) }));
      return true;
    },
  };
}
