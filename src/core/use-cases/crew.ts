import type { Acknowledgement, Evaluation, MissionMinute, Reading, ZoneId } from '../health/model';
import { deriveHabitsView } from '../habits/gamification';
import type { HabitsView } from '../habits/gamification';
import type { HistorySource, ProfileStore, RecordStore } from '../ports';
import type { CrewProfile, Role } from '../profiles/model';
import { assertCan } from '../profiles/policy';
import { type Deps, evaluateSession } from './session';

/** The data of one crew member: where their records live and where their synthetic history comes from. */
export interface CrewMemberData {
  store: RecordStore;
  history: HistorySource;
  seed: number;
}

/**
 * Where the crew review finds its data. Built by the composition root: LIVE opens one database per profile,
 * DEMO maps each demo profile to its own synthetic history. The core never learns which.
 */
export interface CrewSource {
  profiles: ProfileStore;
  open(profile: CrewProfile): Promise<CrewMemberData>;
}

/** One crew member as the review sees them. Carries no PIN material. */
export interface CrewMember {
  profileId: string;
  name: string;
  role: Role;
  /** Synthetic and manual readings together, as the engine received them. */
  readings: readonly Reading[];
  acks: readonly Acknowledgement[];
  evaluation: Evaluation;
  /** Mission minute of the latest reading at or before now; null when there is none. */
  lastReadingT: MissionMinute | null;
  /** The member's habits and progress, for the CMO to read. Read-only: there is no use-case that writes them here. */
  habits: HabitsView;
}

export interface CrewReview {
  members: CrewMember[];
  /** Profiles whose records could not be read. They are listed, never silently dropped. */
  unavailable: Array<{ profileId: string; name: string }>;
}

async function buildMember(deps: Deps, profile: CrewProfile, data: CrewMemberData): Promise<CrewMember | null> {
  const snapshot = await data.store.load();
  // The CMO and the flight surgeon do not check in; they only appear once they have recorded something.
  if (profile.role !== 'astronaut' && snapshot.manualReadings.length === 0) return null;
  const synthetic = data.history.generate(data.seed, deps.clock.today());
  const evaluation = evaluateSession(deps, { synthetic, manual: snapshot.manualReadings, acks: snapshot.acks });
  const readings = [...synthetic, ...snapshot.manualReadings];
  const now = deps.clock.now();
  let lastReadingT: MissionMinute | null = null;
  for (const r of readings) {
    if (r.t <= now && (lastReadingT === null || r.t > lastReadingT)) lastReadingT = r.t;
  }
  return {
    profileId: profile.id,
    name: profile.name,
    role: profile.role,
    readings,
    acks: snapshot.acks,
    evaluation,
    lastReadingT,
    habits: deriveHabitsView(await data.store.loadHabits(), deps.clock.today()),
  };
}

/**
 * Evaluates every local profile with the same pipeline the session uses (same engine, same clock, same
 * knowledge), each against its own records. Read-only. CMO and flight surgeon only.
 */
export async function loadCrew(deps: Deps, source: CrewSource): Promise<CrewReview> {
  assertCan(deps.actor.role, 'viewCrew');
  const profiles = await source.profiles.list();
  const review: CrewReview = { members: [], unavailable: [] };
  for (const profile of profiles) {
    try {
      const member = await buildMember(deps, profile, await source.open(profile));
      if (member) review.members.push(member);
    } catch {
      review.unavailable.push({ profileId: profile.id, name: profile.name });
    }
  }
  return review;
}

/**
 * Acknowledges one (zone, group) of the latched warnings of a given crew member, as the acting CMO or flight
 * surgeon. The acknowledgement lands in that member's records, not in the actor's. Idempotent by (zone, group).
 * Returns the member re-evaluated, or null when the profile does not exist (or is deleted).
 */
export async function acknowledgeForMember(
  deps: Deps,
  source: CrewSource,
  profileId: string,
  target: { zoneId: ZoneId; groupId: string },
): Promise<CrewMember | null> {
  assertCan(deps.actor.role, 'acknowledgeAlert');
  const profile = await source.profiles.get(profileId);
  if (!profile || profile.deleted) return null;
  const data = await source.open(profile);
  const { acks } = await data.store.load();
  if (!acks.some((a) => a.zoneId === target.zoneId && a.groupId === target.groupId)) {
    await data.store.addAck({
      id: deps.newId(),
      zoneId: target.zoneId,
      groupId: target.groupId,
      by: { profileId: deps.actor.profileId, role: deps.actor.role },
      t: deps.clock.now(),
      updatedAt: deps.nowIso(),
    });
  }
  return buildMember(deps, profile, data);
}
