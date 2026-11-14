import { replyEstimate } from '../../core/escalation/link';
import type { LinkState } from '../../core/escalation/link';
import type { OutboxMessage, ZoneId } from '../../core/health/model';
import { formatMissionTime } from '../shared/format';

export interface OutboxCardView {
  id: string;
  zoneLabel: string;
  state: OutboxMessage['state'];
  stateLabel: string;
  createdText: string;
  /** "Earliest reply T+24 min after sending" while queued; a fixed time once sent; nothing while held. */
  replyText: string;
  canSend: boolean;
  /** The exact payload that leaves the device. Tier-only indicators never carry a value. */
  payloadJson: string;
}

const STATE_LABEL: Record<OutboxMessage['state'], string> = {
  queued: 'Queued',
  held: 'Held',
  sent: 'Sent',
  replyPossible: 'Reply possible',
};

export function buildOutboxView(
  messages: readonly OutboxMessage[],
  link: LinkState,
  zoneLabels: ReadonlyMap<ZoneId, string>,
): OutboxCardView[] {
  return messages.map((m) => {
    const estimate = replyEstimate(m, link);
    let replyText: string;
    if (m.state === 'held') {
      replyText = 'Link blackout. No reply time until the link returns.';
    } else if (m.state === 'queued' && estimate.kind === 'estimate') {
      replyText = `Earliest reply T+${estimate.offsetMin} min after sending`;
    } else if (m.state === 'sent' && estimate.kind === 'fixed') {
      replyText = `Sent ${formatMissionTime(estimate.sentAt)}, ${m.oneWayDelayMin ?? 0} min one way. Earliest reply T+${(m.oneWayDelayMin ?? 0) * 2} min, ${formatMissionTime(estimate.replyPossibleAt)}.`;
    } else if (estimate.kind === 'fixed') {
      replyText = `Reply possible since ${formatMissionTime(estimate.replyPossibleAt)}.`;
    } else {
      replyText = '';
    }
    return {
      id: m.id,
      zoneLabel: zoneLabels.get(m.zoneId) ?? m.zoneId,
      state: m.state,
      stateLabel: STATE_LABEL[m.state],
      createdText: `Created ${formatMissionTime(m.createdAt)}`,
      replyText,
      canSend: m.state === 'queued' && !link.blackout,
      payloadJson: JSON.stringify(m.payload, null, 2),
    };
  });
}
