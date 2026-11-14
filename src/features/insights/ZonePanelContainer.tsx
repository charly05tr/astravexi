import { useMemo } from 'react';
import { useAppActions, useAppContext, useAppState } from '../../app/app-context';
import { EmptyState } from '../../ui/Panel';
import { ZonePanel } from './ZonePanel';
import { useZones } from './use-zones';
import { buildZonePanelModel } from './zone-panel-model';

export function ZonePanelContainer() {
  const { knowledge, content } = useAppContext();
  const session = useAppState((s) => s.session);
  const mode = useAppState((s) => s.mode);
  const actions = useAppActions();
  const { selectedZoneId } = useZones();

  const model = useMemo(() => {
    if (!session || !selectedZoneId) return null;
    const zone = knowledge.zones.find((z) => z.id === selectedZoneId);
    if (!zone) return null;
    return buildZonePanelModel({
      zone,
      evaluation: session.evaluation,
      knowledge,
      content,
      readings: [...session.synthetic, ...session.manual],
      decisions: session.decisions,
      asOf: session.evaluation.asOf,
    });
  }, [session, selectedZoneId, knowledge, content]);

  if (!model) return <EmptyState>Select a zone to see what changed, why it matters and what to do.</EmptyState>;
  return (
    <ZonePanel
      model={model}
      isLive={mode === 'live'}
      onDecide={(recommendationId, findingKey, decision) =>
        void actions.decideRecommendation({ recommendationId, findingKey, decision })
      }
    />
  );
}
