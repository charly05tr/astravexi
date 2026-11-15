import type { Audience } from '../health/model';

/** The role a profile plays. It is the same set as the audiences the escalation routes to. */
export type Role = Audience;

export const ROLES: readonly Role[] = ['astronaut', 'cmo', 'flightSurgeon'];

export function isRole(value: unknown): value is Role {
  return value === 'astronaut' || value === 'cmo' || value === 'flightSurgeon';
}

/** PBKDF2 output of an optional PIN. Base64 strings, so the record is plain JSON. */
export interface PinRecord {
  hash: string;
  salt: string;
  iterations: number;
}

/**
 * One person using the app on this device. `id` is a UUID and doubles as the stable pseudonymous id
 * that travels with outbox messages and, later, with sync. Timestamps are ISO-8601 UTC strings.
 */
export interface CrewProfile {
  id: string;
  name: string;
  role: Role;
  /** Optional. A PIN separates profiles on a shared device; it is not a security boundary. */
  pin?: PinRecord;
  createdAt: string;
  updatedAt: string;
  /** Soft delete: the row stays so the deletion can sync. */
  deleted: boolean;
}

/** Who performs an action: enough to enforce the role policy and to stamp what they wrote. */
export interface Actor {
  profileId: string;
  name: string;
  role: Role;
}

/** Whose data the stores hold. In LIVE it is the profile that owns the database. */
export interface Subject {
  profileId: string;
  name: string;
}

export const toActor = (p: Pick<CrewProfile, 'id' | 'name' | 'role'>): Actor => ({
  profileId: p.id,
  name: p.name,
  role: p.role,
});

/** Placeholder profile id on rows written before profiles existed. Adoption into a real profile rewrites it. */
export const LEGACY_PROFILE_ID = 'legacy';
