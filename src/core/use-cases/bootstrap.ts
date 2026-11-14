import type { LinkState } from '../escalation/link';
import type { Session } from './session';
import { type Deps, refresh } from './session';

/**
 * Hydrate: load the store, regenerate synthetic history (DEMO), evaluate, then emit Warnings.
 * Emission is a no-op for dedupe keys that already exist, so reloading never duplicates a message.
 */
export async function bootstrap(deps: Deps, link: LinkState): Promise<Session> {
  const snapshot = await deps.store.load();
  return refresh(
    deps,
    {
      synthetic: deps.history.generate(deps.seed, deps.clock.today()),
      manual: snapshot.manualReadings,
      acks: snapshot.acks,
      decisions: snapshot.decisions,
      outbox: snapshot.outbox,
    },
    link,
  );
}

/** Re-evaluate against the clock (LIVE day rollover, DEMO advance) and regenerate the synthetic history. */
export async function reevaluate(deps: Deps, session: Session, link: LinkState): Promise<Session> {
  return refresh(
    deps,
    { ...session, synthetic: deps.history.generate(deps.seed, deps.clock.today()) },
    link,
  );
}
