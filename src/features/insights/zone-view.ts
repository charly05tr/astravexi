import type { BodyZone, Evaluation } from '../../core/health/model';
import { statusRank } from '../../core/health/tiers';
import type { ZoneView } from '../body-map/body-model';

/** Zones sorted by status (Warning first, Not monitored last); ties keep the catalog order. */
export function buildZoneViews(zones: readonly BodyZone[], evaluation: Evaluation): ZoneView[] {
  return zones
    .map((z, index) => ({ z, index }))
    .map(({ z, index }) => ({ view: { id: z.id, label: z.label, status: evaluation.zones[z.id].status }, index }))
    .sort((a, b) => statusRank(b.view.status) - statusRank(a.view.status) || a.index - b.index)
    .map(({ view }) => view);
}

/** One line under the zone name in the alert rail. */
export function zoneNote(zoneId: BodyZone['id'], evaluation: Evaluation): string {
  const zone = evaluation.zones[zoneId];
  switch (zone.status) {
    case 'unmonitored':
      return 'Function text only';
    case 'noData':
      return 'No recent reading';
    case 'none':
      return 'Nothing active';
    default: {
      const n = zone.findings.length;
      const base = `${n} ${n === 1 ? 'finding' : 'findings'}`;
      return zone.corroborated ? `${base}, corroborated` : base;
    }
  }
}
