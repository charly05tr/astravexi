import type { AsOf, Indicator, IndicatorId, MissionDay, MissionMinute, Reading, ReadingSource } from './model';

export interface DailyValue {
  day: MissionDay;
  /** Stored units. */
  value: number;
  readingId: string;
  groupId: string;
  source: ReadingSource;
  t: MissionMinute;
}

export function compareReadings(a: Reading, b: Reading): number {
  if (a.day !== b.day) return a.day - b.day;
  if (a.t !== b.t) return a.t - b.t;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Sort by (day, t, id) and drop readings after the as-of instant. Does not mutate the input. */
export function prepareReadings(readings: readonly Reading[], asOf: AsOf): Reading[] {
  return readings
    .filter((r) => r.day < asOf.day || (r.day === asOf.day && r.t <= asOf.t))
    .sort(compareReadings);
}

/** MANUAL ranks above SYNTHETIC; then the latest t; then the id. Returns true when `a` beats `b`. */
function beats(a: Reading, b: Reading): boolean {
  if (a.source !== b.source) return a.source === 'MANUAL';
  if (a.t !== b.t) return a.t > b.t;
  return a.id > b.id;
}

/**
 * Daily series per indicator: one value per mission day taken from that day's resting readings.
 * Exercise readings of context-aware indicators never enter the series. Nothing is overwritten:
 * the input readings stay untouched, only the series picks a winner.
 */
export function buildDailySeries(
  readings: readonly Reading[],
  indicators: readonly Indicator[],
): Map<IndicatorId, DailyValue[]> {
  const byId = new Map(indicators.map((i) => [i.id, i]));
  const winners = new Map<IndicatorId, Map<MissionDay, Reading>>();
  for (const ind of indicators) winners.set(ind.id, new Map());
  for (const r of readings) {
    const ind = byId.get(r.indicatorId);
    if (!ind) continue;
    if (ind.contextAware && r.context !== 'rest') continue;
    const days = winners.get(r.indicatorId)!;
    const current = days.get(r.day);
    if (!current || beats(r, current)) days.set(r.day, r);
  }
  const out = new Map<IndicatorId, DailyValue[]>();
  for (const [id, days] of winners) {
    const values = [...days.values()]
      .sort((a, b) => a.day - b.day)
      .map<DailyValue>((r) => ({
        day: r.day,
        value: r.value,
        readingId: r.id,
        groupId: r.groupId,
        source: r.source,
        t: r.t,
      }));
    out.set(id, values);
  }
  return out;
}

/** Daily values with day in [fromDay, toDay], ascending. */
export function valuesInRange(series: readonly DailyValue[], fromDay: MissionDay, toDay: MissionDay): DailyValue[] {
  return series.filter((v) => v.day >= fromDay && v.day <= toDay);
}
