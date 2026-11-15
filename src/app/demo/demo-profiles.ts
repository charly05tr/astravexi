import type { CrewProfile } from '../../core/profiles/model';

/** Fixed ids: the DEMO database is shared by both demo profiles and its records belong to the astronaut. */
export const DEMO_ASTRONAUT_ID = 'de000000-0000-4000-8000-00000000a570';
export const DEMO_CMO_ID = 'de000000-0000-4000-8000-00000000c300';
export const DEMO_SUBJECT_NAME = 'Demo astronaut';

/** The two profiles DEMO starts with, so the role switch can be shown. Neither has a PIN. */
export function demoProfiles(nowIso: string): CrewProfile[] {
  return [
    { id: DEMO_ASTRONAUT_ID, name: DEMO_SUBJECT_NAME, role: 'astronaut', createdAt: nowIso, updatedAt: nowIso, deleted: false },
    { id: DEMO_CMO_ID, name: 'Demo CMO', role: 'cmo', createdAt: nowIso, updatedAt: nowIso, deleted: false },
  ];
}
