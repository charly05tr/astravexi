import type { StoreSnapshot } from '../../core/ports';
import type { RecordStore } from '../../core/ports';
import type { MissionMinute, OutboxMessage } from '../../core/health/model';

/** An outbox message as it was at `now`: a message that is only sent later is still queued; a reply that is not yet possible is not. */
function outboxAt(m: OutboxMessage, now: MissionMinute): OutboxMessage {
  if (m.state === 'replyPossible' && (m.replyPossibleAt ?? 0) > now) return { ...m, state: 'sent', replyPossibleAt: m.replyPossibleAt };
  if ((m.state === 'sent' || m.state === 'replyPossible') && (m.sentAt ?? 0) > now) {
    const queued: OutboxMessage = { ...m, state: 'queued' };
    delete queued.sentAt;
    delete queued.replyPossibleAt;
    delete queued.oneWayDelayMin;
    return queued;
  }
  return m;
}

/**
 * A record store that only shows what already exists at mission minute `now()`: manual readings, decisions,
 * acknowledgements and outbox messages stamped later are hidden (they come back when the clock reaches them).
 * Writes go to the inner store untouched. Used for scenario playback, so seeking backwards hides the future.
 */
export function createVisibleRecordStore(inner: RecordStore, now: () => MissionMinute): RecordStore {
  return {
    name: inner.name,
    persistent: inner.persistent,
    async load(): Promise<StoreSnapshot> {
      const s = await inner.load();
      const t = now();
      return {
        manualReadings: s.manualReadings.filter((r) => r.t <= t),
        decisions: s.decisions.filter((d) => d.t <= t),
        acks: s.acks.filter((a) => a.t <= t),
        outbox: s.outbox.filter((m) => m.createdAt <= t).map((m) => outboxAt(m, t)),
      };
    },
    addReadings: (r) => inner.addReadings(r),
    addDecision: (d) => inner.addDecision(d),
    addAck: (a) => inner.addAck(a),
    putOutboxIfAbsent: (m) => inner.putOutboxIfAbsent(m),
    updateOutbox: (m) => inner.updateOutbox(m),
    getMeta: (k) => inner.getMeta(k),
    setMeta: (k, v) => inner.setMeta(k, v),
    changedSince: (s) => inner.changedSince(s),
    applyRemote: (c) => inner.applyRemote(c),
    loadHabits: () => inner.loadHabits(),
    putHabitIfAbsent: (h) => inner.putHabitIfAbsent(h),
    updateHabit: (h) => inner.updateHabit(h),
    deleteHabit: (id) => inner.deleteHabit(id),
    putCompletion: (c) => inner.putCompletion(c),
    removeCompletion: (h, d) => inner.removeCompletion(h, d),
    putBadgeIfAbsent: (b) => inner.putBadgeIfAbsent(b),
    clearAll: () => inner.clearAll(),
  };
}
