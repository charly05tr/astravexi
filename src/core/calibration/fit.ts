import { fitRidge } from '../forecast/ridge';
import { quantile } from '../forecast/evaluate';
import { SLOTS_PER_DAY, SLOT_MIN } from '../forecast/types';
import type { Segment } from '../forecast/types';

export interface MissionSegments {
  mission: string;
  segments: Segment[];
}

/** One harmonic of the daily cycle: amplitude * cos(2 pi * k * (slotOfDay - peakSlot) / 96). */
export interface HarmonicFit {
  harmonic: 1 | 2;
  amplitude: number;
  /** Slot of the day (15-minute slots from 00:00) at which this harmonic is at its maximum, in [0, 96 / harmonic). */
  peakSlot: number;
}

export interface ExcursionStats {
  /** Threshold: each mission own 95th percentile, shown as the median across missions of its offset above that mission median. */
  p95OffsetFromMedian: number;
  /** Share of grid samples above the mission own p95 (about 5% by construction). */
  fractionAboveP95: number;
  /** Excursions (maximal runs above p95) per day of data. */
  episodesPerDay: number;
  meanDurationHours: number;
  p90DurationHours: number;
  /** How far above the p95 the peak of an excursion goes, in the variable unit. */
  meanPeakExcess: number;
  p90PeakExcess: number;
}

export interface LimitCrossing {
  /** Share of all grid samples outside the NASA operating limit. */
  fractionOutsideOperating: number;
  /** Excursions outside the operating limit (maximal runs) per 30 days of data. */
  episodesPer30Days: number;
  /** Share of grid samples outside the comfort zone, when one is defined. */
  fractionOutsideComfort: number | null;
}

export interface VariableCalibration {
  /** Median across missions of each mission median: the level of a typical mission. */
  level: number;
  /** Spread of the mission medians: the level differs between missions by this much. */
  levelAcrossMissions: { min: number; max: number; sd: number };
  cycle: HarmonicFit[];
  noise: {
    /** Median across missions of the residual sd after removing the mission median and the daily cycle. */
    sd: number;
    /** Median across missions of the lag-1 (15-minute) autocorrelation of the residual. */
    ar1: number;
    /** Sd of the AR(1) innovation: sd * sqrt(1 - ar1^2). */
    innovationSd: number;
    /** Range of the per-mission residual sd, for context. */
    sdAcrossMissions: { min: number; max: number };
  };
  /** Plausible range of a typical mission: level plus the median across missions of each 0.5th and 99.5th percentile offset. Bounds the simulation. */
  bounds: { low: number; high: number };
  excursions: ExcursionStats;
  limits: LimitCrossing | null;
  /** Grid samples and days of real data behind the fit. */
  samples: number;
  days: number;
  missions: string[];
}

const median = (xs: readonly number[]): number => quantile([...xs].sort((a, b) => a - b), 0.5);

function* eachSegment(missions: readonly MissionSegments[]) {
  for (const m of missions) for (const s of m.segments) yield { mission: m.mission, seg: s };
}

const theta = (slotOfDay: number, k: number) => (2 * Math.PI * k * slotOfDay) / SLOTS_PER_DAY;
const slotOfDayOf = (absoluteSlot: number) => ((absoluteSlot % SLOTS_PER_DAY) + SLOTS_PER_DAY) % SLOTS_PER_DAY;

/** Evaluates the fitted daily cycle at a slot of the day. */
export function cycleAt(cycle: readonly HarmonicFit[], slotOfDay: number): number {
  let sum = 0;
  for (const h of cycle) sum += h.amplitude * Math.cos(theta(slotOfDay - h.peakSlot, h.harmonic));
  return sum;
}

/** Fits the first two daily harmonics to the values after removing each mission median. */
export function fitDailyCycle(missions: readonly MissionSegments[], medians: ReadonlyMap<string, number>): HarmonicFit[] {
  const x: number[][] = [];
  const y: number[] = [];
  for (const { mission, seg } of eachSegment(missions)) {
    const m = medians.get(mission)!;
    seg.values.forEach((v, i) => {
      const s = slotOfDayOf(seg.startSlot + i);
      x.push([Math.cos(theta(s, 1)), Math.sin(theta(s, 1)), Math.cos(theta(s, 2)), Math.sin(theta(s, 2))]);
      y.push(v - m);
    });
  }
  const fit = fitRidge(x, y, 0);
  if (!fit) return [];
  const out: HarmonicFit[] = [];
  for (const k of [1, 2] as const) {
    const a = fit.coefficients[(k - 1) * 2]!;
    const b = fit.coefficients[(k - 1) * 2 + 1]!;
    const period = SLOTS_PER_DAY / k;
    const psi = Math.atan2(b, a);
    const peak = ((((psi / (2 * Math.PI)) * period) % period) + period) % period;
    out.push({ harmonic: k, amplitude: Math.hypot(a, b), peakSlot: peak });
  }
  return out;
}

/** Maximal runs (start and end index, inclusive) where `pred` holds, inside one segment. */
function runs(values: readonly number[], pred: (v: number) => boolean): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = -1;
  values.forEach((v, i) => {
    if (pred(v)) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      out.push([start, i - 1]);
      start = -1;
    }
  });
  if (start >= 0) out.push([start, values.length - 1]);
  return out;
}

export interface LimitDef {
  operating: { min?: number; max?: number } | null;
  comfort: { min?: number; max?: number } | null;
}

const outside = (v: number, r: { min?: number; max?: number }) => (r.max !== undefined && v > r.max) || (r.min !== undefined && v < r.min);

/** Fits level, daily cycle, residual noise (sd and AR(1)), bounds and excursion statistics of one variable. */
export function fitVariable(missions: readonly MissionSegments[], limits: LimitDef | null): VariableCalibration | null {
  const usable = missions.filter((m) => m.segments.some((s) => s.values.length > 0));
  if (usable.length === 0) return null;
  const medians = new Map<string, number>();
  for (const m of usable) medians.set(m.mission, median(m.segments.flatMap((s) => s.values)));
  const missionMedians = [...medians.values()];
  const level = median(missionMedians);
  const meanMedian = missionMedians.reduce((s, v) => s + v, 0) / missionMedians.length;
  const levelSd = Math.sqrt(missionMedians.reduce((s, v) => s + (v - meanMedian) ** 2, 0) / missionMedians.length);

  const cycle = fitDailyCycle(usable, medians);

  // Residual noise and its lag-1 autocorrelation, per mission and inside segments only. The simulation imitates ONE
  // typical mission, so each parameter is the median across missions: a pooled estimate would be dominated by the
  // few missions with sensor drift or very high CO2.
  const sds: number[] = [];
  const ar1s: number[] = [];
  const lowOffsets: number[] = [];
  const highOffsets: number[] = [];
  for (const m of usable) {
    const med = medians.get(m.mission)!;
    let sumSq = 0;
    let n = 0;
    let cross = 0;
    let prevSq = 0;
    const offsets: number[] = [];
    for (const seg of m.segments) {
      let prev: number | null = null;
      seg.values.forEach((v, i) => {
        const r = v - med - cycleAt(cycle, slotOfDayOf(seg.startSlot + i));
        sumSq += r * r;
        n += 1;
        if (prev !== null) {
          cross += r * prev;
          prevSq += prev * prev;
        }
        prev = r;
        offsets.push(v - med);
      });
    }
    if (n === 0) continue;
    sds.push(Math.sqrt(sumSq / n));
    ar1s.push(prevSq > 0 ? Math.max(-0.999, Math.min(0.999, cross / prevSq)) : 0);
    offsets.sort((x, y) => x - y);
    lowOffsets.push(quantile(offsets, 0.005));
    highOffsets.push(quantile(offsets, 0.995));
  }
  const sd = median(sds);
  const ar1 = median(ar1s);

  // Excursions above each mission own p95.
  let episodes = 0;
  let above = 0;
  let totalSamples = 0;
  const durations: number[] = [];
  const peaks: number[] = [];
  const offsets: number[] = [];
  for (const m of usable) {
    const all = m.segments.flatMap((s) => s.values).sort((a, b) => a - b);
    const p95 = quantile(all, 0.95);
    offsets.push(p95 - medians.get(m.mission)!);
    for (const seg of m.segments) {
      totalSamples += seg.values.length;
      for (const [a, b] of runs(seg.values, (v) => v > p95)) {
        episodes += 1;
        above += b - a + 1;
        durations.push(((b - a + 1) * SLOT_MIN) / 60);
        peaks.push(Math.max(...seg.values.slice(a, b + 1)) - p95);
      }
    }
  }
  durations.sort((a, b) => a - b);
  peaks.sort((a, b) => a - b);
  const days = (totalSamples * SLOT_MIN) / 1440;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);

  let crossing: LimitCrossing | null = null;
  if (limits?.operating) {
    let outOp = 0;
    let outComfort = 0;
    let opEpisodes = 0;
    for (const { seg } of eachSegment(usable)) {
      for (const v of seg.values) {
        if (outside(v, limits.operating)) outOp += 1;
        if (limits.comfort && outside(v, limits.comfort)) outComfort += 1;
      }
      opEpisodes += runs(seg.values, (v) => outside(v, limits.operating!)).length;
    }
    crossing = {
      fractionOutsideOperating: outOp / totalSamples,
      episodesPer30Days: (opEpisodes / days) * 30,
      fractionOutsideComfort: limits.comfort ? outComfort / totalSamples : null,
    };
  }

  return {
    level,
    levelAcrossMissions: { min: Math.min(...missionMedians), max: Math.max(...missionMedians), sd: levelSd },
    cycle,
    noise: { sd, ar1, innovationSd: sd * Math.sqrt(1 - ar1 * ar1), sdAcrossMissions: { min: Math.min(...sds), max: Math.max(...sds) } },
    bounds: { low: level + median(lowOffsets), high: level + median(highOffsets) },
    excursions: {
      p95OffsetFromMedian: median(offsets),
      fractionAboveP95: above / totalSamples,
      episodesPerDay: episodes / days,
      meanDurationHours: mean(durations),
      p90DurationHours: quantile(durations, 0.9),
      meanPeakExcess: mean(peaks),
      p90PeakExcess: quantile(peaks, 0.9),
    },
    limits: crossing,
    samples: totalSamples,
    days,
    missions: usable.map((m) => m.mission),
  };
}
