import { BookOpen, ClipboardCheck, Stethoscope } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useUi } from '../../app/ui-state';
import type { ZoneId, ZoneStatus } from '../../core/health/model';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { tierStyle } from '../../ui/TierChip';
import { hasZoneSymptoms } from '../body-map/symptom-model';
import type { ZoneSymptomReport } from '../body-map/symptom-model';
import type { EnvironmentZoneAssessment } from '../environment/environment-model';
import { TriageInventoryCheck } from '../inventory/MedicalInventoryPanel';
import {
  ZONE_TRIAGE_QUESTIONS,
  evaluateGuidedTriage,
} from './triage-model';
import type { ReadingMode, TriageAnswer, TriageProtocolPlan } from './triage-model';

const ANSWER_OPTIONS: ReadonlyArray<{ id: TriageAnswer; label: string }> = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
  { id: 'unsure', label: 'Unsure' },
];

export interface GuidedTriageActionProps {
  zoneId: ZoneId;
  zoneLabel: string;
  status: ZoneStatus;
  symptomReport: ZoneSymptomReport;
  envAssessment: EnvironmentZoneAssessment | null;
}

function GuidedTriageDialog({
  zoneId,
  zoneLabel,
  plan,
  answers,
  onAnswer,
  onClear,
  onOpenComms,
  onClose,
}: {
  zoneId: ZoneId;
  zoneLabel: string;
  plan: TriageProtocolPlan;
  answers: Readonly<Record<string, TriageAnswer>>;
  onAnswer(questionId: string, answer: TriageAnswer): void;
  onClear(questionIds: readonly string[]): void;
  onOpenComms(): void;
  onClose(): void;
}) {
  const [readingMode, setReadingMode] = useState<ReadingMode>('easy');
  const questions = ZONE_TRIAGE_QUESTIONS[zoneId];
  const clinical = readingMode === 'clinical';

  return (
    <Dialog
      eyebrow="Module 4 · Guided local triage"
      title={`${zoneLabel} check & adaptive guide`}
      closeLabel="Close guided triage"
      aside={
        <span className="tier-chip" style={tierStyle(plan.statusEquivalent)}>
          {plan.level === 'urgent' ? 'Urgent CMO' : plan.level === 'stabilize' ? 'Stabilize' : 'Routine'}
        </span>
      }
      onClose={onClose}
      style={{ width: 'min(600px, 94vw)' }}
    >
      <div className="stack" style={{ gap: 16 }} data-testid="triage-dialog">
        <div className="triage-mode-bar">
          <span className="triage-mode-bar__label">
            <BookOpen size={14} aria-hidden="true" />
            Language mode
          </span>
          <div className="segmented" role="group" aria-label="Reading mode">
            <button
              type="button"
              aria-pressed={!clinical}
              onClick={() => setReadingMode('easy')}
            >
              Easy read
            </button>
            <button
              type="button"
              aria-pressed={clinical}
              onClick={() => setReadingMode('clinical')}
            >
              Clinical detail
            </button>
          </div>
        </div>

        <section className="stack" style={{ gap: 10 }} aria-label="Differential screening questions">
          <p className="eyebrow" style={{ margin: 0 }}>
            Quick screening ({questions.length} checks)
          </p>
          {questions.map((q) => (
            <div key={q.id} className="triage-question" data-question-id={q.id}>
              <p className="triage-question__prompt">{clinical ? q.clinicalPrompt : q.easyPrompt}</p>
              <div className="segmented triage-question__answers" role="group" aria-label={clinical ? q.clinicalPrompt : q.easyPrompt}>
                {ANSWER_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={answers[q.id] === opt.id}
                    onClick={() => onAnswer(q.id, opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section
          className="triage-protocol"
          style={tierStyle(plan.statusEquivalent)}
          data-testid="triage-protocol"
          data-protocol-level={plan.level}
        >
          <div className="triage-protocol__head">
            <strong>{plan.label}</strong>
          </div>
          <p className="triage-protocol__summary">{clinical ? plan.clinicalSummary : plan.easySummary}</p>
          <ol className="triage-protocol__steps">
            {plan.justInTimeSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        {plan.glossaryTerms.length > 0 ? (
          <section className="triage-glossary" aria-label="Adaptive explanation">
            <p className="eyebrow" style={{ margin: '0 0 6px' }}>
              {clinical ? 'Clinical reference & plain translation' : 'What this means in plain words'}
            </p>
            {plan.glossaryTerms.map((term) => (
              <div key={term.plainTerm} className="triage-glossary__item">
                <strong>{clinical ? `${term.clinicalTerm} (${term.plainTerm})` : term.plainTerm}</strong>
                <p className="muted small" style={{ margin: '2px 0 0' }}>
                  {clinical ? term.clinicalNote : term.easyExplanation}
                </p>
              </div>
            ))}
          </section>
        ) : null}

        <TriageInventoryCheck zoneId={zoneId} zoneLabel={zoneLabel} triagePlan={plan} />

        <div className="form-actions">
          <Button type="button" variant="primary" onClick={onClose}>
            Done
          </Button>
          {plan.level === 'urgent' ? (
            <Button
              type="button"
              onClick={() => {
                onClose();
                onOpenComms();
              }}
            >
              <Stethoscope size={14} aria-hidden="true" />
              Escalate to CMO in Comms
            </Button>
          ) : null}
          {questions.some((q) => answers[q.id] !== undefined) ? (
            <Button type="button" onClick={() => onClear(questions.map((q) => q.id))}>
              Reset answers
            </Button>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Compact trigger strip rendered in ZonePanel when a zone has active alerts, symptoms, or environmental strain.
 * Keeps summary cards clean while unlocking interactive Yes/No differential triage and Easy/Clinical reading modes.
 */
export function GuidedTriageAction({
  zoneId,
  zoneLabel,
  status,
  symptomReport,
  envAssessment,
}: GuidedTriageActionProps) {
  const { triageAnswers, setTriageAnswer, clearTriageAnswers, setView } = useUi();
  const [open, setOpen] = useState(false);

  const hasAlert = status === 'notice' || status === 'caution' || status === 'warning';
  const hasSymptoms = hasZoneSymptoms(symptomReport);
  const hasEnvStrain = envAssessment?.attribution === 'environmental' || envAssessment?.attribution === 'mixed';
  const active = hasAlert || hasSymptoms || hasEnvStrain;

  const plan = useMemo(
    () =>
      evaluateGuidedTriage({
        zoneId,
        zoneStatus: status,
        symptomReport,
        envAssessment,
        answers: triageAnswers,
      }),
    [zoneId, status, symptomReport, envAssessment, triageAnswers],
  );

  if (!active) return null;

  return (
    <div className="triage-action" data-testid="guided-triage-action">
      <button
        type="button"
        className="button button--small zone-panel__more"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <ClipboardCheck size={15} aria-hidden="true" />
        Guided triage
        <span className="triage-action__pill" style={tierStyle(plan.statusEquivalent)}>
          {plan.level === 'urgent' ? 'Urgent CMO' : plan.level === 'stabilize' ? 'Stabilize' : 'Routine'}
        </span>
      </button>

      {open ? (
        <GuidedTriageDialog
          zoneId={zoneId}
          zoneLabel={zoneLabel}
          plan={plan}
          answers={triageAnswers}
          onAnswer={setTriageAnswer}
          onClear={clearTriageAnswers}
          onOpenComms={() => setView('comms')}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
