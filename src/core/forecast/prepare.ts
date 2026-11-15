import { parseIso } from '../sync/time';
import { SLOT_MIN } from './types';
import type { ForecastVariable, Segment } from './types';

/** Cleaning rule of one variable: what counts as not a measurement. Every rule is documented in the provenance. */
export interface CleaningRule {
  /** Physically impossible or instrument-fill values outside [min, max] are dropped. */
  min: number;
  max: number;
  /** Exact values the source uses as fills when a sensor is offline; dropped. */
  placeholders: number[];
  /**
   * A run of identical consecutive values spanning at least this many minutes is a stuck or held sensor and is
   * dropped. Null disables the rule (temperature and humidity are quantised and can legitimately stay flat).
   */
  maxFlatMin: number | null;
  description: string;
}

/** A row from the source: ISO time and a raw value that may be null or not a number. */
export interface RawRow {
  time: unknown;
  value: unknown;
}

export type DropReason = 'badTime' | 'null' | 'notFinite' | 'placeholder' | 'outOfRange' | 'duplicateTime' | 'flatline';
export type DropCounts = Record<DropReason, number>;

export interface CleanResult {
  /** Minutes since the epoch and value, sorted by time, one value per minute. */
  points: Array<{ tMin: number; value: number }>;
  rawRows: number;
  dropped: DropCounts;
}

export const emptyDropCounts = (): DropCounts => ({ badTime: 0, null: 0, notFinite: 0, placeholder: 0, outOfRange: 0, duplicateTime: 0, flatline: 0 });

/** Applies the cleaning rule of one variable to raw rows. Pure: counts every dropped row by reason. */
export function cleanRows(rows: readonly RawRow[], rule: CleaningRule): CleanResult {
  const dropped = emptyDropCounts();
  const byMinute = new Map<number, number>();
  for (const row of rows) {
    const ms = typeof row.time === 'string' ? parseIso(row.time) : null;
    if (ms === null) {
      dropped.badTime += 1;
      continue;
    }
    if (row.value === null || row.value === undefined) {
      dropped.null += 1;
      continue;
    }
    if (typeof row.value !== 'number' || !Number.isFinite(row.value)) {
      dropped.notFinite += 1;
      continue;
    }
    if (rule.placeholders.includes(row.value)) {
      dropped.placeholder += 1;
      continue;
    }
    if (row.value < rule.min || row.value > rule.max) {
      dropped.outOfRange += 1;
      continue;
    }
    const tMin = Math.floor(ms / 60000);
    if (byMinute.has(tMin)) {
      dropped.duplicateTime += 1;
      continue;
    }
    byMinute.set(tMin, row.value);
  }
  const sorted = [...byMinute.entries()].sort((a, b) => a[0] - b[0]).map(([tMin, value]) => ({ tMin, value }));
  const points = rule.maxFlatMin === null ? sorted : dropFlatRuns(sorted, rule.maxFlatMin, dropped);
  return { points, rawRows: rows.length, dropped };
}

/** Removes runs of identical consecutive values that span at least `maxFlatMin` minutes (stuck sensor). */
function dropFlatRuns(points: Array<{ tMin: number; value: number }>, maxFlatMin: number, dropped: DropCounts): Array<{ tMin: number; value: number }> {
  const out: Array<{ tMin: number; value: number }> = [];
  let i = 0;
  while (i < points.length) {
    let j = i;
    while (j + 1 < points.length && points[j + 1]!.value === points[i]!.value) j += 1;
    if (points[j]!.tMin - points[i]!.tMin >= maxFlatMin) dropped.flatline += j - i + 1;
    else for (let k = i; k <= j; k += 1) out.push(points[k]!);
    i = j + 1;
  }
  return out;
}

export interface ResampleOptions {
  /** Longest run of missing slots that is bridged by linear interpolation. Longer gaps split the series. */
  maxFillSlots: number;
  /** Segments shorter than this are discarded. */
  minSlots: number;
}

/**
 * Resamples clean points to the 15-minute grid (mean of the points inside each slot) and splits the series into
 * contiguous segments. A gap of at most `maxFillSlots` empty slots is bridged by linear interpolation between the
 * two neighbours; a longer gap is never interpolated and ends the segment.
 */
export function resampleToSegments(points: ReadonlyArray<{ tMin: number; value: number }>, options: ResampleOptions): Segment[] {
  const bins = new Map<number, { sum: number; n: number }>();
  for (const p of points) {
    const slot = Math.floor(p.tMin / SLOT_MIN);
    const bin = bins.get(slot) ?? { sum: 0, n: 0 };
    bin.sum += p.value;
    bin.n += 1;
    bins.set(slot, bin);
  }
  const slots = [...bins.keys()].sort((a, b) => a - b);
  const segments: Segment[] = [];
  let current: Segment | null = null;
  let lastSlot = 0;
  let lastValue = 0;
  const close = () => {
    if (current && current.values.length >= options.minSlots) segments.push(current);
    current = null;
  };
  for (const slot of slots) {
    const bin = bins.get(slot)!;
    const value = bin.sum / bin.n;
    if (current !== null) {
      const missing = slot - lastSlot - 1;
      if (missing > options.maxFillSlots) close();
      else {
        for (let k = 1; k <= missing; k += 1) current.values.push(lastValue + ((value - lastValue) * k) / (missing + 1));
      }
    }
    if (current === null) current = { startSlot: slot, values: [] };
    current.values.push(value);
    lastSlot = slot;
    lastValue = value;
  }
  close();
  return segments;
}

/** Which source field and cleaning rule each variable uses. Radiation is deliberately absent (unit undocumented). */
export const SOURCE_FIELD: Record<ForecastVariable, string> = {
  co2: 'co2_iss',
  cabinTemperature: 'temperature_iss',
  humidity: 'humidity_iss',
};
