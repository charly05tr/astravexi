import { WarningCircle } from '@phosphor-icons/react';
import { useId } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { Indicator, IndicatorId, ReadingContext } from '../../core/health/model';
import type { CheckInErrors } from '../../core/use-cases/check-in';
import { Button } from '../../ui/Button';
import { PHQ_QUESTIONS, PHQ_SCALE } from './check-in-model';
import type { CheckInFormState, NumericFieldId } from './check-in-model';

export interface CheckInFormProps {
  form: CheckInFormState;
  errors: CheckInErrors;
  /** Indicators that are monitored. Glucose is absent when its flag is off, and its field disappears. */
  indicators: ReadonlyMap<IndicatorId, Indicator>;
  submitting: boolean;
  /** Result line after a save, e.g. "Saved as MANUAL." */
  message: string | null;
  onField(id: NumericFieldId, value: string): void;
  onPhq(index: 0 | 1, value: number): void;
  onContext(context: ReadingContext): void;
  onSymptomatic(value: boolean): void;
  onSubmit(): void;
  /** Accessible name of the form. Defaults to "Daily check-in". */
  label?: string;
  submitLabel?: string;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p className="field__error" id={id} role="alert">
      <WarningCircle size={16} weight="bold" aria-hidden="true" />
      {message}
    </p>
  );
}

function NumberField({
  prefix,
  id,
  label,
  unit,
  hint,
  value,
  error,
  placeholder,
  onChange,
}: {
  prefix: string;
  id: IndicatorId;
  label: string;
  unit: string;
  hint: string;
  value: string;
  error?: string;
  placeholder?: string;
  onChange(value: string): void;
}) {
  const inputId = `${prefix}${id}`;
  return (
    <div className="field">
      <label className="field__label" htmlFor={inputId}>
        {label} <span className="muted">({unit})</span>
      </label>
      <input
        id={inputId}
        className="input"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${inputId}-hint${error ? ` ${inputId}-error` : ''}`}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="field__hint" id={`${inputId}-hint`}>
        {hint}
      </p>
      <FieldError id={`${inputId}-error`} message={error} />
    </div>
  );
}

function Segmented({ name, legend, children }: { name: string; legend: string; children: ReactNode }) {
  return (
    <fieldset className="fieldset" data-name={name}>
      <legend>{legend}</legend>
      {children}
    </fieldset>
  );
}

/** Daily check-in. Presentational: state and submission live in CheckInContainer. */
export function CheckInForm(props: CheckInFormProps) {
  const { form, errors, indicators, submitting, message } = props;
  const pre = `ci${useId().replace(/[^a-zA-Z0-9]/g, '')}-`;
  const ind = (id: IndicatorId) => indicators.get(id);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    props.onSubmit();
  };
  const field = (id: NumericFieldId, placeholder?: string) => {
    const i = ind(id);
    if (!i) return null; // not monitored (glucose flag off)
    return (
      <NumberField
        key={id}
        prefix={pre}
        id={id}
        label={i.label}
        unit={i.unit}
        hint={i.howToMeasure}
        value={form.fields[id]}
        error={errors[id]}
        placeholder={placeholder}
        onChange={(v) => props.onField(id, v)}
      />
    );
  };
  const phq = ind('phq2');
  const hasBp = Boolean(ind('bpSystolic') || ind('bpDiastolic'));
  const hasContext = Boolean(ind('heartRate') || ind('temperature') || hasBp);

  return (
    <form className="form" onSubmit={submit} noValidate aria-label={props.label ?? 'Daily check-in'}>
      {field('sleepHours', 'e.g. 6.5')}

      {phq ? (
        <Segmented name="phq2" legend="Mood (PHQ-2): how often in the last 2 weeks have you been bothered by...">
          {PHQ_QUESTIONS.map((question, index) => (
            <div className="field" key={question}>
              <span className="field__label" id={`${pre}phq-${index}`}>
                {question}
              </span>
              <div className="segmented" role="radiogroup" aria-labelledby={`${pre}phq-${index}`}>
                {PHQ_SCALE.map((scale, value) => (
                  <label key={scale}>
                    <input
                      type="radio"
                      name={`${pre}phq-${index}`}
                      checked={form.phq[index as 0 | 1] === value}
                      aria-label={`${question}: ${value}, ${scale}`}
                      onChange={() => props.onPhq(index as 0 | 1, value)}
                    />
                    {value}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <p className="field__hint">0 Not at all, 1 Several days, 2 More than half the days, 3 Nearly every day. Only the tier of this score ever leaves your device.</p>
          <FieldError id={`${pre}phq2-error`} message={errors.phq2} />
        </Segmented>
      ) : null}

      {field('heartRate', 'e.g. 62')}
      {field('temperature', 'e.g. 37.7')}

      {hasBp ? (
        <fieldset className="fieldset">
          <legend>Blood pressure</legend>
          <div className="field__row">
            <div style={{ flex: 1 }}>{field('bpSystolic', 'Top number')}</div>
            <div style={{ flex: 1 }}>{field('bpDiastolic', 'Bottom number')}</div>
          </div>
        </fieldset>
      ) : null}

      {field('glucose', 'e.g. 90')}

      {hasContext ? (
      <fieldset className="fieldset">
        <legend>Heart rate, temperature and blood pressure were measured</legend>
        <div className="segmented" role="radiogroup" aria-label="Measured at rest or after exercise">
          <label>
            <input
              type="radio"
              name={`${pre}context`}
              checked={form.context === 'rest'}
              onChange={() => props.onContext('rest')}
            />
            At rest
          </label>
          <label>
            <input
              type="radio"
              name={`${pre}context`}
              checked={form.context === 'exercise'}
              onChange={() => props.onContext('exercise')}
            />
            After exercise
          </label>
        </div>
        <p className="field__hint">After-exercise readings are saved and shown, but they do not feed temperature or heart-rate alerts or baselines.</p>
        <label className="toggle">
          <input
            type="checkbox"
            role="switch"
            checked={form.symptomatic}
            onChange={(e) => props.onSymptomatic(e.target.checked)}
          />
          Symptoms now
        </label>
        <p className="field__hint">Applies to temperature and heart rate. Examples: chills, palpitations, dizziness, chest discomfort.</p>
      </fieldset>
      ) : null}

      <FieldError id={`${pre}form-error`} message={errors.form} />
      <Button type="submit" variant="primary" disabled={submitting}>
        {props.submitLabel ?? 'Save check-in'}
      </Button>
      <p className="status-line" role="status">
        {message}
      </p>
    </form>
  );
}
