import { useMemo } from 'react';
import { useAppContext, useAppState } from '../../app/app-context';
import { EmptyState } from '../../ui/Panel';
import { formatValue } from '../shared/format';
import { AlertRail } from './AlertRail';
import type { AlertRailRow } from './AlertRail';
import { buildTrend } from './trend-data';
import { useZones } from './use-zones';
import { zoneNote } from './zone-view';

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
    });
  }, [session, views, knowledge]);

  if (!session) return <EmptyState>Loading zones.</EmptyState>;
  return <AlertRail rows={rows} selectedZoneId={selectedZoneId} onSelect={selectZone} />;
}
