import { AlertTriangle, CheckCircle2, OctagonAlert, Stethoscope } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAppContext, useAppState } from '../../app/app-context';
import { useUi } from '../../app/ui-state';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { tierStyle } from '../../ui/TierChip';
import { tierTheme } from '../../theme/tiers';
import {
  buildCmoOperationalBrief,
  evaluateMissionReadiness,
} from './readiness-model';
import type { ActivityClearance, ReadinessAssessment, ReadinessLevel } from './readiness-model';

function ReadinessIcon({ level, size = 14 }: { level: ReadinessLevel; size?: number }) {
  if (level === 'red') return <OctagonAlert size={size} aria-hidden="true" />;
  if (level === 'yellow') return <AlertTriangle size={size} aria-hidden="true" />;
  return <CheckCircle2 size={size} aria-hidden="true" />;
}

function ClearanceIcon({ clearance }: { clearance: ActivityClearance }) {
  if (clearance === 'hold') return <OctagonAlert size={14} aria-hidden="true" />;
  if (clearance === 'mitigate') return <AlertTriangle size={14} aria-hidden="true" />;
  return <CheckCircle2 size={14} aria-hidden="true" />;
}

function useReadiness() {
  const { knowledge } = useAppContext();
  const evaluation = useAppState((s) => s.session?.evaluation ?? null);
  const { environment, symptomReports, setView } = useUi();

  const assessment = useMemo<ReadinessAssessment | null>(() => {
    if (!evaluation) return null;
    return evaluateMissionReadiness({ evaluation, environment, symptomReports });
  }, [evaluation, environment, symptomReports]);

  const cmoBrief = useMemo(() => {
    if (!evaluation) return null;
    const labels = new Map(knowledge.zones.map((z) => [z.id, z.label]));
    return buildCmoOperationalBrief(evaluation, knowledge.indicators, labels);
  }, [evaluation, knowledge]);

  return { assessment, cmoBrief, setView };
}

/**
 * Modal translation dialog showing the 3-level high-contrast semaphore (Green/Yellow/Red),
 * activity clearances (EVA, Robotics, Exercise, Maintenance), CMO escalation link, and safety disclaimer.
 */
export function ReadinessDialog({
  assessment,
  pendingAckCount,
  onOpenComms,
  onClose,
}: {
  assessment: ReadinessAssessment;
  pendingAckCount: number;
  onOpenComms(): void;
  onClose(): void;
}) {
  const theme = tierTheme(assessment.statusEquivalent);

  return (
    <Dialog
      eyebrow="Module 3 · Mission readiness"
      title="Operational readiness & translation"
      closeLabel="Close mission readiness"
      aside={
        <span className="tier-chip" style={tierStyle(assessment.statusEquivalent)}>
          <ReadinessIcon level={assessment.level} size={13} />
          {assessment.shortLabel}
        </span>
      }
      onClose={onClose}
      style={{ width: 'min(620px, 94vw)' }}
    >
      <div className="stack" style={{ gap: 16 }} data-testid="readiness-dialog">
        <section className="readiness-hero" style={tierStyle(assessment.statusEquivalent)}>
          <div className="readiness-hero__head">
            <span className="readiness-hero__badge">
              <ReadinessIcon level={assessment.level} size={18} />
              <strong>{assessment.label}</strong>
            </span>
            <span className="small muted">{theme.meaning}</span>
          </div>
          <p style={{ margin: 0 }}>{assessment.summary}</p>
          {assessment.drivers.length > 0 ? (
            <ul className="readiness-drivers" aria-label="Active drivers">
              {assessment.drivers.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="stack" style={{ gap: 8 }} aria-label="Operational task translation">
          <p className="eyebrow" style={{ margin: 0 }}>
            Mission task translation
          </p>
          <div className="readiness-grid">
            {assessment.activities.map((act) => (
              <article
                key={act.id}
                className="readiness-card"
                style={tierStyle(act.statusEquivalent)}
                data-activity-id={act.id}
              >
                <div className="readiness-card__head">
                  <strong>{act.label}</strong>
                  <span className="tier-chip">
                    <ClearanceIcon clearance={act.clearance} />
                    {act.clearanceLabel}
                  </span>
                </div>
                <p className="readiness-card__text">{act.guidance}</p>
              </article>
            ))}
          </div>
        </section>

        {pendingAckCount > 0 || assessment.cautionCount > 0 ? (
          <div className="readiness-cmo-bar">
            <span className="readiness-cmo-bar__text">
              <Stethoscope size={15} aria-hidden="true" />
              {pendingAckCount > 0
                ? `${pendingAckCount} Warning acknowledgement${pendingAckCount > 1 ? 's' : ''} waiting for CMO review.`
                : `${assessment.cautionCount} Caution zone${assessment.cautionCount === 1 ? '' : 's'} queued in CMO triage.`}
            </span>
            <Button
              type="button"
              size="small"
              variant="primary"
              onClick={() => {
                onClose();
                onOpenComms();
              }}
            >
              Open CMO &amp; Outbox
            </Button>
          </div>
        ) : null}

        <p className="readiness-disclaimer">{assessment.disclaimer}</p>
      </div>
    </Dialog>
  );
}

/**
 * Compact stage pill positioned cleanly beside the Habitat pill above `.stage__hint` so crew and CMO
 * immediately see Green/Yellow/Red readiness without cluttering side cards or the single-row header.
 */
export function StageReadinessTrigger() {
  const { assessment, cmoBrief, setView } = useReadiness();
  const [open, setOpen] = useState(false);

  if (!assessment) return null;
  const pendingAck = cmoBrief?.pendingAckCount ?? 0;

  return (
    <>
      <button
        type="button"
        className="stage__readiness"
        style={tierStyle(assessment.statusEquivalent)}
        aria-haspopup="dialog"
        data-testid="readiness-trigger"
        data-readiness-level={assessment.level}
        onClick={() => setOpen(true)}
      >
        <ReadinessIcon level={assessment.level} size={13} />
        <span>
          Readiness: <strong>{assessment.shortLabel}</strong>
          {pendingAck > 0 ? ` · ${pendingAck} ack` : ''}
        </span>
      </button>
      {open ? (
        <ReadinessDialog
          assessment={assessment}
          pendingAckCount={pendingAck}
          onOpenComms={() => setView('comms')}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/** Compact single-row readiness bar at the top of Comms so status and task clearances scan in one glance. */
export function CommsReadinessOverview() {
  const { assessment, cmoBrief, setView } = useReadiness();
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (!assessment) return null;
  const pendingAck = cmoBrief?.pendingAckCount ?? 0;

  return (
    <div className="comms__full" data-testid="comms-readiness">
      <section
        className="comms-readiness-bar"
        style={tierStyle(assessment.statusEquivalent)}
        aria-label="Mission readiness overview"
      >
        <div className="comms-readiness-bar__status">
          <span className="readiness-hero__badge">
            <ReadinessIcon level={assessment.level} size={16} />
            <strong>{assessment.label}</strong>
          </span>
          <span className="small muted">{assessment.summary}</span>
        </div>

        <div className="comms-readiness-bar__tasks">
          {assessment.activities.map((act) => (
            <span key={act.id} className="comms-task-chip" style={tierStyle(act.statusEquivalent)}>
              <ClearanceIcon clearance={act.clearance} />
              <span className="comms-task-chip__name">{act.label}</span>
              <span className="comms-task-chip__state">{act.clearanceLabel}</span>
            </span>
          ))}
        </div>

        <div className="comms-readiness-bar__action">
          <Button size="small" onClick={() => setDetailsOpen(true)}>
            Task details
          </Button>
        </div>
      </section>

      {detailsOpen ? (
        <ReadinessDialog
          assessment={assessment}
          pendingAckCount={pendingAck}
          onOpenComms={() => {
            setDetailsOpen(false);
            setView('comms');
          }}
          onClose={() => setDetailsOpen(false)}
        />
      ) : null}
    </div>
  );
}
