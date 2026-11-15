import { dateOf, sortByUrgency, summarizeStock, validateMedication } from '../medical/model';
import type { Allergy, Medication, MedicationAdministration, MedicationErrors, MedicationInput, StockSummary } from '../medical/model';
import type { MedicationStore } from '../ports';
import { assertCan } from '../profiles/policy';
import type { Deps } from './session';

/** What the medical use-cases need. A subset of the session `Deps` plus the medical store. */
export type MedicalDeps = Pick<Deps, 'actor' | 'newId' | 'nowIso'> & { medical: MedicationStore };

export interface MedicalStockView {
  /** Most urgent first. */
  medications: Medication[];
  summary: StockSummary;
  /** The calendar date the statuses were computed for. */
  today: string;
}

export interface MedicalRecordView {
  profileId: string;
  administrations: MedicationAdministration[];
  allergies: Allergy[];
}

export type SaveMedicationResult = { ok: true; medication: Medication } | { ok: false; errors: MedicationErrors };

function normalize(input: MedicationInput): MedicationInput {
  return {
    ...input,
    name: input.name.trim(),
    form: input.form.trim(),
    strength: input.strength.trim(),
    unit: input.unit.trim(),
    expiresOn: input.expiresOn.trim(),
  };
}

/** The medical kit with its summary. CMO only. */
export async function loadMedicalStock(deps: MedicalDeps): Promise<MedicalStockView> {
  assertCan(deps.actor.role, 'manageMedicalStock');
  const today = dateOf(deps.nowIso());
  const medications = await deps.medical.listMedications();
  return { medications: sortByUrgency(medications, today), summary: summarizeStock(medications, today), today };
}

/**
 * Adds a medication (no `id`) or replaces one (`id` of an existing line). CMO only. Invalid input is returned
 * as field errors and nothing is written. Editing an unknown id is refused as an error on `name`.
 */
export async function saveMedication(deps: MedicalDeps, input: MedicationInput, id?: string): Promise<SaveMedicationResult> {
  assertCan(deps.actor.role, 'manageMedicalStock');
  const clean = normalize(input);
  const errors = validateMedication(clean);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (id !== undefined) {
    const known = (await deps.medical.listMedications()).some((m) => m.id === id);
    if (!known) return { ok: false, errors: { name: 'This medication no longer exists.' } };
  }
  const medication: Medication = { ...clean, id: id ?? deps.newId(), updatedAt: deps.nowIso() };
  await deps.medical.putMedication(medication);
  return { ok: true, medication };
}

/** Removes a medication line. CMO only. Past administrations keep the name they were recorded with. */
export async function deleteMedication(deps: MedicalDeps, id: string): Promise<void> {
  assertCan(deps.actor.role, 'manageMedicalStock');
  await deps.medical.deleteMedication(id);
}

/** What was administered to one astronaut and their allergies. CMO only. */
export async function loadMedicalRecord(deps: MedicalDeps, profileId: string): Promise<MedicalRecordView> {
  assertCan(deps.actor.role, 'viewMedicalRecords');
  const [administrations, allergies] = await Promise.all([
    deps.medical.listAdministrations(profileId),
    deps.medical.listAllergies(profileId),
  ]);
  return { profileId, administrations, allergies };
}
