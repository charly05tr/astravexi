import type { CrewCooccurrence } from './crew-cooccurrence';
import type { EnvironmentLink } from './environment-link';
import type { Verdict, VerdictReason } from './model';
import type { PersonalDeviation } from './personal-deviation';

export interface VerdictResult {
  verdict: Verdict;
  reason: VerdictReason;
}

/**
 * Crosses the three signals. Positive evidence counts on its own (one signal gives "possibly external"); "likely
 * internal" needs BOTH negatives to be known, so a missing crew comparison or missing cabin data never becomes a
 * confident answer.
 */
export function decideVerdict(personal: PersonalDeviation, crew: CrewCooccurrence, env: EnvironmentLink): VerdictResult {
  if (personal.status === 'insufficient-baseline') return { verdict: 'insufficient-data', reason: 'insufficient-baseline' };
  const wide = crew.status === 'crew-wide';
  const crewUnknown = crew.status === 'insufficient-crew-data';
  const linked = env.status === 'linked-excursion';
  const envUnknown = env.status === 'no-data';

  if (wide && linked) return { verdict: 'likely-external', reason: 'crew-wide-and-linked-excursion' };
  if (wide) {
    return { verdict: 'possibly-external', reason: envUnknown ? 'crew-wide-environment-unknown' : 'crew-wide-no-monitored-excursion' };
  }
  if (linked) {
    return { verdict: 'possibly-external', reason: crewUnknown ? 'linked-excursion-crew-unknown' : 'linked-excursion-individual-susceptibility' };
  }
  if (crewUnknown) return { verdict: 'insufficient-data', reason: 'insufficient-crew-data' };
  if (envUnknown) return { verdict: 'insufficient-data', reason: 'no-environment-data' };
  return { verdict: 'likely-internal', reason: 'no-external-signal' };
}
