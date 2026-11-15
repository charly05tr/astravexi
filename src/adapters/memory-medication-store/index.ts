import { compareAdministrations, compareAllergies } from '../../core/medical/model';
import type { Allergy, Medication, MedicationAdministration } from '../../core/medical/model';
import type { MedicationStore } from '../../core/ports';

const copy = <T>(value: T): T => structuredClone(value);

/** In-memory medical store: the fallback when IndexedDB is unavailable, and the store used in tests. */
export function createMemoryMedicationStore(name = 'memory-medical'): MedicationStore {
  const medications = new Map<string, Medication>();
  const administrations = new Map<string, MedicationAdministration>();
  const allergies = new Map<string, Allergy>();
  return {
    name,
    persistent: false,
    async listMedications() {
      return copy([...medications.values()].sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1)));
    },
    async putMedication(m) {
      medications.set(m.id, copy(m));
    },
    async deleteMedication(id) {
      medications.delete(id);
    },
    async listAdministrations(profileId) {
      return copy([...administrations.values()].filter((a) => a.profileId === profileId).sort(compareAdministrations));
    },
    async putAdministration(a) {
      administrations.set(a.id, copy(a));
    },
    async listAllergies(profileId) {
      return copy([...allergies.values()].filter((a) => a.profileId === profileId).sort(compareAllergies));
    },
    async putAllergy(a) {
      allergies.set(a.id, copy(a));
    },
    async counts() {
      return { medications: medications.size, administrations: administrations.size, allergies: allergies.size };
    },
  };
}
