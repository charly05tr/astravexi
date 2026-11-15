import type { OutboxMessage, ZoneId } from '../../core/health/model';
import { ZONE_SYMPTOMS, hasZoneSymptoms } from '../body-map/symptom-model';
import type { ZoneSymptomReport } from '../body-map/symptom-model';
import { HABITAT_PRESETS } from '../environment/environment-model';
import type { EnvironmentConfig } from '../environment/environment-model';
import { formatMissionTime } from '../shared/format';
import type { TriageProtocolLevel } from '../triage/triage-model';

export interface DtnContextEnvelope {
  readonly protocol: 'DTN-Bundle-v1';
  readonly habitatContext: {
    readonly habitat: string;
    readonly ppCo2MmHg: number;
    readonly noiseDba: number;
    readonly radiationMsvDay: number;
    readonly speActive: boolean;
  };
  readonly localizedSymptoms: {
    readonly active: boolean;
    readonly discomfort: number;
    readonly symptomLabels: readonly string[];
  };
  readonly localTriageLevel: TriageProtocolLevel;
  readonly hmsSummary: {
    readonly loggedSuppliesCount: number;
    readonly allergyConflictsCount: number;
  };
}

export interface DtnBandwidthMetrics {
  readonly packetBytes: number;
  readonly continuousStreamBytesPerDay: number;
  readonly savingsPercent: number;
  readonly compactLabel: string;
}

export interface GroundValidationPacket {
  readonly authority: string;
  readonly validatedAtText: string;
  readonly concurrenceLabel: string;
  readonly calibrationSummary: string;
  readonly localCalibrationNote: string;
}

/**Continuous 24h multi-channel waveform & vitals stream baseline (~1.44 MB/day per monitored subsystem). */
const CONTINUOUS_RAW_BYTES_PER_DAY = 1_440_000;

const ZONE_CALIBRATION_SUMMARY: Record<ZoneId, string> = {
  heart:
    'MCC-H concurs with local cardiac hold and seated rest re-measurement protocol. Onboard BP and HR escalation thresholds validated.',
  brain:
    'MCC-H concurs with circadian sleep anchor and habitat CO2 check. Local cognitive/sleep baseline window confirmed.',
  eyes:
    'MCC-H concurs with SANS visual acuity log and preservative-free ocular lubrication. Continue scheduled Amsler checks.',
  metabolism:
    'MCC-H concurs with hydration and complex-carbohydrate stabilization. Consumable strip conservation interval approved.',
  immune:
    'MCC-H concurs with in-flight thermal shift interpretation and rest protocol. Shielding and temperature baseline calibrated.',
  bone:
    'MCC-H concurs with ARED resistive load reduction and lumbar stabilization. Musculoskeletal recovery window confirmed.',
};

/**
 * Builds the privacy-preserving DTN Store-and-Forward context envelope attached to an OutboxMessage.
 * Strictly excludes any raw psychological/PHQ scores; zoneTiers carry tier-only status.
 */
export function buildDtnContextEnvelope(params: {
  zoneId: ZoneId;
  environment?: EnvironmentConfig;
  symptomReport?: ZoneSymptomReport;
  triageLevel?: TriageProtocolLevel;
  loggedSuppliesCount?: number;
  allergyConflictsCount?: number;
}): DtnContextEnvelope {
  const {
    zoneId,
    environment,
    symptomReport,
    triageLevel = 'stabilize',
    loggedSuppliesCount = 0,
    allergyConflictsCount = 0,
  } = params;

  const presetLabel = environment ? HABITAT_PRESETS[environment.habitat].shortLabel : 'Transit';
  const catalog = ZONE_SYMPTOMS[zoneId] ?? [];
  const symptomLabels = symptomReport
    ? symptomReport.tags
        .map((id) => catalog.find((o) => o.id === id)?.label)
        .filter((v): v is string => Boolean(v))
    : [];

  return {
    protocol: 'DTN-Bundle-v1',
    habitatContext: {
      habitat: presetLabel,
      ppCo2MmHg: environment ? environment.ppCo2MmHg : 3.2,
      noiseDba: environment ? environment.noiseDba : 58,
      radiationMsvDay: environment ? environment.radiationMsvDay : 0.55,
      speActive: environment ? environment.speActive : false,
    },
    localizedSymptoms: {
      active: symptomReport ? hasZoneSymptoms(symptomReport) : false,
      discomfort: symptomReport ? symptomReport.discomfort : 0,
      symptomLabels,
    },
    localTriageLevel: triageLevel,
    hmsSummary: {
      loggedSuppliesCount,
      allergyConflictsCount,
    },
  };
}

/**
 * Computes packet size in bytes and bandwidth savings compared to continuous raw telemetry streaming.
 */
export function computeDtnBandwidthMetrics(payloadJson: string): DtnBandwidthMetrics {
  const packetBytes = new TextEncoder().encode(payloadJson).length;
  const ratio = Math.max(0, 1 - packetBytes / CONTINUOUS_RAW_BYTES_PER_DAY);
  const savingsPercent = Number((ratio * 100).toFixed(2));
  const kb = (packetBytes / 1024).toFixed(1);

  return {
    packetBytes,
    continuousStreamBytesPerDay: CONTINUOUS_RAW_BYTES_PER_DAY,
    savingsPercent,
    compactLabel: `DTN bundle ${kb} KB · ${savingsPercent}% less than continuous stream`,
  };
}

/**
 * Generates the deferred Earth validation packet once two-way light time (2 × delay) has elapsed
 * (`state === 'replyPossible'`). Supports local calibration without blocking crew autonomy.
 */
export function buildGroundValidationPacket(message: OutboxMessage): GroundValidationPacket | null {
  if (message.state !== 'replyPossible') return null;
  const validatedMinute = message.replyPossibleAt ?? message.sentAt ?? message.createdAt;

  return {
    authority: 'MCC-H Flight Surgeon Desk',
    validatedAtText: formatMissionTime(validatedMinute),
    concurrenceLabel: 'Protocol concurred & thresholds calibrated',
    calibrationSummary: ZONE_CALIBRATION_SUMMARY[message.zoneId],
    localCalibrationNote:
      'Asynchronous Earth review complete. Local decision autonomy remains primary during link latency.',
  };
}
