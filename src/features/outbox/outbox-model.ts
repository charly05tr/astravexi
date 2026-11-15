import { replyEstimate } from '../../core/escalation/link';
import type { LinkState } from '../../core/escalation/link';
import type { OutboxMessage, ZoneId } from '../../core/health/model';
import type { ZoneSymptomReport } from '../body-map/symptom-model';
import type { EnvironmentConfig } from '../environment/environment-model';
import { formatMissionTime } from '../shared/format';
import type { TriageAnswer } from '../triage/triage-model';
import { evaluateGuidedTriage } from '../triage/triage-model';
import {
  buildDtnContextEnvelope,
  buildGroundValidationPacket,
  computeDtnBandwidthMetrics,
} from './packet-bundle';
import type { GroundValidationPacket } from './packet-bundle';

export interface OutboxDtnContextInput {
  readonly environment: EnvironmentConfig;
  readonly symptomReports: Readonly<Record<ZoneId, ZoneSymptomReport>>;
  readonly triageAnswers: Readonly<Record<string, TriageAnswer>>;
  readonly hmsUsedCounts: Readonly<Record<string, number>>;
  readonly allergyCount: number;
}

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
  /** Compact DTN Store-and-Forward bandwidth savings label. */
  dtnBandwidthLabel: string;
  /** Short context tags bundled into the store-and-forward packet. */
  dtnContextTags: readonly string[];
  /** Deferred MCC-H validation packet available once state reaches replyPossible (2 × delay). */
  groundValidation: GroundValidationPacket | null;
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
  dtnInput?: OutboxDtnContextInput,
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

    const symptomReport = dtnInput?.symptomReports[m.zoneId];
    const triagePlan =
      dtnInput && symptomReport
        ? evaluateGuidedTriage({
            zoneId: m.zoneId,
            zoneStatus: m.payload.zoneTiers[m.zoneId] ?? 'warning',
            symptomReport,
            envAssessment: null,
            answers: dtnInput.triageAnswers,
          })
        : null;
    const totalLoggedSupplies = dtnInput
      ? Object.values(dtnInput.hmsUsedCounts).reduce((acc, n) => acc + n, 0)
      : 0;

    const dtnContext = buildDtnContextEnvelope({
      zoneId: m.zoneId,
      environment: dtnInput?.environment,
      symptomReport,
      triageLevel: triagePlan?.level ?? 'stabilize',
      loggedSuppliesCount: totalLoggedSupplies,
      allergyConflictsCount: dtnInput?.allergyCount ?? 0,
    });

    const enrichedPayload = {
      ...m.payload,
      dtnContext,
    };
    const payloadJson = JSON.stringify(enrichedPayload, null, 2);
    const bandwidth = computeDtnBandwidthMetrics(payloadJson);

    const dtnContextTags: string[] = [
      `Env: ${dtnContext.habitatContext.habitat} (CO2 ${dtnContext.habitatContext.ppCo2MmHg.toFixed(1)} mmHg)`,
      `Triage: ${dtnContext.localTriageLevel}`,
    ];
    if (dtnContext.localizedSymptoms.active) {
      dtnContextTags.push(`Symptoms: ${dtnContext.localizedSymptoms.discomfort}/10`);
    }
    if (totalLoggedSupplies > 0) {
      dtnContextTags.push(`HMS used: ${totalLoggedSupplies}`);
    }

    return {
      id: m.id,
      zoneLabel: zoneLabels.get(m.zoneId) ?? m.zoneId,
      state: m.state,
      stateLabel: STATE_LABEL[m.state],
      createdText: `Created ${formatMissionTime(m.createdAt)}`,
      replyText,
      canSend: m.state === 'queued' && !link.blackout,
      payloadJson,
      dtnBandwidthLabel: bandwidth.compactLabel,
      dtnContextTags,
      groundValidation: buildGroundValidationPacket(m),
    };
  });
}
