import type { PinHasher, ProfileStore } from '../ports';
import { isRole } from '../profiles/model';
import type { Actor, CrewProfile, Role } from '../profiles/model';
import { assertCan, policyContextOf } from '../profiles/policy';

/** Everything the profile use-cases need from the outside. */
export interface ProfileDeps {
  profiles: ProfileStore;
  pin: PinHasher;
  newId(): string;
  nowIso(): string;
}

export type ProfileResult = { ok: true; profile: CrewProfile } | { ok: false; error: string };

export const MAX_NAME_LENGTH = 40;
const PIN_PATTERN = /^\d{4,8}$/;

const fail = (error: string): ProfileResult => ({ ok: false, error });

/** Returns an error message, or null when the name is acceptable. */
export function validateProfileName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'Enter a name.';
  if (trimmed.length > MAX_NAME_LENGTH) return `Use at most ${MAX_NAME_LENGTH} characters.`;
  return null;
}

/** Returns an error message, or null when the PIN is acceptable. An empty PIN means "no PIN". */
export function validatePin(pin: string): string | null {
  return PIN_PATTERN.test(pin) ? null : 'A PIN is 4 to 8 digits.';
}

const activeCmoCount = (all: readonly CrewProfile[]) => all.filter((p) => p.role === 'cmo' && !p.deleted).length;

/** Thrown-as-result message when the first profile is not a CMO. */
export const FIRST_PROFILE_MUST_BE_CMO = 'The first profile must be the CMO (crew medical officer).';

/**
 * Creates a profile. Who may:
 * - nobody is signed in and no profile exists yet: first run, and the profile MUST be a CMO (otherwise nobody
 *   could ever manage profiles or acknowledge alerts);
 * - nobody is signed in and profiles exist (the gate's "create profile"): astronaut profiles only, so the
 *   gate cannot be used to mint a CMO;
 * - a signed-in actor: needs `manageProfiles` (a CMO).
 */
export async function createProfile(
  deps: ProfileDeps,
  actor: Actor | null,
  input: { name: string; role: Role; pin?: string },
): Promise<ProfileResult> {
  const existing = await deps.profiles.list();
  if (existing.length === 0 && input.role !== 'cmo') return fail(FIRST_PROFILE_MUST_BE_CMO);
  if (actor) assertCan(actor.role, 'manageProfiles', policyContextOf(existing));
  else if (existing.length > 0 && input.role !== 'astronaut') assertCan(null, 'manageProfiles', policyContextOf(existing));

  const nameError = validateProfileName(input.name);
  if (nameError) return fail(nameError);
  if (!isRole(input.role)) return fail('Pick a role.');
  const pin = input.pin ?? '';
  if (pin !== '') {
    const pinError = validatePin(pin);
    if (pinError) return fail(pinError);
  }
  const now = deps.nowIso();
  const profile: CrewProfile = {
    id: deps.newId(),
    name: input.name.trim(),
    role: input.role,
    ...(pin !== '' ? { pin: await deps.pin.hash(pin) } : {}),
    createdAt: now,
    updatedAt: now,
    deleted: false,
  };
  await deps.profiles.upsert(profile);
  return { ok: true, profile };
}

/** Rename, change role, or set (string) / remove (null) the PIN. CMO only. Never leaves the crew without a CMO. */
export async function updateProfile(
  deps: ProfileDeps,
  actor: Actor,
  id: string,
  patch: { name?: string; role?: Role; pin?: string | null },
): Promise<ProfileResult> {
  const all = await deps.profiles.list();
  assertCan(actor.role, 'manageProfiles', policyContextOf(all));
  const current = all.find((p) => p.id === id);
  if (!current) return fail('That profile no longer exists.');

  const next: CrewProfile = { ...current };
  if (patch.name !== undefined) {
    const error = validateProfileName(patch.name);
    if (error) return fail(error);
    next.name = patch.name.trim();
  }
  if (patch.role !== undefined) {
    if (!isRole(patch.role)) return fail('Pick a role.');
    if (current.role === 'cmo' && patch.role !== 'cmo' && activeCmoCount(all) <= 1) {
      return fail('Keep at least one CMO: promote someone else first.');
    }
    next.role = patch.role;
  }
  if (patch.pin === null) delete next.pin;
  else if (patch.pin !== undefined) {
    const error = validatePin(patch.pin);
    if (error) return fail(error);
    next.pin = await deps.pin.hash(patch.pin);
  }
  next.updatedAt = deps.nowIso();
  await deps.profiles.upsert(next);
  return { ok: true, profile: next };
}

/** Soft delete. CMO only; the last CMO cannot be deleted. */
export async function deleteProfile(
  deps: ProfileDeps,
  actor: Actor,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const all = await deps.profiles.list();
  assertCan(actor.role, 'manageProfiles', policyContextOf(all));
  const current = all.find((p) => p.id === id);
  if (!current) return { ok: false, error: 'That profile no longer exists.' };
  if (current.role === 'cmo' && activeCmoCount(all) <= 1) {
    return { ok: false, error: 'Keep at least one CMO: promote someone else first.' };
  }
  await deps.profiles.softDelete(id, deps.nowIso());
  return { ok: true };
}

/** True when the profile has no PIN, or the PIN matches. This separates profiles on a shared device. */
export async function unlockProfile(deps: Pick<ProfileDeps, 'pin'>, profile: CrewProfile, pin: string): Promise<boolean> {
  if (!profile.pin) return true;
  try {
    return await deps.pin.verify(pin, profile.pin);
  } catch {
    // A malformed stored record (bad base64, missing fields, unusable iterations) must not hang or unlock.
    throw new InvalidPinRecordError();
  }
}

/** The stored PIN record of a profile cannot be verified (corrupted or tampered). Unlocking fails closed. */
export class InvalidPinRecordError extends Error {
  constructor() {
    super('The stored PIN record is unreadable.');
    this.name = 'InvalidPinRecordError';
  }
}
