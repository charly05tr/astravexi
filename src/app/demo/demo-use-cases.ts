import type { LinkState } from '../../core/escalation/link';
import type { MissionClock } from '../../core/ports';
import { bootstrap, reevaluate } from '../../core/use-cases/bootstrap';
import type { Deps, Session } from '../../core/use-cases/session';

/** Persisted DEMO clock position lives under this meta key of the DEMO database. */
export const CLOCK_META_KEY = 'demoClock';

export interface DemoMissionClock extends MissionClock {
  advanceDay(): void;
  reset(): void;
  position(): { day: number; minute: number };
}

/** Deps for the demo-only use-cases. The type makes a LIVE clock impossible to pass. */
export type DemoDeps = Deps & { clock: DemoMissionClock };

export async function persistDemoClock(deps: DemoDeps): Promise<void> {
  await deps.store.setMeta(CLOCK_META_KEY, deps.clock.position());
}

/**
 * Move the demo day forward by one. History extends deterministically (earlier days are unchanged),
 * MANUAL entries stay, and Warning emission is idempotent.
 */
export async function advanceDemoDay(deps: DemoDeps, session: Session, link: LinkState): Promise<Session> {
  deps.clock.advanceDay();
  await persistDemoClock(deps);
  return reevaluate(deps, session, link);
}

/**
 * Wipe the DEMO database (readings, decisions, acknowledgements, outbox, meta), put the clock back to
 * day 150 08:00 and hydrate from the seed. It receives only DEMO deps, so LIVE data cannot be reached.
 */
export async function resetDemo(deps: DemoDeps, link: LinkState): Promise<Session> {
  await deps.store.clearAll();
  deps.clock.reset();
  await persistDemoClock(deps);
  return bootstrap(deps, link);
}
