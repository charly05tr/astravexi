import type { OutboxMessage } from '../core/health/model';
import type { RecordStore } from '../core/ports';
import type { CrewProfile } from '../core/profiles/model';
import { LEGACY_PROFILE_ID } from '../core/profiles/model';
import { MISSION_META_KEY } from './adapters';

/** Set on the legacy database once its data was copied, so a later first profile never imports it twice. */
export const LEGACY_MIGRATED_META_KEY = 'migratedToProfile';

/**
 * Copies everything the pre-profile LIVE database held into the first profile's database: readings,
 * decisions, acknowledgements, outbox and the mission setup. Rows written before profiles existed get the
 * profile's id. Idempotent (every write is keyed), and the legacy database is left in place, only marked.
 * Returns false when there was nothing to move. Callers must only pass persistent stores (never the memory
 * fallback): the migrated marker is written only after the copy is read back from the target.
 */
export async function copyLegacyLiveData(legacy: RecordStore, target: RecordStore, profile: CrewProfile): Promise<boolean> {
  if ((await legacy.getMeta(LEGACY_MIGRATED_META_KEY)) !== undefined) return false;
  const snapshot = await legacy.load();
  const mission = await legacy.getMeta(MISSION_META_KEY);
  const empty =
    snapshot.manualReadings.length === 0 &&
    snapshot.decisions.length === 0 &&
    snapshot.acks.length === 0 &&
    snapshot.outbox.length === 0 &&
    mission === undefined;
  if (empty) return false;

  await target.addReadings(snapshot.manualReadings);
  for (const decision of snapshot.decisions) await target.addDecision(decision);
  for (const ack of snapshot.acks) {
    await target.addAck(ack.by.profileId === LEGACY_PROFILE_ID ? { ...ack, by: { ...ack.by, profileId: profile.id } } : ack);
  }
  for (const message of snapshot.outbox) {
    // Rows written by older builds may still carry a display name; it is dropped (outbox privacy).
    const payload: OutboxMessage['payload'] & { crewMember?: string } = { ...message.payload };
    delete payload.crewMember;
    await target.putOutboxIfAbsent({
      ...message,
      payload: payload.profileId === LEGACY_PROFILE_ID ? { ...payload, profileId: profile.id } : payload,
    });
  }
  if (mission !== undefined) await target.setMeta(MISSION_META_KEY, mission);

  // Mark the legacy database only once the copy is confirmed by reading it back from the target.
  const copied = await target.load();
  const have = new Set(copied.manualReadings.map((r) => r.id));
  if (!snapshot.manualReadings.every((r) => have.has(r.id)) || (mission !== undefined && (await target.getMeta(MISSION_META_KEY)) === undefined)) {
    throw new Error('Legacy copy could not be confirmed');
  }
  await legacy.setMeta(LEGACY_MIGRATED_META_KEY, profile.id);
  return true;
}
