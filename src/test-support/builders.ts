import type {
  Acknowledgement,
  AsOf,
  IndicatorId,
  MissionDay,
  Reading,
  ReadingContext,
  ReadingSource,
  ZoneId,
} from '../core/health/model';

const SCALE: Record<IndicatorId, number> = {
  sleepHours: 10,
  phq2: 1,
  heartRate: 1,
  temperature: 10,
  bpSystolic: 1,
  bpDiastolic: 1,
  glucose: 1,
};

export interface ReadingOpts {
  context?: ReadingContext;
  symptomatic?: boolean;
  source?: ReadingSource;
  /** Minute within the day (0-1439). Default 07:00. */
  minute?: number;
  groupId?: string;
  id?: string;
}

/** Build a reading from a DISPLAY value (37.7 for temperature, 6.5 for sleep). */
export function reading(
  indicatorId: IndicatorId,
  display: number,
  day: MissionDay,
  opts: ReadingOpts = {},
): Reading {
  const source = opts.source ?? 'MANUAL';
  const context = opts.context ?? 'rest';
  const minute = opts.minute ?? 420;
  const t = (day - 1) * 1440 + minute;
  return {
    id: opts.id ?? `${indicatorId}:${day}:${source}:${context}:${minute}`,
    indicatorId,
    value: Math.round(display * SCALE[indicatorId]),
    day,
    t,
    source,
    context,
    symptomatic: opts.symptomatic ?? false,
    groupId: opts.groupId ?? `g:${day}:${minute}`,
  };
}

/** One resting reading per day from `fromDay`; `values` are display units, one per day. */
export function daily(
  indicatorId: IndicatorId,
  values: readonly number[],
  fromDay: MissionDay,
  opts: ReadingOpts = {},
): Reading[] {
  return values.map((v, i) => reading(indicatorId, v, fromDay + i, opts));
}

/** The same display value on every day in [fromDay, toDay]. */
export function steady(
  indicatorId: IndicatorId,
  value: number,
  fromDay: MissionDay,
  toDay: MissionDay,
  opts: ReadingOpts = {},
): Reading[] {
  return daily(indicatorId, Array.from({ length: toDay - fromDay + 1 }, () => value), fromDay, opts);
}

/** End of a mission day: every reading of that day is already in. */
export function endOfDay(day: MissionDay): AsOf {
  return { day, t: day * 1440 - 1 };
}

export function ack(zoneId: ZoneId, groupId: string, t = 0): Acknowledgement {
  return { id: `ack:${zoneId}:${groupId}`, zoneId, groupId, by: 'cmo', t };
}
