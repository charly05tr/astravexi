import { useMemo } from 'react';
import { useAppActions, useAppContext, useAppState } from '../../app/app-context';
import { tierTheme } from '../../theme/tiers';
import { CmoPanel } from './CmoPanel';
import { buildCmoView } from './cmo-model';

export function CmoContainer() {
  const { knowledge } = useAppContext();
  const evaluation = useAppState((s) => s.session?.evaluation ?? null);
  const actions = useAppActions();
  const zones = useMemo(() => {
    if (!evaluation) return [];
    const labels = new Map(knowledge.zones.map((z) => [z.id, z.label]));
    return buildCmoView(evaluation, knowledge.indicators, labels, (t) => tierTheme(t).label);
  }, [evaluation, knowledge]);
  return <CmoPanel zones={zones} onAcknowledge={(zoneId, groupId) => void actions.acknowledge(zoneId, groupId)} />;
}
