import { useMemo, useState } from 'react';
import { useAppActions, useAppContext } from '../../app/app-context';
import type { IndicatorId, ReadingContext } from '../../core/health/model';
import type { CheckInErrors } from '../../core/use-cases/check-in';
import { CheckInForm } from './CheckInForm';
import { buildEntry, emptyCheckInForm } from './check-in-model';
import type { CheckInFormState, NumericFieldId } from './check-in-model';

export function CheckInContainer() {
  const { knowledge } = useAppContext();
  const actions = useAppActions();
  const [form, setForm] = useState<CheckInFormState>(emptyCheckInForm);
  const [errors, setErrors] = useState<CheckInErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const indicators = useMemo(() => new Map(knowledge.indicators.map((i) => [i.id, i])), [knowledge]);
  const monitored = useMemo(() => new Set<IndicatorId>(indicators.keys()), [indicators]);

  const submit = async () => {
    setMessage(null);
    const built = buildEntry(form, monitored);
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    setSubmitting(true);
    try {
      const result = await actions.submitCheckIn(built.entry);
      if (result.ok) {
        setErrors({});
        setForm(emptyCheckInForm());
        setMessage('Saved as MANUAL. Alerts are updated.');
      } else {
        setErrors(result.errors);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CheckInForm
      form={form}
      errors={errors}
      indicators={indicators}
      submitting={submitting}
      message={message}
      onField={(id: NumericFieldId, value) => setForm((f) => ({ ...f, fields: { ...f.fields, [id]: value } }))}
      onPhq={(index, value) =>
        setForm((f) => {
          const phq: CheckInFormState['phq'] = [...f.phq];
          phq[index] = value;
          return { ...f, phq };
        })
      }
      onContext={(context: ReadingContext) => setForm((f) => ({ ...f, context }))}
      onSymptomatic={(symptomatic) => setForm((f) => ({ ...f, symptomatic }))}
      onSubmit={() => void submit()}
    />
  );
}
