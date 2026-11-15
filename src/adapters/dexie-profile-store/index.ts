import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { ProfileStore } from '../../core/ports';
import type { CrewProfile } from '../../core/profiles/model';
import { isNewer } from '../../core/sync/time';

class ProfilesDb extends Dexie {
  profiles!: Table<CrewProfile, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({ profiles: 'id, role, updatedAt' });
  }
}

/** Opens the named profiles database. Rejects when IndexedDB is unavailable; the caller falls back to memory. */
export async function openDexieProfileStore(name: string): Promise<ProfileStore> {
  const db = new ProfilesDb(name);
  await db.open();
  return {
    name,
    persistent: true,
    async list(options) {
      const all = await db.profiles.toArray();
      return all
        .filter((p) => options?.includeDeleted || !p.deleted)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1));
    },
    get: (id) => db.profiles.get(id),
    async upsert(profile) {
      await db.profiles.put({ ...profile });
    },
    async softDelete(id, updatedAt) {
      await db.transaction('rw', db.profiles, async () => {
        const row = await db.profiles.get(id);
        if (row) await db.profiles.put({ ...row, deleted: true, updatedAt });
      });
    },
    upsertIfNewer: (profile) =>
      db.transaction('rw', db.profiles, async () => {
        const have = await db.profiles.get(profile.id);
        if (have && !isNewer(profile.updatedAt, have.updatedAt)) return false;
        const pin = profile.pin ?? have?.pin;
        await db.profiles.put({ ...profile, ...(pin ? { pin } : {}) });
        return true;
      }),
  };
}
