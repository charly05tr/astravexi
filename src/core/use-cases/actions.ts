import { advance, sendNow as sendNowTransition } from '../escalation/link';
import type { LinkState } from '../escalation/link';
import type { Acknowledgement, OutboxMessage, RecommendationDecision, ZoneId } from '../health/model';
import { assertCan } from '../profiles/policy';
import { type Deps, type Session, evaluateSession } from './session';

/**
 * Acknowledgement of one (zone, group) by a CMO or flight surgeon: releases the latched red flags of that
 * group with one click. It writes the acknowledgement (by the actor's profile id and role) and
 * re-evaluates; it never touches thresholds or the outbox. Any other role is rejected here, not only in the UI.
 * Idempotent by (zone, group): a second acknowledgement of the same pair stores nothing.
 */
export async function acknowledge(
  deps: Deps,
  session: Session,
  target: { zoneId: ZoneId; groupId: string },
): Promise<Session> {
  assertCan(deps.actor.role, 'acknowledgeAlert');
  if (session.acks.some((a) => a.zoneId === target.zoneId && a.groupId === target.groupId)) return session;
  const ack: Acknowledgement = {
    id: deps.newId(),
    zoneId: target.zoneId,
    groupId: target.groupId,
    by: { profileId: deps.actor.profileId, role: deps.actor.role },
    t: deps.clock.now(),
    updatedAt: deps.nowIso(),
  };
  await deps.store.addAck(ack);
  const acks = [...session.acks, ack];
  return { ...session, acks, evaluation: evaluateSession(deps, { ...session, acks }) };
}

/** Accept or dismiss a recommendation (astronaut only). Log only: it never changes a tier or an engine input. */
export async function decideRecommendation(
  deps: Deps,
  session: Session,
  input: { recommendationId: string; findingKey: string; decision: RecommendationDecision['decision'] },
): Promise<Session> {
  assertCan(deps.actor.role, 'decideRecommendation');
  const t = deps.clock.now();
  const decision: RecommendationDecision = {
    id: deps.newId(),
    recommendationId: input.recommendationId,
    findingKey: input.findingKey,
    decision: input.decision,
    t,
    updatedAt: deps.nowIso(),
  };
  await deps.store.addDecision(decision);
  return { ...session, decisions: [...session.decisions, decision] };
}

/** Persist only the messages whose object changed, then return the session with the new outbox. */
async function commitOutbox(deps: Deps, session: Session, next: readonly OutboxMessage[]): Promise<Session> {
  if (next === session.outbox) return session;
  const before = new Map(session.outbox.map((m) => [m.id, m]));
  const updatedAt = deps.nowIso();
  const stamped = next.map((m) => (before.get(m.id) === m ? m : { ...m, updatedAt }));
  await deps.store.updateOutbox(stamped.filter((m, i) => m !== next[i]));
  return { ...session, outbox: stamped };
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
