import { dateOf } from '../../core/medical/model';
import type { Allergy, Medication, MedicationAdministration, MedicationCategory } from '../../core/medical/model';
import type { MedicationStore } from '../../core/ports';
import { DEMO_ASTRONAUT_ID, DEMO_CREW_EXTRAS } from './demo-profiles';

const [DEMO_ASTRONAUT_2_ID, DEMO_ASTRONAUT_3_ID] = DEMO_CREW_EXTRAS.map((c) => c.id) as [string, string];

/** `YYYY-MM-DD`, `days` after (or before, when negative) the date of `nowIso`. */
function dayOffset(nowIso: string, days: number): string {
  const d = new Date(`${dateOf(nowIso)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** An instant `hoursAgo` before `nowIso`, to the minute. */
function hoursBefore(nowIso: string, hoursAgo: number): string {
  const t = new Date(nowIso).getTime() - hoursAgo * 3_600_000;
  return `${new Date(t).toISOString().slice(0, 16)}:00.000Z`;
}

type KitLine = [id: string, name: string, form: string, strength: string, category: MedicationCategory, quantity: number, unit: string, minStock: number, expiresInDays: number];

/**
 * A plausible space-medicine kit. Expiry dates are relative to the day of seeding so the demo always shows the
 * same picture: one expired line, a few low or out of stock, one expiring soon, the rest healthy.
 */
const KIT: readonly KitLine[] = [
  ['ibuprofen', 'Ibuprofen', 'tablet', '200 mg', 'analgesic', 120, 'tablets', 40, 540],
  ['acetaminophen', 'Acetaminophen', 'tablet', '500 mg', 'analgesic', 18, 'tablets', 30, 420],
  ['ketorolac', 'Ketorolac', 'injection', '30 mg/mL', 'analgesic', 6, 'vials', 4, 300],
  ['azithromycin', 'Azithromycin', 'tablet', '250 mg', 'antimicrobial', 24, 'tablets', 12, 620],
  ['cipro', 'Ciprofloxacin', 'tablet', '500 mg', 'antimicrobial', 14, 'tablets', 10, 45],
  ['promethazine', 'Promethazine', 'suppository', '25 mg', 'gastrointestinal', 0, 'suppositories', 6, 380],
  ['loperamide', 'Loperamide', 'capsule', '2 mg', 'gastrointestinal', 36, 'capsules', 12, 700],
  ['pseudoephedrine', 'Pseudoephedrine', 'tablet', '30 mg', 'respiratory', 40, 'tablets', 20, 260],
  ['diphenhydramine', 'Diphenhydramine', 'capsule', '25 mg', 'allergy', 30, 'capsules', 15, 500],
  ['epinephrine', 'Epinephrine auto-injector', 'injection', '0.3 mg', 'allergy', 3, 'injectors', 3, 210],
  ['zolpidem', 'Zolpidem', 'tablet', '5 mg', 'sleep', 28, 'tablets', 10, 330],
  ['eye-drops', 'Lubricating eye drops', 'solution', '0.5%', 'ophthalmic', 9, 'vials', 6, -20],
  ['hydrocortisone', 'Hydrocortisone cream', 'cream', '1%', 'topical', 8, 'tubes', 3, 480],
];

function demoMedications(nowIso: string): Medication[] {
  return KIT.map(([id, name, form, strength, category, quantity, unit, minStock, expiresInDays]) => ({
    id: `demo-med-${id}`,
    name,
    form,
    strength,
    category,
    quantity,
    unit,
    minStock,
    expiresOn: dayOffset(nowIso, expiresInDays),
    updatedAt: nowIso,
  }));
}

function demoAdministrations(nowIso: string): MedicationAdministration[] {
  const by = 'Demo CMO';
  const rows: Array<[string, string, string, string, string, number, string]> = [
    [DEMO_ASTRONAUT_ID, 'ibuprofen', 'Ibuprofen', '400 mg oral', 'Tension headache after exercise.', 26, 'a1'],
    [DEMO_ASTRONAUT_ID, 'zolpidem', 'Zolpidem', '5 mg oral', 'Sleep disruption, second night in a row.', 70, 'a2'],
    [DEMO_ASTRONAUT_ID, 'eye-drops', 'Lubricating eye drops', '2 drops, both eyes', 'Dry eyes. Reviewed with the visual acuity check-in.', 120, 'a3'],
    [DEMO_ASTRONAUT_2_ID, 'promethazine', 'Promethazine', '25 mg rectal', 'Space motion sickness, nausea.', 40, 'b1'],
    [DEMO_ASTRONAUT_2_ID, 'acetaminophen', 'Acetaminophen', '1000 mg oral', 'Back pain.', 96, 'b2'],
    [DEMO_ASTRONAUT_3_ID, 'loperamide', 'Loperamide', '4 mg, then 2 mg', 'Loose stools, resolved the same day.', 150, 'c1'],
  ];
  return rows.map(([profileId, medId, medicationName, dose, notes, hoursAgo, key]) => ({
    id: `demo-adm-${key}`,
    profileId,
    medicationId: `demo-med-${medId}`,
    medicationName,
    dose,
    administeredAt: hoursBefore(nowIso, hoursAgo),
    administeredBy: by,
    notes,
  }));
}

const DEMO_ALLERGIES: readonly Allergy[] = [
  { id: 'demo-alg-a1', profileId: DEMO_ASTRONAUT_ID, substance: 'Penicillin', severity: 'severe', reaction: 'Anaphylaxis (childhood episode).' },
  { id: 'demo-alg-a2', profileId: DEMO_ASTRONAUT_ID, substance: 'Latex', severity: 'mild', reaction: 'Contact dermatitis from gloves.' },
  { id: 'demo-alg-b1', profileId: DEMO_ASTRONAUT_2_ID, substance: 'Ibuprofen', severity: 'moderate', reaction: 'Hives and facial swelling.' },
  { id: 'demo-alg-b2', profileId: DEMO_ASTRONAUT_2_ID, substance: 'Medical adhesives', severity: 'mild', reaction: 'Skin redness under sensor patches.' },
];

/**
 * Fills the medical store for the demo. Idempotent per table: a table that already holds rows is left alone, so
 * the CMO's own edits survive a reload and a deleted demo line is not brought back while others remain.
 */
export async function seedDemoMedical(store: MedicationStore, nowIso: string): Promise<void> {
  const counts = await store.counts();
  if (counts.medications === 0) for (const m of demoMedications(nowIso)) await store.putMedication(m);
  if (counts.administrations === 0) for (const a of demoAdministrations(nowIso)) await store.putAdministration(a);
  if (counts.allergies === 0) for (const a of DEMO_ALLERGIES) await store.putAllergy(a);
}
