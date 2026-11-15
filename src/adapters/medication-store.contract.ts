import { describe, expect, it } from 'vitest';
import type { Allergy, Medication, MedicationAdministration } from '../core/medical/model';
import type { MedicationStore } from '../core/ports';

export const medication = (id: string, over: Partial<Medication> = {}): Medication => ({
  id,
  name: `Med ${id}`,
  form: 'tablet',
  strength: '100 mg',
  category: 'analgesic',
  quantity: 10,
  unit: 'tablets',
  minStock: 4,
  expiresOn: '2027-01-31',
  updatedAt: '2026-06-01T00:00:00.000Z',
  ...over,
});

export const administration = (id: string, profileId: string, over: Partial<MedicationAdministration> = {}): MedicationAdministration => ({
  id,
  profileId,
  medicationId: null,
  medicationName: 'Ibuprofen',
  dose: '400 mg',
  administeredAt: '2026-06-01T10:00:00.000Z',
  administeredBy: 'Demo CMO',
  notes: '',
  ...over,
});

export const allergy = (id: string, profileId: string, over: Partial<Allergy> = {}): Allergy => ({
  id,
  profileId,
  substance: 'Penicillin',
  severity: 'moderate',
  reaction: 'Rash',
  ...over,
});

/** The same behavior is required of the in-memory and the Dexie medication store. */
export function medicationStoreContract(label: string, create: () => Promise<MedicationStore>) {
  describe(`MedicationStore contract: ${label}`, () => {
    it('starts empty', async () => {
      const store = await create();
      expect(await store.listMedications()).toEqual([]);
      expect(await store.listAdministrations('a')).toEqual([]);
      expect(await store.listAllergies('a')).toEqual([]);
      expect(await store.counts()).toEqual({ medications: 0, administrations: 0, allergies: 0 });
    });

    it('upserts a medication by id and lists by name', async () => {
      const store = await create();
      await store.putMedication(medication('2', { name: 'Zinc' }));
      await store.putMedication(medication('1', { name: 'Aspirin' }));
      await store.putMedication(medication('2', { name: 'Zinc', quantity: 99 }));
      const all = await store.listMedications();
      expect(all.map((m) => [m.name, m.quantity])).toEqual([
        ['Aspirin', 10],
        ['Zinc', 99],
      ]);
    });

    it('deletes a medication, and ignores an unknown id', async () => {
      const store = await create();
      await store.putMedication(medication('1'));
      await store.deleteMedication('ghost');
      expect(await store.listMedications()).toHaveLength(1);
      await store.deleteMedication('1');
      expect(await store.listMedications()).toEqual([]);
    });

    it('keeps administrations per astronaut, newest first', async () => {
      const store = await create();
      await store.putAdministration(administration('old', 'a', { administeredAt: '2026-06-01T08:00:00.000Z' }));
      await store.putAdministration(administration('new', 'a', { administeredAt: '2026-06-02T08:00:00.000Z' }));
      await store.putAdministration(administration('other', 'b'));
      expect((await store.listAdministrations('a')).map((x) => x.id)).toEqual(['new', 'old']);
      expect((await store.listAdministrations('b')).map((x) => x.id)).toEqual(['other']);
    });

    it('keeps allergies per astronaut, most severe first', async () => {
      const store = await create();
      await store.putAllergy(allergy('1', 'a', { substance: 'Latex', severity: 'mild' }));
      await store.putAllergy(allergy('2', 'a', { substance: 'Penicillin', severity: 'severe' }));
      await store.putAllergy(allergy('3', 'a', { substance: 'Aspirin', severity: 'mild' }));
      await store.putAllergy(allergy('4', 'b'));
      expect((await store.listAllergies('a')).map((x) => x.substance)).toEqual(['Penicillin', 'Aspirin', 'Latex']);
    });

    it('counts each table', async () => {
      const store = await create();
      await store.putMedication(medication('1'));
      await store.putAdministration(administration('1', 'a'));
      await store.putAdministration(administration('2', 'a'));
      expect(await store.counts()).toEqual({ medications: 1, administrations: 2, allergies: 0 });
    });
  });
}
