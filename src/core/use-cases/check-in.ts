import type { LinkState } from '../escalation/link';
import type { IndicatorId, Reading, ReadingContext } from '../health/model';
import { toStored } from '../health/rounding';
import { type Deps, type Session, currentAsOf, refresh } from './session';

export interface CheckInEntry {
  /** Display units (37.7 for temperature, 6.5 for sleep, PHQ-2 as the 0-6 total). Omitted fields are skipped. */
  values: Partial<Record<IndicatorId, number>>;
  /** Applies to temperature, heart rate and blood pressure. Default rest. */
  context?: ReadingContext;
  /** Applies to temperature and heart rate. Default false. */
  symptomatic?: boolean;
}

/** Error map keyed by indicator id, or `form` for a problem with the entry as a whole. */
export type CheckInErrors = Partial<Record<IndicatorId | 'form', string>>;

export type CheckInResult =
  | { ok: true; session: Session; groupId: string }
  | { ok: false; errors: CheckInErrors };

const SYMPTOM_INDICATORS: readonly IndicatorId[] = ['temperature', 'heartRate'];

/**
 * Validate (R1.5), store as MANUAL readings of one check-in group on the current mission day, and
 * re-evaluate. Invalid input is rejected whole: nothing is saved.
 */
export async function submitCheckIn(
  deps: Deps,
  session: Session,
  entry: CheckInEntry,
  link: LinkState,
): Promise<CheckInResult> {
  const errors: CheckInErrors = {};
  const accepted: Array<{ id: IndicatorId; stored: number }> = [];
  for (const [key, value] of Object.entries(entry.values)) {
    const id = key as IndicatorId;
    const indicator = deps.knowledge.indicators.find((i) => i.id === id);
    if (value === undefined) continue;
    if (!indicator) {
      errors[id] = 'This indicator is not monitored.';
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors[id] = 'Enter a number.';
    } else if (value < indicator.min || value > indicator.max) {
      errors[id] = `Enter a value between ${indicator.min} and ${indicator.max} ${indicator.unit}.`;
    } else {
      accepted.push({ id, stored: toStored(value, indicator.unitScale) });
    }
  }
  if (Object.keys(errors).length === 0 && accepted.length === 0) errors.form = 'Enter at least one value.';
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const { day, t } = currentAsOf(deps.clock);
  const known = new Set(session.manual.map((r) => r.groupId));
  const base = `ci:${t}`;
  let groupId = base;
  for (let n = 2; known.has(groupId); n += 1) groupId = `${base}-${n}`;

  const readings: Reading[] = accepted.map(({ id, stored }) => {
    const indicator = deps.knowledge.indicators.find((i) => i.id === id)!;
    return {
      id: `${groupId}:${id}`,
      indicatorId: id,
      value: stored,
      day,
      t,
      source: 'MANUAL',
      context: indicator.contextAware ? (entry.context ?? 'rest') : 'rest',
      symptomatic: SYMPTOM_INDICATORS.includes(id) ? (entry.symptomatic ?? false) : false,
      groupId,
    };
  });

  await deps.store.addReadings(readings);
  const next = await refresh(deps, { ...session, manual: [...session.manual, ...readings] }, link);
  return { ok: true, session: next, groupId };
}
