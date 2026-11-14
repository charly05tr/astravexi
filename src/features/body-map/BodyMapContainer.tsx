import { useZones } from '../insights/use-zones';
import { EmptyState } from '../../ui/Panel';
import type { BodyModel } from './body-model';
import { SvgBody } from './SvgBody';

/**
 * Resolves the body implementation. Batch 4 adds the 3D hologram to this registry behind the same
 * contract, with the 2D SVG as the fallback; no consumer changes.
 */
const BODY_REGISTRY: Record<'svg', BodyModel> = { svg: SvgBody };

export function BodyMapContainer({ reducedMotion = false }: { reducedMotion?: boolean }) {
  const { views, selectedZoneId, selectZone } = useZones();
  if (views.length === 0) return <EmptyState>Loading body map.</EmptyState>;
  const Body = BODY_REGISTRY.svg;
  return <Body zones={views} selectedZoneId={selectedZoneId} onSelectZone={selectZone} reducedMotion={reducedMotion} />;
}
