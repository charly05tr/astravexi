import type { Evaluation, Indicator, ZoneId, ZoneStatus } from '../../core/health/model';
import { tierRank } from '../../core/health/tiers';
import { buildCmoView } from '../cmo/cmo-model';
import type { CmoZoneView } from '../cmo/cmo-model';
import {
  CO2_ATTENTION_MMHG,
  CO2_HIGH_MMHG,
  NOISE_ATTENTION_DBA,
  NOISE_HIGH_DBA,
} from '../environment/environment-model';
import type { EnvironmentConfig } from '../environment/environment-model';
import { hasZoneSymptoms } from '../body-map/symptom-model';
import type { ZoneSymptomReport } from '../body-map/symptom-model';
import { tierTheme } from '../../theme/tiers';

export type UserRoleView = 'integrated' | 'crew' | 'cmo';

export type ReadinessLevel = 'green' | 'yellow' | 'red';

export type MissionActivityId = 'eva' | 'robotics' | 'exercise' | 'maintenance';

export type ActivityClearance = 'go' | 'mitigate' | 'hold';

export interface ActivityTranslation {
  readonly id: MissionActivityId;
  readonly label: string;
  readonly clearance: ActivityClearance;
  readonly clearanceLabel: string;
  readonly statusEquivalent: ZoneStatus;
  readonly guidance: string;
}

export interface ReadinessAssessment {
  readonly level: ReadinessLevel;
  readonly label: string;
  readonly shortLabel: string;
  readonly summary: string;
  readonly statusEquivalent: ZoneStatus;
  readonly drivers: readonly string[];
  readonly activities: readonly ActivityTranslation[];
  readonly pendingWarnings: number;
  readonly cautionCount: number;
  readonly disclaimer: string;
}

export const READINESS_DISCLAIMER =
  'Decision support for local operational pacing only. Does not substitute official flight surgeon or Mission Control medical Go/No-Go authorization.';

export const ROLE_OPTIONS: ReadonlyArray<{ id: UserRoleView; label: string; hint: string }> = [
  { id: 'integrated', label: 'All', hint: 'Combined demonstration view' },
  { id: 'crew', label: 'Crew', hint: 'Personal prevention & self-report focus' },
  { id: 'cmo', label: 'CMO', hint: 'Medical officer & rescuer triage focus' },
];

function maxZoneRank(evaluation: Evaluation): number {
  let best = 0;
  for (const zone of Object.values(evaluation.zones)) {
    best = Math.max(best, tierRank(zone.status as never));
  }
  return best;
}

function zoneHasLatchedWarning(evaluation: Evaluation): boolean {
  return Object.values(evaluation.zones).some((z) => z.findings.some((f) => f.latched));
}

function collectDrivers(
  evaluation: Evaluation,
  environment: EnvironmentConfig,
  symptomReports: Readonly<Record<ZoneId, ZoneSymptomReport>>,
): {
  drivers: string[];
  hasRedPhysiology: boolean;
  hasYellowPhysiology: boolean;
  hasRedSymptom: boolean;
  hasAnySymptom: boolean;
  hasHighCo2: boolean;
  hasElevatedCo2: boolean;
  hasHighNoise: boolean;
  hasElevatedNoise: boolean;
  pendingWarnings: number;
  cautionCount: number;
} {
  const drivers: string[] = [];
  const zones = Object.values(evaluation.zones);
  const pendingWarnings = zones.filter((z) => z.status === 'warning' || z.findings.some((f) => f.latched)).length;
  const cautionCount = zones.filter((z) => z.status === 'caution').length;
  const noticeCount = zones.filter((z) => z.status === 'notice').length;

  const hasRedPhysiology = pendingWarnings > 0 || maxZoneRank(evaluation) >= tierRank('warning') || zoneHasLatchedWarning(evaluation);
  const hasYellowPhysiology = cautionCount > 0 || noticeCount > 0;

  if (pendingWarnings > 0) {
    drivers.push(`${pendingWarnings} zone${pendingWarnings > 1 ? 's' : ''} at Warning (CMO review required)`);
  } else if (cautionCount > 0) {
    drivers.push(`${cautionCount} zone${cautionCount > 1 ? 's' : ''} at Caution`);
  } else if (noticeCount > 0) {
    drivers.push(`${noticeCount} zone${noticeCount > 1 ? 's' : ''} at Notice`);
  }

  let hasRedSymptom = false;
  let hasAnySymptom = false;
  for (const report of Object.values(symptomReports)) {
    if (!hasZoneSymptoms(report)) continue;
    hasAnySymptom = true;
    if (report.discomfort >= 8 || report.tags.includes('chest-tightness')) {
      hasRedSymptom = true;
      drivers.push(`High-priority symptom logged in ${report.zoneId} (${report.discomfort}/10)`);
    } else if (report.discomfort >= 1 || report.tags.length > 0) {
      drivers.push(`Symptom reported in ${report.zoneId}`);
    }
  }

  const hasHighCo2 = environment.ppCo2MmHg >= CO2_HIGH_MMHG;
  const hasElevatedCo2 = environment.ppCo2MmHg >= CO2_ATTENTION_MMHG;
  const hasHighNoise = environment.noiseDba >= NOISE_HIGH_DBA;
  const hasElevatedNoise = environment.noiseDba >= NOISE_ATTENTION_DBA;

  if (environment.speActive) drivers.push('Active Solar Particle Event (SPE) shielding priority');
  if (hasHighCo2) drivers.push(`High ppCO2 (${environment.ppCo2MmHg.toFixed(1)} mmHg)`);
  else if (hasElevatedCo2) drivers.push(`Elevated ppCO2 (${environment.ppCo2MmHg.toFixed(1)} mmHg)`);
  if (hasElevatedNoise) drivers.push(`Acoustic load (${environment.noiseDba} dBA)`);

  return {
    drivers,
    hasRedPhysiology,
    hasYellowPhysiology,
    hasRedSymptom,
    hasAnySymptom,
    hasHighCo2,
    hasElevatedCo2,
    hasHighNoise,
    hasElevatedNoise,
    pendingWarnings,
    cautionCount,
  };
}

function buildActivityTranslations(
  evaluation: Evaluation,
  environment: EnvironmentConfig,
  symptomReports: Readonly<Record<ZoneId, ZoneSymptomReport>>,
  level: ReadinessLevel,
): ActivityTranslation[] {
  const heartStatus = evaluation.zones.heart?.status ?? 'none';
  const brainStatus = evaluation.zones.brain?.status ?? 'none';
  const immuneStatus = evaluation.zones.immune?.status ?? 'none';
  const eyesSymptoms = symptomReports.eyes;
  const brainSymptoms = symptomReports.brain;
  const heartSymptoms = symptomReports.heart;
  const boneSymptoms = symptomReports.bone;

  const co2Elevated = environment.ppCo2MmHg >= CO2_ATTENTION_MMHG;
  const co2High = environment.ppCo2MmHg >= CO2_HIGH_MMHG;
  const spe = environment.speActive;

  // 1. EVA / Spacewalk
  let eva: ActivityTranslation;
  if (level === 'red' || spe || heartStatus === 'caution' || immuneStatus === 'caution') {
    eva = {
      id: 'eva',
      label: 'EVA / Spacewalk',
      clearance: 'hold',
      clearanceLabel: 'Stand down',
      statusEquivalent: 'warning',
      guidance: spe
        ? 'Defer extravehicular tasks while Solar Particle Event storm shielding is active.'
        : 'Hold non-essential EVA until active Caution/Warning signals clear and CMO verifies.',
    };
  } else if (brainStatus === 'caution' || co2Elevated || hasZoneSymptoms(eyesSymptoms) || hasZoneSymptoms(heartSymptoms)) {
    eva = {
      id: 'eva',
      label: 'EVA / Spacewalk',
      clearance: 'mitigate',
      clearanceLabel: 'Mitigate',
      statusEquivalent: 'caution',
      guidance: 'Mitigate cabin/sleep/ocular strain and repeat baseline checks prior to suit-up.',
    };
  } else {
    eva = {
      id: 'eva',
      label: 'EVA / Spacewalk',
      clearance: 'go',
      clearanceLabel: 'Nominal',
      statusEquivalent: 'none',
      guidance: 'No local cardiac, immune, or radiation flags limiting nominal EVA prep.',
    };
  }

  // 2. Robotics & Piloting
  let robotics: ActivityTranslation;
  if (level === 'red' || brainSymptoms.discomfort >= 7 || brainSymptoms.tags.includes('vestibular-vertigo')) {
    robotics = {
      id: 'robotics',
      label: 'Robotics & Piloting',
      clearance: 'hold',
      clearanceLabel: 'Stand down',
      statusEquivalent: 'warning',
      guidance: 'Hand over precision manipulator or approach control to a rested crewmate.',
    };
  } else if (
    brainStatus === 'caution' ||
    brainStatus === 'notice' ||
    co2Elevated ||
    environment.noiseDba >= NOISE_ATTENTION_DBA ||
    hasZoneSymptoms(brainSymptoms) ||
    hasZoneSymptoms(eyesSymptoms)
  ) {
    robotics = {
      id: 'robotics',
      label: 'Robotics & Piloting',
      clearance: 'mitigate',
      clearanceLabel: 'Mitigate',
      statusEquivalent: 'caution',
      guidance: 'Use buddy dual-check for precision tasks while sleep, blur, or CO2/noise strain is active.',
    };
  } else {
    robotics = {
      id: 'robotics',
      label: 'Robotics & Piloting',
      clearance: 'go',
      clearanceLabel: 'Nominal',
      statusEquivalent: 'none',
      guidance: 'Cognitive, visual, and cabin CO2 trends support precision console work.',
    };
  }

  // 3. Exercise (ARED / SPRINT)
  let exercise: ActivityTranslation;
  if (
    heartStatus === 'warning' ||
    immuneStatus === 'warning' ||
    heartSymptoms.tags.includes('chest-tightness') ||
    heartSymptoms.discomfort >= 6 ||
    boneSymptoms.discomfort >= 7
  ) {
    exercise = {
      id: 'exercise',
      label: 'Exercise (ARED / SPRINT)',
      clearance: 'hold',
      clearanceLabel: 'Stand down',
      statusEquivalent: 'warning',
      guidance: 'Pause heavy resistive/aerobic sessions pending resting vitals and CMO triage.',
    };
  } else if (
    heartStatus === 'caution' ||
    heartStatus === 'notice' ||
    co2High ||
    hasZoneSymptoms(boneSymptoms) ||
    hasZoneSymptoms(heartSymptoms)
  ) {
    exercise = {
      id: 'exercise',
      label: 'Exercise (ARED / SPRINT)',
      clearance: 'mitigate',
      clearanceLabel: 'Mitigate',
      statusEquivalent: 'caution',
      guidance: 'Reduce harness peak loads and hydrate steadily with lighter low-impact pacing.',
    };
  } else {
    exercise = {
      id: 'exercise',
      label: 'Exercise (ARED / SPRINT)',
      clearance: 'go',
      clearanceLabel: 'Nominal',
      statusEquivalent: 'none',
      guidance: 'Cleared for scheduled SPRINT / ARED countermeasure session with normal warm-up.',
    };
  }

  // 4. Cabin Maintenance & Routine Ops
  let maintenance: ActivityTranslation;
  if (spe) {
    maintenance = {
      id: 'maintenance',
      label: 'Cabin Maintenance',
      clearance: 'mitigate',
      clearanceLabel: 'Mitigate',
      statusEquivalent: 'caution',
      guidance: 'Limit non-essential module transfers; prioritize tasks inside shielded quarters.',
    };
  } else if (level === 'red') {
    maintenance = {
      id: 'maintenance',
      label: 'Cabin Maintenance',
      clearance: 'hold',
      clearanceLabel: 'Stand down',
      statusEquivalent: 'warning',
      guidance: 'Defer routine maintenance and shift crew focus to medical triage / vitals check.',
    };
  } else {
    maintenance = {
      id: 'maintenance',
      label: 'Cabin Maintenance',
      clearance: 'go',
      clearanceLabel: 'Nominal',
      statusEquivalent: 'none',
      guidance: 'Low-exertion housekeeping, ECLSS filter checks, and log tasks can proceed normally.',
    };
  }

  return [eva, robotics, exercise, maintenance];
}

/**
 * Evaluates overall 3-level Mission Readiness (Green / Yellow / Red) and operational task guidance
 * by combining physiological zone evaluations, localized symptoms, and cabin habitat conditions.
 */
export function evaluateMissionReadiness(input: {
  readonly evaluation: Evaluation;
  readonly environment: EnvironmentConfig;
  readonly symptomReports: Readonly<Record<ZoneId, ZoneSymptomReport>>;
}): ReadinessAssessment {
  const { evaluation, environment, symptomReports } = input;
  const info = collectDrivers(evaluation, environment, symptomReports);

  let level: ReadinessLevel = 'green';
  let label = 'Green · Routine & prevention';
  let shortLabel = 'Green';
  let statusEquivalent: ZoneStatus = 'none';
  let summary = 'All monitored physiology and habitat bounds support nominal daily mission operations.';

  if (info.hasRedPhysiology || info.hasRedSymptom || environment.speActive) {
    level = 'red';
    label = 'Red · Urgent attention';
    shortLabel = 'Red';
    statusEquivalent = 'warning';
    summary =
      'Urgent health or radiation storm condition active: prioritize safety stand-down, rest/shielding, and CMO escalation.';
  } else if (
    info.hasYellowPhysiology ||
    info.hasAnySymptom ||
    info.hasElevatedCo2 ||
    info.hasElevatedNoise
  ) {
    level = 'yellow';
    label = 'Yellow · Observation & mitigation';
    shortLabel = 'Yellow';
    statusEquivalent = 'caution';
    summary =
      'Active drift, symptoms, or habitat strain warrant pacing adjustments and mitigation before demanding tasks.';
  }

  const activities = buildActivityTranslations(evaluation, environment, symptomReports, level);

  return {
    level,
    label,
    shortLabel,
    summary,
    statusEquivalent,
    drivers: info.drivers,
    activities,
    pendingWarnings: info.pendingWarnings,
    cautionCount: info.cautionCount,
    disclaimer: READINESS_DISCLAIMER,
  };
}

export interface CmoOperationalBrief {
  readonly priorityZones: readonly CmoZoneView[];
  readonly pendingAckCount: number;
  readonly tierLabel: (tier: ZoneStatus) => string;
}

/** Reuses `buildCmoView` privacy projection (tier-only for mood) to power CMO triage counts on the dashboard. */
export function buildCmoOperationalBrief(
  evaluation: Evaluation,
  indicators: readonly Indicator[],
  zoneLabels: ReadonlyMap<ZoneId, string>,
): CmoOperationalBrief {
  const tierLabel = (t: ZoneStatus) => tierTheme(t).label;
  const priorityZones = buildCmoView(evaluation, indicators, zoneLabels, tierLabel);
  const pendingAckCount = priorityZones.reduce((acc, z) => acc + z.latched.length, 0);
  return { priorityZones, pendingAckCount, tierLabel };
}
