import type { CrewProfile } from '../../core/profiles/model';

/** Fixed ids: the DEMO database is shared by both demo profiles and its records belong to the astronaut. */
export const DEMO_ASTRONAUT_ID = 'de000000-0000-4000-8000-00000000a570';
export const DEMO_CMO_ID = 'de000000-0000-4000-8000-00000000c300';
export const DEMO_SUBJECT_NAME = 'Demo astronaut';

/**
 * Two more synthetic crew members, so the crew dashboard has something to compare. Each one has its own
 * synthetic history and its own acknowledgements, apart from the demo astronaut's database.
 * `scenario` false means a calm history, with no drift.
 */
export const DEMO_CREW_EXTRAS: ReadonlyArray<{ id: string; name: string; seed: number; scenario: boolean }> = [
  { id: 'de000000-0000-4000-8000-00000000d001', name: 'Demo astronaut 2', seed: 20261, scenario: true },
  { id: 'de000000-0000-4000-8000-00000000d002', name: 'Demo astronaut 3', seed: 20262, scenario: false },
];

/**
 * Ids the two extra crewmates had before they got their final ones. A device that ran that build still holds
 * these rows, so seeding retires them: otherwise each crewmate would appear twice, the old copy with no data.
 */
export const RETIRED_DEMO_CREW_IDS: readonly string[] = [
  'de000000-0000-4000-8000-00000000a571',
  'de000000-0000-4000-8000-00000000a572',
];

/** The profiles DEMO starts with, so the role switch and the crew dashboard can be shown. None has a PIN. */
export function demoProfiles(nowIso: string): CrewProfile[] {
  const base = { createdAt: nowIso, updatedAt: nowIso, deleted: false };
  return [
    { id: DEMO_ASTRONAUT_ID, name: DEMO_SUBJECT_NAME, role: 'astronaut', ...base },
    { id: DEMO_CMO_ID, name: 'Demo CMO', role: 'cmo', ...base },
    ...DEMO_CREW_EXTRAS.map((c): CrewProfile => ({ id: c.id, name: c.name, role: 'astronaut', ...base })),
  ];
}
