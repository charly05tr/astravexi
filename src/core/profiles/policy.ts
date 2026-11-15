import type { CrewProfile, Role } from './model';

export type Action =
  | 'checkIn'
  | 'decideRecommendation'
  | 'manageHabits'
  | 'acknowledgeAlert'
  | 'viewCrew'
  | 'manageProfiles'
  | 'manageMedicalStock'
  | 'viewMedicalRecords'
  | 'viewCabinEnvironment';

const GRANTS: Record<Exclude<Action, 'manageProfiles'>, readonly Role[]> = {
  checkIn: ['astronaut'],
  decideRecommendation: ['astronaut'],
  // Saving, checking off, archiving and deleting habits. The CMO and flight surgeon only read them, via viewCrew.
  manageHabits: ['astronaut'],
  acknowledgeAlert: ['cmo', 'flightSurgeon'],
  viewCrew: ['cmo', 'flightSurgeon'],
  // The medical kit and each astronaut's medication and allergy record are the CMO's alone.
  manageMedicalStock: ['cmo'],
  viewMedicalRecords: ['cmo'],
  // The cabin & crew analysis page (cabin variables, the CO2 comparison with the NASA ISS reference) is the CMO's alone.
  viewCabinEnvironment: ['cmo'],
};

export interface PolicyContext {
  /** How many non-deleted profiles exist. */
  profileCount?: number;
  /** How many non-deleted CMO profiles exist. */
  activeCmoCount?: number;
}

/** Builds the policy context from the profile list (soft-deleted rows are ignored). */
export function policyContextOf(profiles: readonly CrewProfile[]): PolicyContext {
  const active = profiles.filter((p) => !p.deleted);
  return { profileCount: active.length, activeCmoCount: active.filter((p) => p.role === 'cmo').length };
}

/**
 * The role policy. Pure: the UI hides what is not allowed, and the use-cases refuse it again.
 * `manageProfiles` is a CMO power, with two escape hatches so the app can never be locked out:
 * - no profile exists (bootstrap; the use-case further requires that first profile to be a CMO);
 * - profiles exist but none is an active CMO (recovery): any role may manage, to create or promote a CMO.
 */
export function can(role: Role | null, action: Action, context: PolicyContext = {}): boolean {
  if (action === 'manageProfiles') {
    return role === 'cmo' || context.profileCount === 0 || context.activeCmoCount === 0;
  }
  return role !== null && GRANTS[action].includes(role);
}

/** Thrown by a use-case when the actor's role does not allow the action. */
export class PermissionError extends Error {
  constructor(
    readonly action: Action,
    readonly role: Role | null,
  ) {
    super(`The ${role ?? 'anonymous'} role cannot perform "${action}".`);
    this.name = 'PermissionError';
  }
}

export function assertCan(role: Role | null, action: Action, context: PolicyContext = {}): void {
  if (!can(role, action, context)) throw new PermissionError(action, role);
}
