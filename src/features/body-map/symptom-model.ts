import type { ZoneId } from '../../core/health/model';

export interface SymptomOption {
  id: string;
  label: string;
  hint: string;
}

export interface ZoneSymptomReport {
  zoneId: ZoneId;
  /** Localized discomfort from 0 (none) to 10 (severe). */
  discomfort: number;
  tags: readonly string[];
}

export const ZONE_SYMPTOMS: Readonly<Record<ZoneId, readonly SymptomOption[]>> = {
  brain: [
    { id: 'co2-headache', label: 'Headache / pressure', hint: 'Possible localized CO2 buildup or fluid shift' },
    { id: 'cognitive-fog', label: 'Mental fog / fatigue', hint: 'Sleep debt or circadian shift' },
    { id: 'vestibular-vertigo', label: 'Dizziness / motion unease', hint: 'Neurovestibular adaptation' },
  ],
  eyes: [
    { id: 'near-blur', label: 'Near-vision blur', hint: 'Microgravity fluid shift / SANS screen' },
    { id: 'retro-orbital', label: 'Behind-eye pressure', hint: 'Optic nerve sheath tension' },
    { id: 'dry-irritation', label: 'Dryness / irritation', hint: 'Low humidity or cabin particulates' },
  ],
  heart: [
    { id: 'palpitations', label: 'Racing heartbeat', hint: 'Elevated pulse at rest' },
    { id: 'orthostatic-lightheaded', label: 'Lightheaded', hint: 'Volume depletion or postural shift' },
    { id: 'chest-tightness', label: 'Chest tightness', hint: 'Priority cardiopulmonary red flag' },
  ],
  immune: [
    { id: 'chills-warmth', label: 'Chills / feverish', hint: 'Core thermal or immune response' },
    { id: 'skin-rash', label: 'Skin rash / itch', hint: 'Closed-habitat contact irritation' },
    { id: 'nasal-congestion', label: 'Sinus congestion', hint: 'Upper-body fluid pooling' },
  ],
  metabolism: [
    { id: 'low-energy-shaky', label: 'Shaky / low energy', hint: 'Between-meal glycemic dip' },
    { id: 'thirst-dry-mouth', label: 'Persistent thirst', hint: 'Fluid intake deficit' },
    { id: 'nausea-appetite', label: 'Low appetite / nausea', hint: 'GI transit or motion discomfort' },
  ],
  bone: [
    { id: 'lower-back-ache', label: 'Lower back ache', hint: 'Microgravity spinal unloading' },
    { id: 'joint-harness-soreness', label: 'Joint / harness soreness', hint: 'ARED resistive loading' },
    { id: 'flank-discomfort', label: 'Flank / side pain', hint: 'Screen for renal calcium mobilization' },
  ],
};

export function createInitialSymptomReports(): Record<ZoneId, ZoneSymptomReport> {
  return {
    brain: { zoneId: 'brain', discomfort: 0, tags: [] },
    eyes: { zoneId: 'eyes', discomfort: 0, tags: [] },
    heart: { zoneId: 'heart', discomfort: 0, tags: [] },
    immune: { zoneId: 'immune', discomfort: 0, tags: [] },
    metabolism: { zoneId: 'metabolism', discomfort: 0, tags: [] },
    bone: { zoneId: 'bone', discomfort: 0, tags: [] },
  };
}

export function hasZoneSymptoms(report: ZoneSymptomReport): boolean {
  return report.discomfort > 0 || report.tags.length > 0;
}

export function hasAnySymptoms(reports: Readonly<Record<ZoneId, ZoneSymptomReport>>): boolean {
  return Object.values(reports).some(hasZoneSymptoms);
}

/** Concise one-line summary for the zone card (returns null when nothing is reported). */
export function formatSymptomSummary(report: ZoneSymptomReport): string | null {
  if (!hasZoneSymptoms(report)) return null;
  const options = ZONE_SYMPTOMS[report.zoneId];
  const labels = report.tags
    .map((id) => options.find((o) => o.id === id)?.label)
    .filter((v): v is string => Boolean(v));
  const parts: string[] = [];
  if (labels.length > 0) parts.push(labels.join(', '));
  if (report.discomfort > 0) parts.push(`discomfort ${report.discomfort}/10`);
  return parts.join(' · ');
}
