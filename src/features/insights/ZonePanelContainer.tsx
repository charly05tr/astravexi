import { useMemo, useState } from 'react';
import type { IndicatorId } from '../../core/health/model';
import { useAppActions, useAppContext, useAppState } from '../../app/app-context';
import { useUi } from '../../app/ui-state';
import type { SuggestionContext } from '../../core/ports';
import { EmptyState } from '../../ui/Panel';
import { CheckInContainer } from '../check-in/CheckInContainer';
import { buildSymptomLlmSuggestions } from '../body-map/symptom-advisor';
import { hasZoneSymptoms } from '../body-map/symptom-model';
import { SymptomReportAction } from '../body-map/SymptomReportDialog';
import { ZoneBenchmarkSection, ZoneEnvironmentCard } from '../environment/EnvironmentDialog';
import { evaluateZoneEnvironment } from '../environment/environment-model';
import { RoleZoneBanner } from '../readiness/ReadinessPanel';
import { SuggestionList } from '../suggestions/SuggestionList';
import { useSuggestions } from '../suggestions/use-suggestions';
import type { SuggestionsState } from '../suggestions/use-suggestions';
import { ZonePanel } from './ZonePanel';
import { useZones } from './use-zones';
import { buildZonePanelModel } from './zone-panel-model';

export function ZonePanelContainer() {
  const { knowledge, content } = useAppContext();
  const { symptomReports, environment } = useUi();
  const session = useAppState((s) => s.session);
  const mode = useAppState((s) => s.mode);
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

  const symptomReport = model ? symptomReports[model.zoneId] : undefined;
  const envAssessment = useMemo(() => {
    if (!model || !session) return null;
    return evaluateZoneEnvironment({
      zoneId: model.zoneId,
      zoneStatus: model.status,
      findingsCount: model.findings.length,
      hasSymptoms: symptomReport ? hasZoneSymptoms(symptomReport) : false,
      missionDay: session.evaluation.asOf.day,
      config: environment,
    });
  }, [model, session, symptomReport, environment]);

  const llmSymptomSuggestions = useMemo(() => {
    if (!model || !session || !symptomReport) return [];
    return buildSymptomLlmSuggestions({
      model,
      symptomReport,
      missionDay: session.evaluation.asOf.day,
      decisions: session.decisions,
      environment,
    });
  }, [model, session, symptomReport, environment]);

  const effectiveSuggestions = useMemo<SuggestionsState>(() => {
    if (llmSymptomSuggestions.length === 0) return suggestions;
    if (suggestions.status === 'error') {
      return { status: 'error', items: [...llmSymptomSuggestions, ...suggestions.items], message: suggestions.message };
    }
    return { status: 'ready', items: [...llmSymptomSuggestions, ...suggestions.items] };
  }, [suggestions, llmSymptomSuggestions]);

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
          state={effectiveSuggestions}
          onDecide={(s, decision) =>
            actions.decideRecommendation({ recommendationId: s.id, findingKey: s.findingKey, decision })
          }
        />
      }
      suggestions={
        <SuggestionList
          state={effectiveSuggestions}
          onDecide={(s, decision) =>
            actions.decideRecommendation({ recommendationId: s.id, findingKey: s.findingKey, decision })
          }
        />
      }
      update={
        <ZoneUpdate key={model.zoneId} label={model.label} indicatorIds={zone.indicatorIds} />
      }
      symptomAction={<SymptomReportAction zoneId={model.zoneId} zoneLabel={model.label} />}
      envContext={envAssessment ? <ZoneEnvironmentCard assessment={envAssessment} /> : null}
      envBenchmark={envAssessment ? <ZoneBenchmarkSection assessment={envAssessment} /> : null}
      roleBanner={<RoleZoneBanner />}
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
