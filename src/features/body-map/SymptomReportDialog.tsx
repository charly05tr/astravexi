import { Activity } from 'lucide-react';
import { useState } from 'react';
import { useUi } from '../../app/ui-state';
import type { ZoneId } from '../../core/health/model';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import {
  ZONE_SYMPTOMS,
  formatSymptomSummary,
  hasZoneSymptoms,
} from './symptom-model';

export interface SymptomTriggerProps {
  zoneId: ZoneId;
  zoneLabel: string;
}

/**
 * Minimal anatomical symptom trigger and modal dialog.
 * Keeps the main zone summary card uncluttered while letting crew tap symptoms directly after clicking a 3D organ.
 */
export function SymptomReportAction({ zoneId, zoneLabel }: SymptomTriggerProps) {
  const [open, setOpen] = useState(false);
  const { symptomReports, toggleSymptomTag, setZoneDiscomfort, clearZoneSymptoms } = useUi();

  const report = symptomReports[zoneId];
  const options = ZONE_SYMPTOMS[zoneId];
  const active = hasZoneSymptoms(report);
  const summary = formatSymptomSummary(report);

  return (
    <div className="symptom-action" data-testid="anatomical-symptom-report">
      {summary ? <p className="symptom-action__summary">{summary}</p> : null}
      <button
        type="button"
        className="button button--small zone-panel__more"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Activity size={15} aria-hidden="true" />
        {active ? 'Edit symptom' : 'Report symptom'}
      </button>

      {open ? (
        <Dialog
          eyebrow="Anatomical quick-report"
          title={`${zoneLabel} symptoms`}
          closeLabel="Close symptom report"
          onClose={() => setOpen(false)}
          style={{ width: 'min(520px, 92vw)' }}
        >
          <div className="stack" style={{ gap: 16 }}>
            <p className="muted small">
              Tap what you feel in this area. Your selections feed local guided triage without long forms.
            </p>

            <div className="symptom-grid" role="group" aria-label={`Symptoms for ${zoneLabel}`}>
              {options.map((opt) => {
                const pressed = report.tags.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className="symptom-chip"
                    aria-pressed={pressed}
                    onClick={() => toggleSymptomTag(zoneId, opt.id)}
                  >
                    <span className="symptom-chip__label">{opt.label}</span>
                    <span className="symptom-chip__hint">{opt.hint}</span>
                  </button>
                );
              })}
            </div>

            <div className="field">
              <label className="field__label" htmlFor={`discomfort-${zoneId}`}>
                Discomfort level: <span className="mono">{report.discomfort}/10</span>
              </label>
              <input
                id={`discomfort-${zoneId}`}
                className="slider"
                type="range"
                min={0}
                max={10}
                step={1}
                value={report.discomfort}
                aria-valuetext={`${report.discomfort} out of 10 discomfort`}
                onChange={(e) => setZoneDiscomfort(zoneId, Number(e.target.value))}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <Button
                size="small"
                disabled={!active}
                onClick={() => clearZoneSymptoms(zoneId)}
              >
                Clear
              </Button>
              <Button size="small" variant="primary" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
