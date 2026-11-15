/**
 * Mission playback: the pure part. The visible state of a scenario at mission minute `t` is a function of
 * (scenario, seed, t) only: anything stamped after `t` does not exist yet. No clock, no randomness, no UI.
 */

export const MINUTES_PER_DAY = 1440;
/** The cabin timeline has one sample per slot of this many minutes. */
export const CABIN_SLOT_MIN = 15;

export type ScriptedClass = 'individual' | 'environmental' | 'shared';

/** Something the scenario script injected: what the audience can compare with what the engine flags. */
export interface ScriptedEvent {
  id: string;
  name: string;
  /** First and last mission minute of the injected effect (inclusive start, exclusive end). */
  startT: number;
  endT: number;
  truth: ScriptedClass;
}

/** What the playback bar needs to know about a scenario. */
export interface PlaybackSpan {
  /** The scrubber covers [startT, endT]. */
  startT: number;
  endT: number;
  /** Where playback starts (and where Restart returns). */
  initialT: number;
  events: readonly ScriptedEvent[];
  /** Sorted, unique mission minutes of every crew reading: the stops of the step buttons. */
  readingTimes: readonly number[];
}

export interface PlaybackSpeed {
  id: string;
  label: string;
  /** Mission minutes per real second. */
  minPerSec: number;
}

export const PLAYBACK_SPEEDS: readonly PlaybackSpeed[] = [
  { id: '1m', label: '1 min/s', minPerSec: 1 },
  { id: '10m', label: '10 min/s', minPerSec: 10 },
  { id: '1h', label: '1 h/s', minPerSec: 60 },
  { id: '6h', label: '6 h/s', minPerSec: 360 },
];
export const DEFAULT_SPEED_ID = '1h';

export const dayOf = (t: number): number => Math.floor(t / MINUTES_PER_DAY) + 1;

/** "Day 150, 08:05". */
export function missionTimeLabel(t: number): string {
  const inDay = ((Math.floor(t) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hh = String(Math.floor(inDay / 60)).padStart(2, '0');
  const mm = String(inDay % 60).padStart(2, '0');
  return `Day ${dayOf(t)}, ${hh}:${mm}`;
}

export const clampT = (t: number, startT: number, endT: number): number => Math.min(endT, Math.max(startT, Math.floor(t)));

/** The items that already exist at mission minute `t`. Monotonic in `t`: whatever is visible stays visible later. */
export function visibleAt<T extends { t: number }>(items: readonly T[], t: number): T[] {
  return items.filter((i) => i.t <= t);
}

/** Index of the last value <= `t` in a sorted array, or -1. */
export function lastIndexAtOrBefore(sorted: readonly number[], t: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/**
 * Identity of the visible data at `t`: changes exactly when a new crew reading or a new 15-minute cabin sample
 * becomes visible. Recomputing the analysis is only needed when this key changes.
 */
export function dataKey(readingTimes: readonly number[], t: number): string {
  return `${lastIndexAtOrBefore(readingTimes, t)}:${Math.floor(t / CABIN_SLOT_MIN)}`;
}

/** The previous (-1) or next (+1) reading time, or the end of the span when there is none. */
export function stepToReading(readingTimes: readonly number[], t: number, dir: 1 | -1, startT: number, endT: number): number {
  if (dir === 1) {
    const next = readingTimes.find((r) => r > t);
    return clampT(next ?? endT, startT, endT);
  }
  for (let i = readingTimes.length - 1; i >= 0; i -= 1) {
    if (readingTimes[i]! < t) return clampT(readingTimes[i]!, startT, endT);
  }
  return startT;
}

/** The new position after `elapsedMs` of real time at `minPerSec`, clamped to the span. */
export function advanceT(t: number, elapsedMs: number, minPerSec: number, startT: number, endT: number): number {
  return clampT(t + (elapsedMs / 1000) * minPerSec, startT, endT);
}

/** Day boundaries inside the span, for the scrubber ticks. */
export function dayTicks(startT: number, endT: number): number[] {
  const ticks: number[] = [];
  for (let d = Math.ceil(startT / MINUTES_PER_DAY); d * MINUTES_PER_DAY <= endT; d += 1) ticks.push(d * MINUTES_PER_DAY);
  return ticks;
}
