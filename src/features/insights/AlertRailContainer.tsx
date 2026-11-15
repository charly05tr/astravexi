import { useMemo } from 'react';
import { useAppContext, useAppState } from '../../app/app-context';
import { EmptyState } from '../../ui/Panel';
import { formatValue } from '../shared/format';
import { AlertRail } from './AlertRail';
import type { AlertRailRow } from './AlertRail';
import type { ZoneId } from '../../core/health/model';
import { buildTrend } from './trend-data';
import { useZones } from './use-zones';
import { zoneNote } from './zone-view';

/** Head to toe. The menu keeps this order so each zone always sits in the same place on the arc. */
export const ANATOMICAL_ORDER: readonly ZoneId[] = ['brain', 'eyes', 'heart', 'immune', 'metabolism', 'bone'];
const rank = (id: ZoneId) => {
  const i = ANATOMICAL_ORDER.indexOf(id);
  return i === -1 ? ANATOMICAL_ORDER.length : i;
};

export function AlertRailContainer() {
  const { knowledge } = useAppContext();
  const session = useAppState((s) => s.session);
  const { views, selectedZoneId, selectZone } = useZones();

  const rows = useMemo<AlertRailRow[]>(() => {
    if (!session) return [];
    const readings = [...session.synthetic, ...session.manual];
    const asOf = session.evaluation.asOf;
    return views.map((v) => {
      const zone = knowledge.zones.find((z) => z.id === v.id);
      const indicator = zone?.indicatorIds.length
        ? knowledge.indicators.find((i) => i.id === zone.indicatorIds[0])
        : undefined;
      let spark: AlertRailRow['spark'] = null;
      if (indicator) {
        const trend = buildTrend(readings, indicator, asOf, 14);
        const last = trend.points.at(-1);
        spark = {
          label: indicator.label,
          values: trend.points.map((p) => p.value),
          baseline: trend.baseline,
          last: last ? formatValue(last.value, indicator) : null,
        };
      }
      return { id: v.id, label: v.label, status: v.status, note: zoneNote(v.id, session.evaluation), spark };
    }).sort((a, b) => rank(a.id) - rank(b.id));
  }, [session, views, knowledge]);

  if (!session) return <EmptyState>Loading zones.</EmptyState>;
  return <AlertRail rows={rows} selectedZoneId={selectedZoneId} onSelect={selectZone} />;
}
