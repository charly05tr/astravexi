import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryProfileStore } from '../adapters/memory-profile-store';
import type { PinHasher } from '../core/ports';
import { toActor } from '../core/profiles/model';
import type { Actor, CrewProfile } from '../core/profiles/model';
import { PermissionError } from '../core/profiles/policy';
import { FIRST_PROFILE_MUST_BE_CMO, InvalidPinRecordError, createProfile, deleteProfile, unlockProfile, updateProfile, validatePin, validateProfileName } from '../core/use-cases/profiles';
import type { ProfileDeps } from '../core/use-cases/profiles';

/** A fake hasher: the real PBKDF2 one has its own tests. */
const fakePin: PinHasher = {
  async hash(pin) {
    return { hash: `h:${pin}`, salt: 's', iterations: 1 };
  },
  async verify(pin, record) {
    return record.hash === `h:${pin}`;
  },
};

let deps: ProfileDeps;
let n: number;
let tick: number;

beforeEach(() => {
  n = 0;
  tick = 0;
  deps = {
    profiles: createMemoryProfileStore(),
    pin: fakePin,
    newId: () => `id-${(n += 1)}`,
    nowIso: () => `2026-06-01T00:00:${String((tick += 1)).padStart(2, '0')}.000Z`,
  };
});

const must = async (p: ReturnType<typeof createProfile>): Promise<CrewProfile> => {
  const r = await p;
  if (!r.ok) throw new Error(r.error);
  return r.profile;
};
const cmoOf = (p: CrewProfile): Actor => toActor(p);

describe('createProfile', () => {
  it('lets anyone create the first profile as a CMO, and stores it as not deleted', async () => {
    const p = await must(createProfile(deps, null, { name: '  Ada  ', role: 'cmo' }));
    expect(p).toMatchObject({ id: 'id-1', name: 'Ada', role: 'cmo', deleted: false });
    expect(p.pin).toBeUndefined();
    expect(p.createdAt).toBe(p.updatedAt);
    expect(await deps.profiles.list()).toHaveLength(1);
  });

  it('rejects a first profile that is not a CMO, and stores nothing', async () => {
    for (const role of ['astronaut', 'flightSurgeon'] as const) {
      expect(await createProfile(deps, null, { name: 'Ada', role })).toEqual({ ok: false, error: FIRST_PROFILE_MUST_BE_CMO });
    }
    expect(await deps.profiles.list({ includeDeleted: true })).toEqual([]);
  });

  it('counts only non-deleted profiles: once all are deleted, the next first profile must be a CMO again', async () => {
    const cmo = await must(createProfile(deps, null, { name: 'Ada', role: 'cmo' }));
    await deps.profiles.softDelete(cmo.id, '2026-01-02T00:00:00.000Z');
    expect(await createProfile(deps, null, { name: 'Bo', role: 'astronaut' })).toEqual({ ok: false, error: FIRST_PROFILE_MUST_BE_CMO });
    expect(await createProfile(deps, null, { name: 'Bo', role: 'cmo' })).toMatchObject({ ok: true });
  });

  it('recovery: with profiles but no active CMO, a signed-in astronaut can create a CMO; once one exists it cannot', async () => {
    const legacy: CrewProfile = { id: 'legacy', name: 'Old', role: 'astronaut', createdAt: 't', updatedAt: 't', deleted: false };
    await deps.profiles.upsert(legacy);
    const made = await must(createProfile(deps, toActor(legacy), { name: 'Ada', role: 'cmo' }));
    expect(made.role).toBe('cmo');
    await expect(createProfile(deps, toActor(legacy), { name: 'X', role: 'astronaut' })).rejects.toBeInstanceOf(PermissionError);
  });

  it('recovery: with no active CMO, a signed-in astronaut can promote themselves; the last CMO stays protected', async () => {
    const legacy: CrewProfile = { id: 'legacy', name: 'Old', role: 'astronaut', createdAt: 't', updatedAt: 't', deleted: false };
    await deps.profiles.upsert(legacy);
    expect(await updateProfile(deps, toActor(legacy), 'legacy', { role: 'cmo' })).toMatchObject({ ok: true });
    expect(await updateProfile(deps, { ...toActor(legacy), role: 'cmo' }, 'legacy', { role: 'astronaut' })).toMatchObject({ ok: false });
    await expect(updateProfile(deps, toActor(legacy), 'legacy', { name: 'X' })).rejects.toBeInstanceOf(PermissionError);
  });

  it('hashes the PIN and never stores it in clear', async () => {
    await must(createProfile(deps, null, { name: 'Chief', role: 'cmo' }));
    const p = await must(createProfile(deps, null, { name: 'Ada', role: 'astronaut', pin: '2468' }));
    expect(p.pin).toEqual({ hash: 'h:2468', salt: 's', iterations: 1 });
    expect(JSON.stringify(await deps.profiles.get(p.id))).not.toContain('"2468"');
  });

  it('without a signed-in actor, once profiles exist, only astronaut profiles can be created', async () => {
    await must(createProfile(deps, null, { name: 'Ada', role: 'cmo' }));
    await must(createProfile(deps, null, { name: 'Bo', role: 'astronaut' }));
    await expect(createProfile(deps, null, { name: 'Eve', role: 'cmo' })).rejects.toBeInstanceOf(PermissionError);
    await expect(createProfile(deps, null, { name: 'Eve', role: 'flightSurgeon' })).rejects.toBeInstanceOf(PermissionError);
  });

  it('a signed-in astronaut or flight surgeon cannot manage profiles; a cmo can', async () => {
    const cmo = await must(createProfile(deps, null, { name: 'Ada', role: 'cmo' }));
    const astro = await must(createProfile(deps, null, { name: 'Bo', role: 'astronaut' }));
    const doc = await must(createProfile(deps, cmoOf(cmo), { name: 'Cy', role: 'flightSurgeon' }));
    await expect(createProfile(deps, toActor(astro), { name: 'X', role: 'astronaut' })).rejects.toBeInstanceOf(PermissionError);
    await expect(createProfile(deps, toActor(doc), { name: 'X', role: 'astronaut' })).rejects.toBeInstanceOf(PermissionError);
    expect(await deps.profiles.list()).toHaveLength(3);
  });

  it('rejects a bad name or PIN without storing anything', async () => {
    expect(await createProfile(deps, null, { name: '   ', role: 'cmo' })).toEqual({ ok: false, error: 'Enter a name.' });
    expect(await createProfile(deps, null, { name: 'x'.repeat(41), role: 'cmo' })).toMatchObject({ ok: false });
    expect(await createProfile(deps, null, { name: 'Ada', role: 'cmo', pin: '12' })).toEqual({
      ok: false,
      error: 'A PIN is 4 to 8 digits.',
    });
    expect(await createProfile(deps, null, { name: 'Ada', role: 'cmo', pin: 'abcd' })).toMatchObject({ ok: false });
    expect(await deps.profiles.list({ includeDeleted: true })).toEqual([]);
  });

  it('validates names and PINs', () => {
    expect(validateProfileName('Ada')).toBeNull();
    expect(validatePin('1234')).toBeNull();
    expect(validatePin('123456789')).not.toBeNull();
  });
});

describe('updateProfile and deleteProfile', () => {
  async function crew() {
    const cmo = await must(createProfile(deps, null, { name: 'Ada', role: 'cmo' }));
    const astro = await must(createProfile(deps, cmoOf(cmo), { name: 'Bo', role: 'astronaut', pin: '1111' }));
    return { cmo, astro };
  }

  it('renames, changes role and bumps updatedAt', async () => {
    const { cmo, astro } = await crew();
    const renamed = await updateProfile(deps, cmoOf(cmo), astro.id, { name: ' Bo B. ', role: 'flightSurgeon' });
    expect(renamed).toMatchObject({ ok: true, profile: { name: 'Bo B.', role: 'flightSurgeon' } });
    const stored = await deps.profiles.get(astro.id);
    expect(stored!.updatedAt > astro.updatedAt).toBe(true);
  });

  it('sets, changes and removes a PIN', async () => {
    const { cmo, astro } = await crew();
    await updateProfile(deps, cmoOf(cmo), astro.id, { pin: null });
    expect((await deps.profiles.get(astro.id))!.pin).toBeUndefined();
    await updateProfile(deps, cmoOf(cmo), astro.id, { pin: '9999' });
    expect((await deps.profiles.get(astro.id))!.pin?.hash).toBe('h:9999');
    expect(await updateProfile(deps, cmoOf(cmo), astro.id, { pin: '9' })).toMatchObject({ ok: false });
  });

  it('refuses everyone but a cmo', async () => {
    const { cmo, astro } = await crew();
    await expect(updateProfile(deps, toActor(astro), cmo.id, { name: 'Hacked' })).rejects.toBeInstanceOf(PermissionError);
    await expect(deleteProfile(deps, toActor(astro), cmo.id)).rejects.toBeInstanceOf(PermissionError);
    expect((await deps.profiles.get(cmo.id))!.name).toBe('Ada');
  });

  it('soft deletes: the profile leaves the list but the row stays', async () => {
    const { cmo, astro } = await crew();
    expect(await deleteProfile(deps, cmoOf(cmo), astro.id)).toEqual({ ok: true });
    expect((await deps.profiles.list()).map((p) => p.id)).toEqual([cmo.id]);
    expect(await deps.profiles.get(astro.id)).toMatchObject({ deleted: true });
  });

  it('never leaves the crew without a cmo: not by delete, not by demotion', async () => {
    const { cmo } = await crew();
    expect(await deleteProfile(deps, cmoOf(cmo), cmo.id)).toMatchObject({ ok: false });
    expect(await updateProfile(deps, cmoOf(cmo), cmo.id, { role: 'astronaut' })).toMatchObject({ ok: false });
    const second = await must(createProfile(deps, cmoOf(cmo), { name: 'Di', role: 'cmo' }));
    expect(await updateProfile(deps, cmoOf(cmo), cmo.id, { role: 'astronaut' })).toMatchObject({ ok: true });
    expect(await deleteProfile(deps, toActor(second), second.id)).toMatchObject({ ok: false }); // now the last one
  });

  it('reports an unknown id instead of throwing', async () => {
    const { cmo } = await crew();
    expect(await updateProfile(deps, cmoOf(cmo), 'ghost', { name: 'X' })).toMatchObject({ ok: false });
    expect(await deleteProfile(deps, cmoOf(cmo), 'ghost')).toMatchObject({ ok: false });
  });
});

describe('unlockProfile', () => {
  it('passes a profile without a PIN and checks one with a PIN', async () => {
    await must(createProfile(deps, null, { name: 'Chief', role: 'cmo' }));
    const open = await must(createProfile(deps, null, { name: 'Ada', role: 'astronaut' }));
    const locked = await must(createProfile(deps, null, { name: 'Bo', role: 'astronaut', pin: '1234' }));
    expect(await unlockProfile(deps, open, '')).toBe(true);
    expect(await unlockProfile(deps, locked, '1234')).toBe(true);
    expect(await unlockProfile(deps, locked, '4321')).toBe(false);
  });

  it('fails closed with InvalidPinRecordError on a malformed stored PIN record', async () => {
    const throwing: PinHasher = {
      ...fakePin,
      async verify() {
        throw new Error('bad base64');
      },
    };
    const broken = { ...(await must(createProfile(deps, null, { name: 'Chief', role: 'cmo', pin: '1234' }))), pin: { hash: '%%', salt: '', iterations: 0 } };
    await expect(unlockProfile({ pin: throwing }, broken, '1234')).rejects.toBeInstanceOf(InvalidPinRecordError);
  });
});
