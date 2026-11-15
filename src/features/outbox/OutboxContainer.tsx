import { useMemo } from 'react';
import { useAppActions, useAppContext, useAppState } from '../../app/app-context';
import { MAX_DELAY_MIN, MIN_DELAY_MIN } from '../../app/store/app-store';
import { useUi } from '../../app/ui-state';
import { OutboxPanel } from './OutboxPanel';
import { buildOutboxView } from './outbox-model';

export function OutboxContainer() {
  const { knowledge } = useAppContext();
  const { environment, symptomReports, triageAnswers, hmsUsedCounts, xehrAllergies } = useUi();
  const outbox = useAppState((s) => s.session?.outbox ?? null);
  const delay = useAppState((s) => s.link.oneWayDelayMin);
  const blackout = useAppState((s) => s.link.blackout);
  const scaleLabel = useAppState((s) => s.mission.scaleLabel);
  const mode = useAppState((s) => s.mode);
  const actions = useAppActions();

  const cards = useMemo(() => {
    const labels = new Map(knowledge.zones.map((z) => [z.id, z.label]));
    return buildOutboxView(outbox ?? [], { oneWayDelayMin: delay, blackout }, labels, {
      environment,
      symptomReports,
      triageAnswers,
      hmsUsedCounts,
      allergyCount: xehrAllergies.length,
    });
  }, [outbox, delay, blackout, knowledge, environment, symptomReports, triageAnswers, hmsUsedCounts, xehrAllergies]);

  return (
    <OutboxPanel
      cards={cards}
      oneWayDelayMin={delay}
      minDelay={MIN_DELAY_MIN}
      maxDelay={MAX_DELAY_MIN}
      blackout={blackout}
      blackoutEnabled
      scaleLabel={scaleLabel}
      isLive={mode === 'live'}
      onDelay={(m) => void actions.setDelay(m)}
      onBlackout={(on) => void actions.setBlackout(on)}
      onSend={(id) => void actions.sendNow(id)}
    />
  );
}
