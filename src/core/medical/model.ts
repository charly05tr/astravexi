/** Medical kit stock, what was administered to each astronaut, and their allergies. All local, never synced. */

export const MEDICATION_CATEGORIES = [
  'analgesic',
  'antimicrobial',
  'cardiovascular',
  'gastrointestinal',
  'respiratory',
  'allergy',
  'sleep',
  'topical',
  'ophthalmic',
  'other',
] as const;
export type MedicationCategory = (typeof MEDICATION_CATEGORIES)[number];

export const isMedicationCategory = (v: unknown): v is MedicationCategory =>
  (MEDICATION_CATEGORIES as readonly unknown[]).includes(v);

/** One medication line of the medical kit. `expiresOn` is a calendar date, `YYYY-MM-DD`. */
export interface Medication {
  id: string;
  name: string;
  /** Dosage form, e.g. "tablet", "injection". */
  form: string;
  /** Strength per unit, e.g. "500 mg". */
  strength: string;
  category: MedicationCategory;
  quantity: number;
  /** What `quantity` counts, e.g. "tablets", "vials". */
  unit: string;
  /** At or below this quantity the medication counts as low stock. */
  minStock: number;
  expiresOn: string;
  updatedAt: string;
}

/** What the CMO types in. The id and timestamp are assigned by the use-case. */
export type MedicationInput = Omit<Medication, 'id' | 'updatedAt'>;

/** One dose given to an astronaut. The name is kept as written, so it survives the medication being removed. */
export interface MedicationAdministration {
  id: string;
  profileId: string;
  medicationId: string | null;
  medicationName: string;
  dose: string;
  /** ISO-8601 UTC instant. */
  administeredAt: string;
  administeredBy: string;
  notes: string;
}

export const ALLERGY_SEVERITIES = ['mild', 'moderate', 'severe'] as const;
export type AllergySeverity = (typeof ALLERGY_SEVERITIES)[number];

export interface Allergy {
  id: string;
  profileId: string;
  substance: string;
  severity: AllergySeverity;
  reaction: string;
}

export type StockLevel = 'ok' | 'low' | 'out';
export type ExpiryStatus = 'ok' | 'soon' | 'expired';

/** Medications that expire within this many days (inclusive) count as "expiring soon". */
export const EXPIRY_WARNING_DAYS = 90;

export const MAX_TEXT_LENGTH = 80;

export function stockLevel(m: Pick<Medication, 'quantity' | 'minStock'>): StockLevel {
  if (m.quantity <= 0) return 'out';
  return m.quantity <= m.minStock ? 'low' : 'ok';
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days since 1970-01-01 of a proleptic Gregorian date (no `Date`: the core stays deterministic). */
function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Days since the epoch of a real `YYYY-MM-DD` calendar date; null for anything else. */
function parseDate(value: string): number | null {
  const m = DATE_RE.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return null;
  if (d > DAYS_IN_MONTH[mo - 1]! + (mo === 2 && isLeap(y) ? 1 : 0)) return null;
  return daysFromCivil(y, mo, d);
}

/** Whole UTC days from `YYYY-MM-DD` to `YYYY-MM-DD`; null when either is not a real calendar date. */
export function daysBetween(fromDate: string, toDate: string): number | null {
  const a = parseDate(fromDate);
  const b = parseDate(toDate);
  return a === null || b === null ? null : b - a;
}

/** `today` is a `YYYY-MM-DD` date. A medication is expired the day after its expiry date. */
export function expiryStatus(m: Pick<Medication, 'expiresOn'>, today: string): ExpiryStatus {
  const days = daysBetween(today, m.expiresOn);
  if (days === null || days < 0) return 'expired';
  return days <= EXPIRY_WARNING_DAYS ? 'soon' : 'ok';
}

export interface MedicationStatus {
  stock: StockLevel;
  expiry: ExpiryStatus;
}

export const medicationStatus = (m: Medication, today: string): MedicationStatus => ({
  stock: stockLevel(m),
  expiry: expiryStatus(m, today),
});

export interface StockSummary {
  total: number;
  lowStock: number;
  outOfStock: number;
  expiringSoon: number;
  expired: number;
}

/** `lowStock` includes the out-of-stock lines: it is everything at or below its minimum. */
export function summarizeStock(medications: readonly Medication[], today: string): StockSummary {
  const summary: StockSummary = { total: medications.length, lowStock: 0, outOfStock: 0, expiringSoon: 0, expired: 0 };
  for (const m of medications) {
    const { stock, expiry } = medicationStatus(m, today);
    if (stock !== 'ok') summary.lowStock += 1;
    if (stock === 'out') summary.outOfStock += 1;
    if (expiry === 'soon') summary.expiringSoon += 1;
    if (expiry === 'expired') summary.expired += 1;
  }
  return summary;
}

export type MedicationErrors = Partial<Record<keyof MedicationInput, string>>;

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

/** Returns the field errors of a medication form; an empty object means valid. */
export function validateMedication(input: MedicationInput): MedicationErrors {
  const errors: MedicationErrors = {};
  for (const key of ['name', 'form', 'unit'] as const) {
    const value = input[key].trim();
    if (!value) errors[key] = 'Required.';
    else if (value.length > MAX_TEXT_LENGTH) errors[key] = `At most ${MAX_TEXT_LENGTH} characters.`;
  }
  if (input.strength.trim().length > MAX_TEXT_LENGTH) errors.strength = `At most ${MAX_TEXT_LENGTH} characters.`;
  if (!isMedicationCategory(input.category)) errors.category = 'Pick a category.';
  if (!isCount(input.quantity)) errors.quantity = 'Enter a whole number, 0 or more.';
  if (!isCount(input.minStock)) errors.minStock = 'Enter a whole number, 0 or more.';
  if (parseDate(input.expiresOn) === null) errors.expiresOn = 'Enter a valid date.';
  return errors;
}

/** The calendar date (`YYYY-MM-DD`, UTC) of an ISO instant. */
export const dateOf = (iso: string): string => iso.slice(0, 10);

/** Orders the kit for review: most urgent first (expired, out, low, expiring soon), then by name. */
export function sortByUrgency(medications: readonly Medication[], today: string): Medication[] {
  const rank = (m: Medication) => {
    const { stock, expiry } = medicationStatus(m, today);
    if (expiry === 'expired') return 0;
    if (stock === 'out') return 1;
    if (stock === 'low') return 2;
    if (expiry === 'soon') return 3;
    return 4;
  };
  return [...medications].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** Most severe first, then by substance. Stores use it so every adapter lists allergies the same way. */
export function compareAllergies(a: Allergy, b: Allergy): number {
  return ALLERGY_SEVERITIES.indexOf(b.severity) - ALLERGY_SEVERITIES.indexOf(a.severity) || a.substance.localeCompare(b.substance);
}

/** Newest first. */
export function compareAdministrations(a: MedicationAdministration, b: MedicationAdministration): number {
  return a.administeredAt < b.administeredAt ? 1 : a.administeredAt > b.administeredAt ? -1 : a.id < b.id ? -1 : 1;
}
