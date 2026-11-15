import { describe, expect, it } from 'vitest';
import { ROLES } from './model';
import type { Role } from './model';
import { PermissionError, assertCan, can, policyContextOf } from './policy';
import type { Action } from './policy';

const ACTIONS: Action[] = ['checkIn', 'decideRecommendation', 'acknowledgeAlert', 'viewCrew', 'manageProfiles'];

const MATRIX: Record<Role, Action[]> = {
  astronaut: ['checkIn', 'decideRecommendation'],
  cmo: ['acknowledgeAlert', 'viewCrew', 'manageProfiles'],
  flightSurgeon: ['acknowledgeAlert', 'viewCrew'],
};

describe('role policy', () => {
  for (const role of ROLES) {
    it(`grants ${role} exactly its actions`, () => {
      const granted = ACTIONS.filter((a) => can(role, a, { profileCount: 3 }));
      expect(granted.sort()).toEqual([...MATRIX[role]].sort());
    });
  }

  it('lets anyone manage profiles while none exist (bootstrap), and only a cmo afterwards', () => {
    for (const role of [...ROLES, null]) expect(can(role, 'manageProfiles', { profileCount: 0 })).toBe(true);
    expect(can('astronaut', 'manageProfiles', { profileCount: 1 })).toBe(false);
    expect(can('flightSurgeon', 'manageProfiles', { profileCount: 1 })).toBe(false);
    expect(can(null, 'manageProfiles', { profileCount: 1 })).toBe(false);
    expect(can('cmo', 'manageProfiles', { profileCount: 1 })).toBe(true);
  });

  it('recovery: with profiles but no active CMO, any role may manage profiles', () => {
    for (const role of ROLES) expect(can(role, 'manageProfiles', { profileCount: 2, activeCmoCount: 0 })).toBe(true);
    expect(can('astronaut', 'manageProfiles', { profileCount: 2, activeCmoCount: 1 })).toBe(false);
  });

  it('policyContextOf ignores soft-deleted profiles', () => {
    const base = { name: 'x', createdAt: 't', updatedAt: 't' };
    const ctx = policyContextOf([
      { ...base, id: '1', role: 'cmo', deleted: true },
      { ...base, id: '2', role: 'astronaut', deleted: false },
    ]);
    expect(ctx).toEqual({ profileCount: 1, activeCmoCount: 0 });
    expect(can('astronaut', 'manageProfiles', ctx)).toBe(true);
  });

  it('grants nothing else to an anonymous caller', () => {
    for (const a of ACTIONS.filter((x) => x !== 'manageProfiles')) expect(can(null, a)).toBe(false);
  });

  it('assertCan throws a PermissionError that names the action and role', () => {
    expect(() => assertCan('astronaut', 'acknowledgeAlert')).toThrow(PermissionError);
    expect(() => assertCan('cmo', 'acknowledgeAlert')).not.toThrow();
  });
});
