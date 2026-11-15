import type { AttributionConfig } from './model';
import type { PersonalDeviation } from './personal-deviation';

/** What one crewmate's own history says about their reading in the same time window. Null: no reading there. */
export interface PeerSignal {
  profileId: string;
  name: string;
  deviation: PersonalDeviation | null;
}

export interface PeerEvidence {
  profileId: string;
  name: string;
  /** False when the crewmate had no reading in the window or too little history. */
  hasData: boolean;
  z: number | null;
  /** Deviates in the same direction as the subject with |z| at or above the crew threshold. */
  deviates: boolean;
}

export type CrewCooccurrence =
  | { status: 'insufficient-crew-data'; othersWithData: number; required: number; peers: readonly PeerEvidence[] }
  | { status: 'crew-wide' | 'individual'; othersWithData: number; deviating: number; needed: number; peers: readonly PeerEvidence[] };

/**
 * All crew share the same cabin air, so when enough of the others move the same way on the same indicator in the
 * same window, the cause is probably shared. "Enough" is at least `crewFraction` of the crewmates with data and
 * never fewer than `crewMinOthers`. With fewer crewmates with data than that, there is no call.
 */
export function assessCrewCooccurrence(
  subjectZ: number,
  peers: readonly PeerSignal[],
  config: Pick<AttributionConfig, 'crewZ' | 'crewMinOthers' | 'crewFraction'>,
): CrewCooccurrence {
  const evidence: PeerEvidence[] = peers.map((p) => {
    const d = p.deviation;
    if (!d || d.status === 'insufficient-baseline') return { profileId: p.profileId, name: p.name, hasData: false, z: null, deviates: false };
    const sameSign = d.z !== 0 && Math.sign(d.z) === Math.sign(subjectZ);
    return { profileId: p.profileId, name: p.name, hasData: true, z: d.z, deviates: sameSign && Math.abs(d.z) >= config.crewZ };
  });
  const withData = evidence.filter((e) => e.hasData).length;
  if (withData < config.crewMinOthers) {
    return { status: 'insufficient-crew-data', othersWithData: withData, required: config.crewMinOthers, peers: evidence };
  }
  const deviating = evidence.filter((e) => e.deviates).length;
  const needed = Math.max(config.crewMinOthers, Math.ceil(config.crewFraction * withData));
  return { status: deviating >= needed ? 'crew-wide' : 'individual', othersWithData: withData, deviating, needed, peers: evidence };
}
