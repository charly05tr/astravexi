import { describe, expect, it } from 'vitest';
import type { MedicationInput } from '../core/medical/model';
import { PermissionError } from '../core/profiles/policy';
import { createTestWorld } from '../test-support/compose';
import { DEMO_ASTRONAUT_ID } from './demo/demo-profiles';
import { seedDemoMedical } from './demo/demo-medical';
import { createMemoryMedicationStore } from '../adapters/memory-medication-store';
import { MEDICAL_DB_NAME } from './mode';

const input = (over: Partial<MedicationInput> = {}): MedicationInput => ({
  name: 'Naproxen',
  form: 'tablet',
  strength: '250 mg',
  category: 'analgesic',
  quantity: 30,
  unit: 'tablets',
  minStock: 10,
  expiresOn: '2027-03-31',
  ...over,
});

describe('medical use-cases (role guard)', () => {
  it.each(['astronaut', 'flightSurgeon'] as const)('refuses every medical call for a %s', async (role) => {
    const world = createTestWorld();
    const app = await world.app('demo', { role });
    const state = app.state();
    await expect(state.loadMedicalStock()).rejects.toBeInstanceOf(PermissionError);
    await expect(state.saveMedication(input())).rejects.toBeInstanceOf(PermissionError);
    await expect(state.deleteMedication('demo-med-ibuprofen')).rejects.toBeInstanceOf(PermissionError);
    await expect(state.loadMedicalRecord(DEMO_ASTRONAUT_ID)).rejects.toBeInstanceOf(PermissionError);
    // Nothing was written by the refused calls.
    const store = world.medicalStores.get(MEDICAL_DB_NAME.demo)!;
    expect((await store.listMedications()).some((m) => m.name === 'Naproxen')).toBe(false);
    expect((await store.listMedications()).some((m) => m.id === 'demo-med-ibuprofen')).toBe(true);
  });

  it('follows a role change of the signed-in profile without recomposing', async () => {
    const world = createTestWorld();
    const app = await world.app('demo', { role: 'cmo' });
    await expect(app.state().loadMedicalStock()).resolves.toBeDefined();
    app.state().setActor({ ...app.state().actor, role: 'astronaut' });
    await expect(app.state().loadMedicalStock()).rejects.toBeInstanceOf(PermissionError);
  });
});

describe('medical use-cases (CMO)', () => {
  it('lists the seeded kit most urgent first, with a summary', async () => {
    const world = createTestWorld();
    const app = await world.app('demo', { role: 'cmo' });
    const view = await app.state().loadMedicalStock();
    expect(view.medications[0]!.name).toBe('Lubricating eye drops'); // the expired line leads
    expect(view.summary.total).toBe(view.medications.length);
    expect(view.summary).toMatchObject({ expired: 1, expiringSoon: 1, outOfStock: 1 });
    expect(view.summary.lowStock).toBeGreaterThanOrEqual(3);
  });

  it('adds, edits and deletes a medication', async () => {
    const world = createTestWorld();
    const app = await world.app('demo', { role: 'cmo' });
    const before = (await app.state().loadMedicalStock()).summary.total;

    const added = await app.state().saveMedication(input({ name: '  Naproxen  ' }));
    if (!added.ok) throw new Error('expected ok');
    expect(added.medication.name).toBe('Naproxen');
    expect((await app.state().loadMedicalStock()).summary.total).toBe(before + 1);

    const edited = await app.state().saveMedication(input({ quantity: 2 }), added.medication.id);
    if (!edited.ok) throw new Error('expected ok');
    expect(edited.medication.id).toBe(added.medication.id);
    const row = (await app.state().loadMedicalStock()).medications.find((m) => m.id === added.medication.id);
    expect(row?.quantity).toBe(2);

    await app.state().deleteMedication(added.medication.id);
    expect((await app.state().loadMedicalStock()).summary.total).toBe(before);
  });

  it('returns field errors and writes nothing for invalid input', async () => {
    const world = createTestWorld();
    const app = await world.app('demo', { role: 'cmo' });
    const before = (await app.state().loadMedicalStock()).summary.total;
    const result = await app.state().saveMedication(input({ name: '', quantity: -3 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['name', 'quantity']);
    expect((await app.state().loadMedicalStock()).summary.total).toBe(before);
  });

  it('refuses to edit a medication that no longer exists', async () => {
    const world = createTestWorld();
    const app = await world.app('demo', { role: 'cmo' });
    const result = await app.state().saveMedication(input(), 'ghost');
    expect(result.ok).toBe(false);
    expect((await world.medicalStores.get(MEDICAL_DB_NAME.demo)!.listMedications()).some((m) => m.id === 'ghost')).toBe(false);
  });

  it('shows the allergies and administrations of the demo astronaut, and nothing for an unknown one', async () => {
    const world = createTestWorld();
    const app = await world.app('demo', { role: 'cmo' });
    const record = await app.state().loadMedicalRecord(DEMO_ASTRONAUT_ID);
    expect(record.allergies[0]).toMatchObject({ substance: 'Penicillin', severity: 'severe' });
    expect(record.administrations.length).toBeGreaterThan(0);
    expect(record.administrations.every((a) => a.profileId === DEMO_ASTRONAUT_ID)).toBe(true);
    expect(await app.state().loadMedicalRecord('nobody')).toEqual({ profileId: 'nobody', administrations: [], allergies: [] });
  });

  it('starts LIVE with an empty kit: nothing is seeded outside the demo', async () => {
    const world = createTestWorld();
    const app = await world.app('live', { role: 'cmo' });
    expect((await app.state().loadMedicalStock()).summary.total).toBe(0);
  });
});

describe('demo medical seed', () => {
  it('is idempotent and never overwrites the CMO edits', async () => {
    const store = createMemoryMedicationStore();
    const now = '2026-06-15T09:00:00.000Z';
    await seedDemoMedical(store, now);
    const first = await store.counts();
    expect(first.medications).toBeGreaterThanOrEqual(10);
    expect(first.medications).toBeLessThanOrEqual(15);

    await store.deleteMedication('demo-med-ibuprofen');
    await seedDemoMedical(store, now);
    const again = await store.counts();
    expect(again).toEqual({ ...first, medications: first.medications - 1 }); // not brought back, not duplicated
  });
});
