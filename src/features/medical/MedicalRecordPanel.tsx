import { Panel } from '../../ui/Panel';
import { Badge } from '../../ui/Badge';
import type { MedicalRecordView } from '../../core/use-cases/medical';
import { SEVERITY_LABEL, formatInstant } from './medical-labels';

/** One astronaut's allergies and the medications given to them. Read-only and presentational. */
export function MedicalRecordPanel({ record }: { record: MedicalRecordView }) {
  return (
    <>
      <Panel id="crew-allergies" title="Allergies" hint="Check these before giving any medication.">
        {record.allergies.length === 0 ? (
          <p className="empty">No allergies recorded.</p>
        ) : (
          <ul className="item-list" aria-label="Allergies">
            {record.allergies.map((a) => (
              <li key={a.id} className="item" data-severity={a.severity}>
                <span className="item__head">
                  <strong>{a.substance}</strong>
                  <Badge variant={a.severity === 'severe' ? 'solid' : 'outline'}>{SEVERITY_LABEL[a.severity]}</Badge>
                </span>
                <span className="item__meta">Reaction: {a.reaction}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel id="crew-medications" title="Medications administered" hint="Newest first.">
        {record.administrations.length === 0 ? (
          <p className="empty">No medications administered yet.</p>
        ) : (
          <ul className="item-list" aria-label="Administered medications">
            {record.administrations.map((a) => (
              <li key={a.id} className="item">
                <span className="item__head">
                  <strong>{a.medicationName}</strong>
                  <span>{a.dose}</span>
                </span>
                <span className="item__meta">
                  {formatInstant(a.administeredAt)} · by {a.administeredBy}
                </span>
                {a.notes ? <span className="item__meta">{a.notes}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
