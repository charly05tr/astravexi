import { useMemo } from 'react';
import { useAppContext, useAppState } from '../../app/app-context';
import { useUi } from '../../app/ui-state';
import type { ZoneId } from '../../core/health/model';
import type { ZoneView } from '../body-map/body-model';
import { buildZoneViews } from './zone-view';

/**
 * Zones sorted by status, and the zone the panel shows. Before the user picks one, the panel follows the
 * highest-priority zone. The alert rail and the body model both use this, so they always agree.
 */
export function useZones(): {
  views: ZoneView[];
  selectedZoneId: ZoneId | null;
  /** The zone the user picked, or null when the panel just follows the highest-priority zone. */
  focusZoneId: ZoneId | null;
  selectZone(id: ZoneId): void;
  clearZone(): void;
} {
  const { knowledge } = useAppContext();
  const evaluation = useAppState((s) => s.session?.evaluation ?? null);
  const { selectedZoneId, selectZone, clearZone } = useUi();
  const views = useMemo(() => (evaluation ? buildZoneViews(knowledge.zones, evaluation) : []), [evaluation, knowledge]);
  const effective = selectedZoneId ?? views[0]?.id ?? null;
  return { views, selectedZoneId: effective, focusZoneId: selectedZoneId, selectZone, clearZone };
}
