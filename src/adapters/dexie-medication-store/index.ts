import Dexie from 'dexie';
import type { Table } from 'dexie';
import { compareAdministrations, compareAllergies } from '../../core/medical/model';
import type { Allergy, Medication, MedicationAdministration } from '../../core/medical/model';
import type { MedicationStore } from '../../core/ports';

class MedicalDb extends Dexie {
  medications!: Table<Medication, string>;
  administrations!: Table<MedicationAdministration, string>;
  allergies!: Table<Allergy, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      medications: 'id, name, category, expiresOn',
      administrations: 'id, profileId, administeredAt',
      allergies: 'id, profileId',
    });
  }
}

/** Opens the named medical database. Rejects when IndexedDB is unavailable; the caller falls back to memory. */
export async function openDexieMedicationStore(name: string): Promise<MedicationStore> {
  const db = new MedicalDb(name);
  await db.open();
  return {
    name,
    persistent: true,
    async listMedications() {
      const all = await db.medications.toArray();
      return all.sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1));
    },
    async putMedication(m) {
      await db.medications.put({ ...m });
    },
    async deleteMedication(id) {
      await db.medications.delete(id);
    },
    async listAdministrations(profileId) {
      return (await db.administrations.where('profileId').equals(profileId).toArray()).sort(compareAdministrations);
    },
    async putAdministration(a) {
      await db.administrations.put({ ...a });
    },
    async listAllergies(profileId) {
      return (await db.allergies.where('profileId').equals(profileId).toArray()).sort(compareAllergies);
    },
    async putAllergy(a) {
      await db.allergies.put({ ...a });
    },
    async counts() {
      const [medications, administrations, allergies] = await Promise.all([
        db.medications.count(),
        db.administrations.count(),
        db.allergies.count(),
      ]);
      return { medications, administrations, allergies };
    },
  };
}
