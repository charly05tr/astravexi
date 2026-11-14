import type { MissionMinute, OutboxMessage } from '../health/model';

/** The link as read at one instant. The delay is the ONE-WAY delay in minutes (0-22). */
export interface LinkState {
  oneWayDelayMin: number;
  blackout: boolean;
}

export type ReplyEstimate =
  | { kind: 'estimate'; offsetMin: number }
  | { kind: 'fixed'; replyPossibleAt: MissionMinute; sentAt: MissionMinute }
  | { kind: 'none' };

/** Earliest reply = T + 2 x D, with D read from the link. */
export function earliestReplyOffsetMin(oneWayDelayMin: number): number {
  return 2 * oneWayDelayMin;
}

/** What a card shows: a live estimate while queued, nothing while held, a frozen time once sent. */
export function replyEstimate(msg: OutboxMessage, link: LinkState): ReplyEstimate {
  switch (msg.state) {
    case 'queued':
      return { kind: 'estimate', offsetMin: earliestReplyOffsetMin(link.oneWayDelayMin) };
    case 'held':
      return { kind: 'none' };
    case 'sent':
    case 'replyPossible':
      return { kind: 'fixed', replyPossibleAt: msg.replyPossibleAt ?? 0, sentAt: msg.sentAt ?? 0 };
  }
}

function toSent(msg: OutboxMessage, link: LinkState, now: MissionMinute): OutboxMessage {
  return {
    ...msg,
    state: 'sent',
    sentAt: now,
    oneWayDelayMin: link.oneWayDelayMin, // read at send, then frozen
    replyPossibleAt: now + earliestReplyOffsetMin(link.oneWayDelayMin),
  };
}

/** Initial state of a new Warning message: held during a blackout, queued otherwise. */
export function initialState(link: LinkState): 'queued' | 'held' {
  return link.blackout ? 'held' : 'queued';
}

/**
 * One tick of the state machine. Each message makes at most one transition per tick, so a message sent
 * at delay 0 becomes reply-possible on the NEXT tick.
 *  - queued + blackout        -> held
 *  - held + link up           -> sent (delay read now)
 *  - sent + now >= replyAt    -> replyPossible
 * A sent message is never recalled by a blackout. Returns the same array reference when nothing changed.
 */
export function advance(
  msgs: readonly OutboxMessage[],
  link: LinkState,
  now: MissionMinute,
): readonly OutboxMessage[] {
  let changed = false;
  const next = msgs.map((m) => {
    let out = m;
    if (m.state === 'queued' && link.blackout) out = { ...m, state: 'held' };
    else if (m.state === 'held' && !link.blackout) out = toSent(m, link, now);
    else if (m.state === 'sent' && m.replyPossibleAt !== undefined && now >= m.replyPossibleAt) {
      out = { ...m, state: 'replyPossible' };
    }
    if (out !== m) changed = true;
    return out;
  });
  return changed ? next : msgs;
}

/** Explicit "Send now". Only a queued message can be sent, and never during a blackout. */
export function sendNow(
  msgs: readonly OutboxMessage[],
  id: string,
  link: LinkState,
  now: MissionMinute,
): readonly OutboxMessage[] {
  if (link.blackout) return msgs;
  let changed = false;
  const next = msgs.map((m) => {
    if (m.id !== id || m.state !== 'queued') return m;
    changed = true;
    return toSent(m, link, now);
  });
  return changed ? next : msgs;
}
