import { advance, sendNow as sendNowTransition } from '../escalation/link';
import type { LinkState } from '../escalation/link';
import type { OutboxMessage, RecommendationDecision, ZoneId } from '../health/model';
import { type Deps, type Session, evaluateSession } from './session';

/**
 * CMO acknowledgement of one (zone, group): releases the latched red flags of that group with one
 * click. It writes the acknowledgement and re-evaluates; it never touches thresholds or the outbox.
 */
export async function acknowledge(
  deps: Deps,
  session: Session,
  target: { zoneId: ZoneId; groupId: string },
): Promise<Session> {
  const id = `ack:${target.zoneId}:${target.groupId}`;
  if (session.acks.some((a) => a.id === id)) return session;
  const ack = { id, zoneId: target.zoneId, groupId: target.groupId, by: 'cmo' as const, t: deps.clock.now() };
  await deps.store.addAck(ack);
  const acks = [...session.acks, ack];
  return { ...session, acks, evaluation: evaluateSession(deps, { ...session, acks }) };
}

/** Accept or dismiss a recommendation. Log only: it never changes a tier or an engine input. */
export async function decideRecommendation(
  deps: Deps,
  session: Session,
  input: { recommendationId: string; findingKey: string; decision: RecommendationDecision['decision'] },
): Promise<Session> {
  const t = deps.clock.now();
  const decision: RecommendationDecision = {
    id: `dec:${t}:${session.decisions.length + 1}`,
    recommendationId: input.recommendationId,
    findingKey: input.findingKey,
    decision: input.decision,
    t,
  };
  await deps.store.addDecision(decision);
  return { ...session, decisions: [...session.decisions, decision] };
}

/** Persist only the messages whose object changed, then return the session with the new outbox. */
async function commitOutbox(deps: Deps, session: Session, next: readonly OutboxMessage[]): Promise<Session> {
  if (next === session.outbox) return session;
  const before = new Map(session.outbox.map((m) => [m.id, m]));
  const changed = next.filter((m) => before.get(m.id) !== m);
  await deps.store.updateOutbox(changed);
  return { ...session, outbox: next };
}

/** Explicit "Send now" for one queued message. The delay is read from the link at this moment. */
export async function sendNow(deps: Deps, session: Session, id: string, link: LinkState): Promise<Session> {
  return commitOutbox(deps, session, sendNowTransition(session.outbox, id, link, deps.clock.now()));
}

/**
 * One link tick: held -> sent when the blackout ends, queued -> held on a blackout, sent -> replyPossible
 * when the time comes. Returns the same session when nothing changed, and writes only changed messages.
 */
export async function advanceLink(deps: Deps, session: Session, link: LinkState): Promise<Session> {
  return commitOutbox(deps, session, advance(session.outbox, link, deps.clock.now()));
}
