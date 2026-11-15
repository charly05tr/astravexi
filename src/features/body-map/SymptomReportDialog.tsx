import { Activity, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useUi } from '../../app/ui-state';
import type { ZoneId } from '../../core/health/model';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import {
  ZONE_SYMPTOMS,
  hasZoneSymptoms,
} from './symptom-model';

export interface SymptomTriggerProps {
  zoneId: ZoneId;
  zoneLabel: string;
}

const DISCOMFORT_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/**
 * Anatomical symptom trigger and readable summary card positioned directly above Recommended change
 * so crew immediately connect reported symptoms with the LLM-simulated recommendation below.
 */
export function SymptomReportAction({ zoneId, zoneLabel }: SymptomTriggerProps) {
  const [open, setOpen] = useState(false);
  const { symptomReports, toggleSymptomTag, setZoneDiscomfort, clearZoneSymptoms } = useUi();

  const report = symptomReports[zoneId];
  const options = ZONE_SYMPTOMS[zoneId];
  const active = hasZoneSymptoms(report);
  const selectedLabels = report.tags
    .map((id) => options.find((o) => o.id === id)?.label)
    .filter((v): v is string => Boolean(v));

  return (
    <div className="symptom-action" data-testid="anatomical-symptom-report">
      {!active ? (
        <button
          type="button"
          className="button button--small zone-panel__more"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          <Activity size={15} aria-hidden="true" />
          Report symptom
        </button>
      ) : (
        <section className="symptom-card" aria-label="Reported symptom">
          <div className="symptom-card__head">
            <p className="eyebrow symptom-card__eyebrow">
              <Activity size={13} aria-hidden="true" />
              Reported symptom
            </p>
            <button
              type="button"
              className="button button--small symptom-card__edit"
              aria-haspopup="dialog"
              aria-label="Edit symptom"
              onClick={() => setOpen(true)}
            >
              <Pencil size={12} aria-hidden="true" />
              Edit
            </button>
          </div>

          <div className="symptom-card__tags">
            {selectedLabels.length > 0 ? (
              selectedLabels.map((label) => (
                <span key={label} className="symptom-pill">
                  {label}
                </span>
              ))
            ) : (
              <span className="symptom-pill">Localized discomfort</span>
            )}
          </div>

          {report.discomfort > 0 ? (
            <div className="symptom-card__meter" aria-label={`Discomfort ${report.discomfort} out of 10`}>
              <span className="symptom-card__meter-label">
                Discomfort <strong className="mono">{report.discomfort}/10</strong>
              </span>
              <span className="symptom-meter__dots" aria-hidden="true">
                {DISCOMFORT_LEVELS.map((step) => (
                  <span
                    key={step}
                    className={
                      step <= report.discomfort
                        ? 'symptom-meter__dot symptom-meter__dot--filled'
                        : 'symptom-meter__dot'
                    }
                  />
                ))}
              </span>
            </div>
          ) : null}
        </section>
      )}

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
