import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { MAX_TEXT_LENGTH, MEDICATION_CATEGORIES } from '../../core/medical/model';
import type { Medication, MedicationCategory, MedicationErrors, MedicationInput } from '../../core/medical/model';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { CATEGORY_LABEL } from './medical-labels';

interface FormValues {
  name: string;
  form: string;
  strength: string;
  category: MedicationCategory;
  quantity: string;
  unit: string;
  minStock: string;
  expiresOn: string;
}

const EMPTY: FormValues = { name: '', form: '', strength: '', category: 'other', quantity: '', unit: '', minStock: '', expiresOn: '' };

const fromMedication = (m: Medication): FormValues => ({
  name: m.name,
  form: m.form,
  strength: m.strength,
  category: m.category,
  quantity: String(m.quantity),
  unit: m.unit,
  minStock: String(m.minStock),
  expiresOn: m.expiresOn,
});

/** An empty field is NaN, so the core reports it instead of silently reading it as 0. */
const toCount = (text: string): number => (text.trim() === '' ? Number.NaN : Number(text));

const toInput = (v: FormValues): MedicationInput => ({
  ...v,
  quantity: toCount(v.quantity),
  minStock: toCount(v.minStock),
});

/** Add or edit one medication. Presentational: `onSubmit` returns the field errors, or null once it was saved. */
export function MedicationDialog({
  medication,
  onSubmit,
  onClose,
}: {
  /** The line being edited, or null to add a new one. */
  medication: Medication | null;
  onSubmit(input: MedicationInput): Promise<MedicationErrors | null>;
  onClose(): void;
}) {
  const uid = useId();
  const [values, setValues] = useState<FormValues>(medication ? fromMedication(medication) : EMPTY);
  const [errors, setErrors] = useState<MedicationErrors>({});
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<FormValues>) => setValues((v) => ({ ...v, ...patch }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const result = await onSubmit(toInput(values));
    setBusy(false);
    if (result) setErrors(result);
  };

  const field = (key: keyof FormValues, label: string, type: 'text' | 'number' | 'date' = 'text') => (
    <div className="field">
      <label className="field__label" htmlFor={`${uid}-${key}`}>
        {label}
      </label>
      <input
        id={`${uid}-${key}`}
        className="input"
        type={type}
        autoComplete="off"
        {...(type === 'number' ? { min: 0, step: 1, inputMode: 'numeric' as const } : { maxLength: MAX_TEXT_LENGTH })}
        value={values[key]}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={errors[key] ? `${uid}-${key}-error` : undefined}
        onChange={(e) => set({ [key]: e.target.value })}
      />
      {errors[key] ? (
        <p className="field__error" id={`${uid}-${key}-error`} role="alert">
          {errors[key]}
        </p>
      ) : null}
    </div>
  );

  return (
    <Dialog title={medication ? 'Edit medication' : 'Add medication'} closeLabel="Close medication form" onClose={onClose} style={{ width: 'min(560px, 92vw)' }}>
      <form className="form" onSubmit={(e) => void submit(e)} noValidate aria-label={medication ? 'Edit medication' : 'Add medication'}>
        {field('name', 'Name')}
        <div className="field__row">
          <div style={{ flex: 1 }}>{field('form', 'Dosage form')}</div>
          <div style={{ flex: 1 }}>{field('strength', 'Strength')}</div>
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${uid}-category`}>
            Category
          </label>
          <select
            id={`${uid}-category`}
            className="input"
            value={values.category}
            onChange={(e) => set({ category: e.target.value as MedicationCategory })}
          >
            {MEDICATION_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="field__row">
          <div style={{ flex: 1 }}>{field('quantity', 'Quantity', 'number')}</div>
          <div style={{ flex: 1 }}>{field('unit', 'Unit')}</div>
          <div style={{ flex: 1 }}>{field('minStock', 'Minimum stock', 'number')}</div>
        </div>
        {field('expiresOn', 'Expiration date', 'date')}
        <div className="proposal__actions">
          <Button type="submit" variant="primary" disabled={busy}>
            {medication ? 'Save changes' : 'Add medication'}
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Dialog>
  );
}
