import type { AllergySeverity, ExpiryStatus, MedicationCategory, StockLevel } from '../../core/medical/model';

export const CATEGORY_LABEL: Record<MedicationCategory, string> = {
  analgesic: 'Analgesic',
  antimicrobial: 'Antimicrobial',
  cardiovascular: 'Cardiovascular',
  gastrointestinal: 'Gastrointestinal',
  respiratory: 'Respiratory',
  allergy: 'Allergy',
  sleep: 'Sleep',
  topical: 'Topical',
  ophthalmic: 'Ophthalmic',
  other: 'Other',
};

export const SEVERITY_LABEL: Record<AllergySeverity, string> = {
  mild: 'Mild',
  moderate: 'Moderate',
  severe: 'Severe',
};

export const STOCK_LABEL: Record<Exclude<StockLevel, 'ok'>, string> = { low: 'Low stock', out: 'Out of stock' };
export const EXPIRY_LABEL: Record<Exclude<ExpiryStatus, 'ok'>, string> = { soon: 'Expires soon', expired: 'Expired' };

/** `2026-06-15T09:30:00.000Z` becomes `2026-06-15 09:30 UTC`. */
export function formatInstant(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}
