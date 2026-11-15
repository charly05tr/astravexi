import type { DeviceCredentialStore, SyncGateway } from '../ports';
import { SyncRateLimitError, SyncUnavailableError, SyncValidationError } from './errors';
import { initialSyncState } from './model';
import type { DeviceCredentials } from './model';

export const MAX_DEVICE_NAME_LENGTH = 120;

export interface EnrollDeps {
  gateway: SyncGateway;
  credentials: DeviceCredentialStore;
  nowIso(): string;
}

export type EnrollResult =
  | { ok: true; credentials: DeviceCredentials }
  | { ok: false; reason: 'input' | 'invalid_code' | 'rate_limited' | 'unavailable'; error: string };

const fail = (reason: Extract<EnrollResult, { ok: false }>['reason'], error: string): EnrollResult => ({
  ok: false,
  reason,
  error,
});

/**
 * Exchanges a single-use enrollment code for a device token and stores it (with a clean sync state).
 * The server answers one message for a wrong, used or expired code, so the app does too.
 */
export async function enrollDevice(deps: EnrollDeps, input: { code: string; name: string }): Promise<EnrollResult> {
  const code = input.code.trim();
  const name = input.name.trim();
  if (code === '') return fail('input', 'Enter the enrollment code.');
  if (name === '') return fail('input', 'Name this device, for example "CMO laptop".');
  if (name.length > MAX_DEVICE_NAME_LENGTH) return fail('input', `Use at most ${MAX_DEVICE_NAME_LENGTH} characters for the name.`);

  try {
    const { deviceId, token } = await deps.gateway.enroll({ code, name });
    const credentials: DeviceCredentials = { deviceId, token, deviceName: name, enrolledAt: deps.nowIso() };
    await deps.credentials.set(credentials);
    await deps.credentials.setState(initialSyncState());
    return { ok: true, credentials };
  } catch (error) {
    if (error instanceof SyncValidationError) {
      return fail('invalid_code', 'That code is invalid, already used or expired. Ask for a new one.');
    }
    if (error instanceof SyncRateLimitError) {
      return fail('rate_limited', 'Too many attempts. Wait a few minutes and try again.');
    }
    if (error instanceof SyncUnavailableError) {
      return fail('unavailable', 'Could not reach the server. Check your connection and try again.');
    }
    return fail('unavailable', 'Enrollment failed. Try again.');
  }
}
