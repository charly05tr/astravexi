import type { ZoneId, ZoneStatus } from '../../core/health/model';
import { nasaDatasets } from '../../knowledge';
import type { NasaDatasetRef } from '../../knowledge';

export type HabitatPresetId = 'transit' | 'station' | 'rover' | 'base';

export interface HabitatPreset {
  readonly id: HabitatPresetId;
  readonly label: string;
  readonly shortLabel: string;
  readonly summary: string;
  readonly ppCo2MmHg: number;
  readonly noiseDba: number;
  readonly radiationMsvDay: number;
  readonly humidityPct: number;
  readonly temperatureC: number;
}

export interface EnvironmentConfig {
  readonly habitat: HabitatPresetId;
  readonly ppCo2MmHg: number;
  readonly noiseDba: number;
  readonly radiationMsvDay: number;
  readonly speActive: boolean;
  readonly humidityPct: number;
  readonly temperatureC: number;
}

export type AttributionKind = 'environmental' | 'mixed' | 'intrinsic' | 'nominal';

export interface EnvironmentZoneAssessment {
  readonly zoneId: ZoneId;
  readonly attribution: AttributionKind;
  readonly badgeLabel: string;
  readonly drivers: readonly string[];
  readonly summary: string;
  readonly accumulatedMsv: number;
  readonly benchmark: {
    readonly code: string;
    readonly title: string;
    readonly note: string;
    readonly url: string;
  } | null;
}

export const CO2_ATTENTION_MMHG = 3.0;
export const CO2_HIGH_MMHG = 4.0;
export const NOISE_ATTENTION_DBA = 65;
export const NOISE_HIGH_DBA = 72;
export const RADIATION_ELEVATED_MSV_DAY = 1.5;

export const HABITAT_PRESETS: Readonly<Record<HabitatPresetId, HabitatPreset>> = {
  transit: {
    id: 'transit',
    label: 'Deep-space transit',
    shortLabel: 'Transit',
    summary: 'Artemis/Mars transit stack with elevated galactic cosmic ray flux.',
    ppCo2MmHg: 2.3,
    noiseDba: 61,
    radiationMsvDay: 1.84,
    humidityPct: 39,
    temperatureC: 22.8,
  },
  station: {
    id: 'station',
    label: 'Orbital station',
    shortLabel: 'Station',
    summary: 'Low-Earth orbit lab inside geomagnetic shielding with continuous fans.',
    ppCo2MmHg: 2.8,
    noiseDba: 64,
    radiationMsvDay: 0.52,
    humidityPct: 40,
    temperatureC: 22.5,
  },
  rover: {
    id: 'rover',
    label: 'Pressurized rover',
    shortLabel: 'Rover',
    summary: 'Small sealed cabin volume where CO2 pockets build quickly under load.',
    ppCo2MmHg: 3.4,
    noiseDba: 67,
    radiationMsvDay: 0.72,
    humidityPct: 44,
    temperatureC: 23.6,
  },
  base: {
    id: 'base',
    label: 'Planetary base',
    shortLabel: 'Base',
    summary: 'Regolith-shielded surface habitat with quieter acoustic sleeping bays.',
    ppCo2MmHg: 1.9,
    noiseDba: 56,
    radiationMsvDay: 0.34,
    humidityPct: 41,
    temperatureC: 21.8,
  },
};

export const HABITAT_ORDER: readonly HabitatPresetId[] = ['transit', 'station', 'rover', 'base'];

export function createDefaultEnvironmentConfig(presetId: HabitatPresetId = 'transit'): EnvironmentConfig {
  const preset = HABITAT_PRESETS[presetId];
  return {
    habitat: preset.id,
    ppCo2MmHg: preset.ppCo2MmHg,
    noiseDba: preset.noiseDba,
    radiationMsvDay: preset.radiationMsvDay,
    speActive: false,
    humidityPct: preset.humidityPct,
    temperatureC: preset.temperatureC,
  };
}

/** Converts cabin CO2 partial pressure (mmHg, 1 atm reference) to ppm for display consistency. */
export function co2PpmFromMmHg(ppCo2MmHg: number): number {
  return Math.round(ppCo2MmHg * 1316);
}

/** Estimates cumulative mission exposure in mSv, adding a +18 mSv storm transient during active SPE. */
export function computeAccumulatedMsv(missionDay: number, radiationMsvDay: number, speActive: boolean): number {
  const baseline = Math.max(1, missionDay) * radiationMsvDay;
  const speDelta = speActive ? 18 : 0;
  return Number((baseline + speDelta).toFixed(1));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function sanitizeEnvironmentConfig(config: EnvironmentConfig): EnvironmentConfig {
  return {
    ...config,
    ppCo2MmHg: Number(clamp(config.ppCo2MmHg, 0.5, 6.0).toFixed(1)),
    noiseDba: Math.round(clamp(config.noiseDba, 45, 85)),
    radiationMsvDay: Number(clamp(config.radiationMsvDay, 0.2, 5.0).toFixed(2)),
    humidityPct: Math.round(clamp(config.humidityPct, 25, 75)),
    temperatureC: Number(clamp(config.temperatureC, 18, 29).toFixed(1)),
  };
}

function activeDriversForZone(zoneId: ZoneId, config: EnvironmentConfig): string[] {
  const drivers: string[] = [];
  const co2High = config.ppCo2MmHg >= CO2_ATTENTION_MMHG;
  const co2Critical = config.ppCo2MmHg >= CO2_HIGH_MMHG;
  const noiseHigh = config.noiseDba >= NOISE_ATTENTION_DBA;
  const radHigh = config.speActive || config.radiationMsvDay >= RADIATION_ELEVATED_MSV_DAY;

  if (zoneId === 'brain') {
    if (co2High) drivers.push(`ppCO2 ${config.ppCo2MmHg.toFixed(1)} mmHg (>= ${CO2_ATTENTION_MMHG.toFixed(1)} mmHg)`);
    if (noiseHigh) drivers.push(`Acoustic load ${config.noiseDba} dBA (>= ${NOISE_ATTENTION_DBA} dBA)`);
    if (config.speActive) drivers.push('Active Solar Particle Event (SPE)');
  } else if (zoneId === 'eyes') {
    if (co2High) drivers.push(`ppCO2 ${config.ppCo2MmHg.toFixed(1)} mmHg compounding SANS fluid pressure`);
    if (config.speActive) drivers.push('Active SPE radiation excursion');
  } else if (zoneId === 'heart') {
    if (co2Critical || config.ppCo2MmHg >= 3.5) {
      drivers.push(`ppCO2 ${config.ppCo2MmHg.toFixed(1)} mmHg cardiovascular demand`);
    }
    if (config.noiseDba >= NOISE_HIGH_DBA) drivers.push(`Noise load ${config.noiseDba} dBA sympathetic stress`);
    if (config.temperatureC >= 25.0) drivers.push(`Warm cabin ${config.temperatureC.toFixed(1)} C thermal load`);
  } else if (zoneId === 'immune') {
    if (config.speActive) {
      drivers.push('Active Solar Particle Event (SPE) transient dose');
    } else if (radHigh) {
      drivers.push(`GCR dose ${config.radiationMsvDay.toFixed(2)} mSv/day (above LEO ~0.52)`);
    }
  } else if (zoneId === 'metabolism' || zoneId === 'bone') {
    if (co2Critical) drivers.push(`ppCO2 ${config.ppCo2MmHg.toFixed(1)} mmHg respiratory-metabolic load`);
    if (config.speActive) drivers.push('SPE shelter confinement reducing mobility/loading');
  }
  return drivers;
}

function selectBenchmarkForZone(
  zoneId: ZoneId,
  config: EnvironmentConfig,
  datasets: readonly NasaDatasetRef[],
): EnvironmentZoneAssessment['benchmark'] {
  const candidates = datasets.filter((d) => d.zoneIds.includes(zoneId));
  if (candidates.length === 0) return null;

  let chosen = candidates[0]!;
  if ((zoneId === 'immune' || zoneId === 'brain') && (config.speActive || config.radiationMsvDay >= RADIATION_ELEVATED_MSV_DAY)) {
    chosen = candidates.find((d) => d.id === 'radlab-msl') ?? chosen;
  } else if ((zoneId === 'brain' || zoneId === 'eyes' || zoneId === 'heart') && config.ppCo2MmHg >= CO2_ATTENTION_MMHG) {
    chosen = candidates.find((d) => d.id === 'ochmo-tb-004') ?? chosen;
  }

  return {
    code: chosen.code,
    title: chosen.title,
    note: chosen.benchmarkNote,
    url: chosen.source.url,
  };
}

export interface EvaluateZoneEnvironmentInput {
  readonly zoneId: ZoneId;
  readonly zoneStatus: ZoneStatus;
  readonly findingsCount: number;
  readonly hasSymptoms: boolean;
  readonly missionDay: number;
  readonly config: EnvironmentConfig;
  readonly datasets?: readonly NasaDatasetRef[];
}

/**
 * Cross-references active cabin environment parameters and NASA reference bounds with zone findings
 * to separate likely environmental stress from intrinsic physiological change.
 */
export function evaluateZoneEnvironment(input: EvaluateZoneEnvironmentInput): EnvironmentZoneAssessment {
  const { zoneId, zoneStatus, findingsCount, hasSymptoms, missionDay, config, datasets = nasaDatasets } = input;
  const preset = HABITAT_PRESETS[config.habitat];
  const drivers = activeDriversForZone(zoneId, config);
  const hasIntrinsicSignal =
    findingsCount > 0 || (zoneStatus !== 'none' && zoneStatus !== 'noData' && zoneStatus !== 'unmonitored');
  const hasAnySignal = hasIntrinsicSignal || hasSymptoms;
  const accumulatedMsv = computeAccumulatedMsv(missionDay, config.radiationMsvDay, config.speActive);
  const benchmark = selectBenchmarkForZone(zoneId, config, datasets);

  if (drivers.length > 0 && hasIntrinsicSignal) {
    return {
      zoneId,
      attribution: 'mixed',
      badgeLabel: 'Env + intrinsic',
      drivers,
      summary: `${drivers.join(' and ')} may be amplifying physiological drift in ${preset.shortLabel}; mitigate habitat load and re-evaluate.`,
      accumulatedMsv,
      benchmark,
    };
  }

  if (drivers.length > 0) {
    return {
      zoneId,
      attribution: 'environmental',
      badgeLabel: 'Env factor',
      drivers,
      summary: hasSymptoms
        ? `Logged symptoms coincide with ${drivers.join(' and ')} in ${preset.shortLabel} rather than an isolated vitals breach.`
        : `${drivers.join(' and ')} exceed nominal habitability margins in ${preset.shortLabel}; monitor this zone closely.`,
      accumulatedMsv,
      benchmark,
    };
  }

  if (hasAnySignal) {
    return {
      zoneId,
      attribution: 'intrinsic',
      badgeLabel: 'Intrinsic signal',
      drivers: [],
      summary: `${preset.label} CO2 (${config.ppCo2MmHg.toFixed(1)} mmHg) and acoustics (${config.noiseDba} dBA) are nominal, pointing to an individual response.`,
      accumulatedMsv,
      benchmark,
    };
  }

  return {
    zoneId,
    attribution: 'nominal',
    badgeLabel: 'Habitat nominal',
    drivers: [],
    summary: `${preset.label} ambient parameters stay within nominal NASA-STD-3001 / OCHMO-TB-004 limits for this zone.`,
    accumulatedMsv,
    benchmark,
  };
}
