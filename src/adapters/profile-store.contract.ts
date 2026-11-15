import { describe, expect, it } from 'vitest';
import type { ProfileStore } from '../core/ports';
import type { CrewProfile } from '../core/profiles/model';

const T0 = '2026-06-01T10:00:00.000Z';

export const profile = (id: string, over: Partial<CrewProfile> = {}): CrewProfile => ({
  id,
  name: `Name ${id}`,
  role: 'astronaut',
  createdAt: T0,
  updatedAt: T0,
  deleted: false,
  ...over,
});

/** The same behavior is required of the in-memory and the Dexie profile store. */
export function profileStoreContract(label: string, create: () => Promise<ProfileStore>) {
  describe(`ProfileStore contract: ${label}`, () => {
    it('starts empty', async () => {
      const store = await create();
      expect(await store.list()).toEqual([]);
      expect(await store.get('nope')).toBeUndefined();
    });

    it('upserts by id and returns what it stored, including the PIN record', async () => {
      const store = await create();
      const p = profile('a', { pin: { hash: 'h', salt: 's', iterations: 10 } });
      await store.upsert(p);
      expect(await store.get('a')).toEqual(p);
      await store.upsert({ ...p, name: 'Renamed', role: 'cmo' });
      expect(await store.list()).toHaveLength(1);
      expect((await store.get('a'))?.name).toBe('Renamed');
    });

    it('lists oldest first', async () => {
      const store = await create();
      await store.upsert(profile('late', { createdAt: '2026-06-03T00:00:00.000Z' }));
      await store.upsert(profile('early', { createdAt: '2026-06-01T00:00:00.000Z' }));
      expect((await store.list()).map((p) => p.id)).toEqual(['early', 'late']);
    });

    it('soft delete hides the profile from list() but keeps the row with a newer updatedAt', async () => {
      const store = await create();
      await store.upsert(profile('a'));
      await store.upsert(profile('b'));
      await store.softDelete('a', '2026-06-02T00:00:00.000Z');
      expect((await store.list()).map((p) => p.id)).toEqual(['b']);
      expect((await store.list({ includeDeleted: true })).map((p) => p.id).sort()).toEqual(['a', 'b']);
      expect(await store.get('a')).toMatchObject({ deleted: true, updatedAt: '2026-06-02T00:00:00.000Z' });
    });

    it('soft delete of an unknown id is a no-op', async () => {
      const store = await create();
      await store.softDelete('ghost', '2026-06-02T00:00:00.000Z');
      expect(await store.list({ includeDeleted: true })).toEqual([]);
    });

    describe('upsertIfNewer', () => {
      it('inserts a profile that is absent', async () => {
        const store = await create();
        expect(await store.upsertIfNewer(profile('new'))).toBe(true);
        expect(await store.get('new')).toEqual(profile('new'));
      });

      it('replaces only with a strictly newer updatedAt, never with an older or equal one', async () => {
        const store = await create();
        await store.upsert(profile('a', { name: 'Local', updatedAt: '2026-06-02T00:00:00.000Z' }));
        expect(await store.upsertIfNewer(profile('a', { name: 'Older', updatedAt: '2026-06-01T00:00:00.000Z' }))).toBe(false);
        expect(await store.upsertIfNewer(profile('a', { name: 'Equal', updatedAt: '2026-06-02T00:00:00.000Z' }))).toBe(false);
        expect((await store.get('a'))?.name).toBe('Local');
        expect(await store.upsertIfNewer(profile('a', { name: 'Newer', updatedAt: '2026-06-03T00:00:00.000Z' }))).toBe(true);
        expect((await store.get('a'))?.name).toBe('Newer');
      });

      it('compares instants, not strings', async () => {
        const store = await create();
        await store.upsert(profile('a', { name: 'Local', updatedAt: '2026-06-02T00:00:00.123Z' }));
        expect(await store.upsertIfNewer(profile('a', { name: 'Same', updatedAt: '2026-06-02T00:00:00.123000Z' }))).toBe(false);
      });

      it('keeps the local PIN when the incoming profile (from the server) has none', async () => {
        const store = await create();
        const pin = { hash: 'h', salt: 's', iterations: 10 };
        await store.upsert(profile('a', { pin }));
        await store.upsertIfNewer(profile('a', { name: 'Renamed', updatedAt: '2026-06-09T00:00:00.000Z' }));
        expect(await store.get('a')).toMatchObject({ name: 'Renamed', pin });
      });

      it('brings a tombstone in as a soft delete', async () => {
        const store = await create();
        await store.upsert(profile('a'));
        await store.upsertIfNewer(profile('a', { deleted: true, updatedAt: '2026-06-09T00:00:00.000Z' }));
        expect(await store.list()).toEqual([]);
        expect((await store.get('a'))?.deleted).toBe(true);
      });
    });
  });
}
