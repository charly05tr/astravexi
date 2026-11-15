import { useMemo, useState } from 'react';
import type { IndicatorId } from '../../core/health/model';
import { useAppActions, useAppContext, useAppState } from '../../app/app-context';
import type { SuggestionContext } from '../../core/ports';
import { can } from '../../core/profiles/policy';
import { EmptyState } from '../../ui/Panel';
import { CheckInContainer } from '../check-in/CheckInContainer';
import { useUi } from '../../app/ui-state';
import type { Suggestion } from '../../core/ports';
import { SuggestionList } from '../suggestions/SuggestionList';
import { buildFollowUpContext } from '../suggestions/follow-up-context';
import { useStore } from 'zustand';
import { useSuggestions } from '../suggestions/use-suggestions';
import { ZonePanel } from './ZonePanel';
import { useZones } from './use-zones';
import { buildZonePanelModel } from './zone-panel-model';

export function ZonePanelContainer() {
  const { knowledge, content } = useAppContext();
  const session = useAppState((s) => s.session);
  const mode = useAppState((s) => s.mode);
  const role = useAppState((s) => s.actor.role);
  const canDecide = can(role, 'decideRecommendation');
  const canCheckIn = can(role, 'checkIn');
  const actions = useAppActions();
  const { selectedZoneId, focusZoneId, clearZone } = useZones();

  const zone = useMemo(() => knowledge.zones.find((z) => z.id === selectedZoneId) ?? null, [knowledge, selectedZoneId]);

  const model = useMemo(() => {
    if (!session || !zone) return null;
    return buildZonePanelModel({
      zone,
      evaluation: session.evaluation,
      knowledge,
      content,
      readings: [...session.synthetic, ...session.manual],
      decisions: session.decisions,
      asOf: session.evaluation.asOf,
    });
  }, [session, zone, knowledge, content]);

  const context = useMemo<SuggestionContext | null>(() => {
    if (!model || !session) return null;
    return {
      zone: { id: model.zoneId, label: model.label, status: model.status },
      missionDay: session.evaluation.asOf.day,
      findings: model.suggestionFindings,
      decisions: session.decisions,
    };
  }, [model, session]);
  const suggestions = useSuggestions(context);
  const { followUpJobs, followUps: aiProvider } = useAppContext();
  const jobs = useStore(followUpJobs, (s) => s.jobs);
  const followUps = useMemo(
    () => ({ jobs, dismiss: (id: string) => followUpJobs.getState().dismiss(id) }),
    [jobs, followUpJobs],
  );
  const { setAiSettingsOpen } = useUi();

  // The decision is logged first and always. The AI follow-up is a bonus on top of an accepted change.
  const decide = async (s: Suggestion, decision: 'accepted' | 'dismissed') => {
    await actions.decideRecommendation({ recommendationId: s.id, findingKey: s.findingKey, decision });
    if (decision === 'accepted' && context && session) {
      const followUpContext = buildFollowUpContext({
        accepted: s,
        context,
        readings: [...session.synthetic, ...session.manual],
        indicators: knowledge.indicators,
      });
      if (followUpContext) followUpJobs.getState().start(s.id, followUpContext);
      else if (aiProvider.isConfigured()) {
        followUpJobs
          .getState()
          .skip(s.id, 'This recommendation is based on private readings, so it is not sent to the AI.');
      }
    }
  };
  // The detail view belongs to one zone: switching zones returns to that zone's summary.
  const [detailFor, setDetailFor] = useState<string | null>(null);

  if (!model || !zone) return <EmptyState>Select a zone to see what changed, why it matters and what to do.</EmptyState>;
  return (
    <ZonePanel
      model={model}
      isLive={mode === 'live'}
      focused={focusZoneId !== null}
      onBack={clearZone}
      detail={detailFor === model.zoneId}
      onDetail={(open) => setDetailFor(open ? model.zoneId : null)}
      topSuggestion={
        <SuggestionList
          variant="summary"
          state={suggestions}
          canDecide={canDecide}
          onDecide={decide}
          followUps={followUps}
          onConfigureAi={() => setAiSettingsOpen(true)}
        />
      }
      suggestions={
        <SuggestionList
          state={suggestions}
          canDecide={canDecide}
          onDecide={decide}
          followUps={followUps}
          onConfigureAi={() => setAiSettingsOpen(true)}
        />
      }
      update={
        canCheckIn ? <ZoneUpdate key={model.zoneId} label={model.label} indicatorIds={zone.indicatorIds} /> : undefined
      }
    />
  );
}

/** The zone-scoped form, mounted only while open so it costs nothing when collapsed. */
function ZoneUpdate({ label, indicatorIds }: { label: string; indicatorIds: readonly IndicatorId[] }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="zone-section zone-update" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Update {label.toLowerCase()} readings</summary>
      {open ? (
        <CheckInContainer indicatorIds={indicatorIds} label={`Update ${label} readings`} submitLabel="Save readings" />
      ) : null}
    </details>
  );
}
