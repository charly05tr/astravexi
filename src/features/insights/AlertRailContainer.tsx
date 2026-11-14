import { useAppState } from '../../app/app-context';
import { EmptyState } from '../../ui/Panel';
import { AlertRail } from './AlertRail';
import { useZones } from './use-zones';
import { zoneNote } from './zone-view';

export function AlertRailContainer() {
  const evaluation = useAppState((s) => s.session?.evaluation ?? null);
  const { views, selectedZoneId, selectZone } = useZones();
  if (!evaluation) return <EmptyState>Loading zones.</EmptyState>;
  const rows = views.map((v) => ({ id: v.id, label: v.label, status: v.status, note: zoneNote(v.id, evaluation) }));
  return <AlertRail rows={rows} selectedZoneId={selectedZoneId} onSelect={selectZone} />;
}
