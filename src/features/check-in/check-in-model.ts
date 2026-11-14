import type { IndicatorId, ReadingContext } from '../../core/health/model';
import type { CheckInEntry, CheckInErrors } from '../../core/use-cases/check-in';

export type NumericFieldId = 'sleepHours' | 'heartRate' | 'temperature' | 'bpSystolic' | 'bpDiastolic' | 'glucose';

export interface CheckInFormState {
  fields: Record<NumericFieldId, string>;
  /** PHQ-2 items, 0-3 each. Null = not answered. There is no item 9 and no self-harm item. */
  phq: [number | null, number | null];
  context: ReadingContext;
  symptomatic: boolean;
}

export const NUMERIC_FIELDS: readonly NumericFieldId[] = [
  'sleepHours',
  'heartRate',
  'temperature',
  'bpSystolic',
  'bpDiastolic',
  'glucose',
];

export const PHQ_QUESTIONS = ['Little interest or pleasure in doing things', 'Feeling down, depressed or hopeless'] as const;
export const PHQ_SCALE = ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'] as const;

export function emptyCheckInForm(): CheckInFormState {
  return {
    fields: { sleepHours: '', heartRate: '', temperature: '', bpSystolic: '', bpDiastolic: '', glucose: '' },
    phq: [null, null],
    context: 'rest',
    symptomatic: false,
  };
}

/** `37,2` and `37.2` both work. Anything else that is not a plain number becomes NaN, which the use case rejects. */
export function parseNumber(raw: string): number {
  const text = raw.trim().replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : Number.NaN;
}

export type BuildResult = { ok: true; entry: CheckInEntry } | { ok: false; errors: CheckInErrors };

/**
 * Turns the form into a check-in entry. Empty fields are skipped (a partial check-in is allowed), the two
 * PHQ-2 items are summed, and form-level mistakes (half a blood pressure pair, half a PHQ-2) are reported
 * inline before anything is submitted. Range checks stay in `submitCheckIn`.
 */
export function buildEntry(form: CheckInFormState, monitored: ReadonlySet<IndicatorId>): BuildResult {
  const errors: CheckInErrors = {};
  const values: Partial<Record<IndicatorId, number>> = {};

  for (const id of NUMERIC_FIELDS) {
    if (!monitored.has(id)) continue;
    const raw = form.fields[id];
    if (raw.trim() !== '') values[id] = parseNumber(raw);
  }

  const hasSys = form.fields.bpSystolic.trim() !== '';
  const hasDia = form.fields.bpDiastolic.trim() !== '';
  if (hasSys !== hasDia) {
    errors[hasSys ? 'bpDiastolic' : 'bpSystolic'] = 'Enter both blood pressure values, or leave both empty.';
  }

  const [a, b] = form.phq;
  if ((a === null) !== (b === null)) {
    errors.phq2 = 'Answer both questions, or leave both empty.';
  } else if (a !== null && b !== null && monitored.has('phq2')) {
    values.phq2 = a + b;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    entry: { values, context: form.context, symptomatic: form.symptomatic },
  };
}
