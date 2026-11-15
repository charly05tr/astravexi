import type { ZoneId } from '../../../core/health/model';

/**
 * Which zone each mesh of public/models/body.glb belongs to. Mesh names come from the model's organ
 * nodes (see scripts/pack-body-model.py). `null` = shown but not selectable (no zone in this prototype).
 */
export const ORGAN_ZONE: Readonly<Record<string, ZoneId | null>> = {
  Brain: 'brain',
  Eye: 'eyes',
  Heart: 'heart',
  ArteriasMesh: 'heart',
  VenasMesh: 'heart',
  Liver: 'metabolism',
  Gallbladder: 'metabolism',
  DigestiveSystem: 'metabolism',
  Urinary_System: 'metabolism',
  Skull: 'bone',
  Spine: 'bone',
  Ribcage: 'bone',
  Pelvis: 'bone',
  Legs: 'bone',
  Hands: 'bone',
  HumanLungs: null,
  Diafragma: null,
};

/** Bones that enclose organs. A click passes through them to the organ behind, if there is one. */
const SHELLS: ReadonlySet<string> = new Set(['Skull', 'Ribcage', 'Pelvis', 'ArteriasMesh', 'VenasMesh']);

/** The meshes the camera frames when a zone is focused. Immune is systemic: it frames the whole body. */
export const ZONE_FOCUS: Readonly<Record<ZoneId, readonly string[] | 'all'>> = {
  brain: ['Brain'],
  eyes: ['Eye', 'Skull'],
  heart: ['Heart'],
  metabolism: ['Liver', 'Gallbladder', 'DigestiveSystem'],
  bone: 'all',
  immune: 'all',
};

/**
 * The morph target that pulls each organ out of the body ("exploded view": weight 0 = in place, 1 = out).
 * Measured from the model: it is the rigid-translation target. Keep in sync with scripts/pack-body-model.py.
 */
export const EXPLODE_TARGET: Readonly<Record<string, number>> = {
  Brain: 0,
  Eye: 0,
  Gallbladder: 0,
  Liver: 0,
  Urinary_System: 0,
  Heart: 2,
  HumanLungs: 1,
  Diafragma: 1,
  DigestiveSystem: 2,
};

export const EXPLODABLE: ReadonlySet<string> = new Set(Object.keys(EXPLODE_TARGET));

/**
 * The organs pulled out of the body when a zone is focused: the zone's framed organs that can explode.
 * Zones without such an organ (heart, bone, immune) only zoom.
 */
export function explodingOrgans(zone: ZoneId | null): ReadonlySet<string> {
  if (!zone) return new Set();
  const focus = ZONE_FOCUS[zone];
  return new Set(focus === 'all' ? [] : focus.filter((name) => EXPLODABLE.has(name)));
}

/** Where a zone's pin sits, as a mesh name, or a fixed point (model units, cm) for systemic or adjacent zones. */
export const ZONE_PIN: Readonly<Record<ZoneId, string | readonly [number, number, number]>> = {
  brain: [0, 168, 4],
  eyes: 'Eye',
  heart: 'Heart',
  metabolism: 'Liver',
  bone: 'Pelvis',
  immune: [0, 142, 4],
};

/**
 * Resolves a click from the meshes under the pointer, nearest first. Enclosing bones are skipped while an
 * organ lies behind them, so clicking the head picks the brain, not the skull; with no organ behind, the
 * bone itself is picked. A mesh with no zone (lungs) stops the pick.
 */
export function pickZone(hitMeshNames: readonly string[]): ZoneId | null {
  let fallback: ZoneId | null = null;
  for (const name of hitMeshNames) {
    if (!(name in ORGAN_ZONE)) continue;
    const zone = ORGAN_ZONE[name] ?? null;
    if (SHELLS.has(name)) {
      fallback ??= zone;
      continue;
    }
    return zone ?? fallback;
  }
  return fallback;
}

/** The meshes that stay opaque while a zone is focused. Immune has no organ, so nothing fades. */
export function meshesOfZone(zone: ZoneId): ReadonlySet<string> {
  const names = Object.keys(ORGAN_ZONE);
  return new Set(zone === 'immune' ? names : names.filter((n) => ORGAN_ZONE[n] === zone));
}
