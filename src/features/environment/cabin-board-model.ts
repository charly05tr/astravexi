import type { AttributedReading } from '../../core/attribution/analyze';
import type { Excursion } from '../../core/attribution/environment-link';
import type { CabinVariableDef, CabinVariableId, Range, Verdict } from '../../core/attribution/model';
import type { ForecastAlert } from '../../core/forecast/alert';
import type { SourceRef, ZoneStatus } from '../../core/health/model';
import type { CabinAnalysisView, CabinVariableView } from '../../core/use-cases/cabin-analysis';
import { TIER_ORDER } from '../../theme/tiers';
import { formatValue, missionDay, withUnit } from './analysis-model';

/**
 * Pure view logic of the "Cabin & crew analysis" status board: the key indicators, the "Needs attention" list
 * (ordering and grouping), the meter geometry and the chart scales. No React, no clock: every time comes from the view.
 */

const severity = (s: ZoneStatus): number => TIER_ORDER.indexOf(s);

/** Variables with an instantaneous NASA limit; the cumulative dose is context, shown as its own tile. */
export const airVariables = (view: CabinAnalysisView): CabinVariableView[] => view.variables.filter((v) => !v.def.contextOnly);

const outside = (v: number, r: Range | null): 'above' | 'below' | null =>
  r === null ? null : r.max !== undefined && v > r.max ? 'above' : r.min !== undefined && v < r.min ? 'below' : null;

export interface RangeBreach {
  /** `operating`: outside the NASA limit. `comfort`: inside the limit but outside the comfort zone. */
  zone: 'operating' | 'comfort';
  side: 'above' | 'below';
  limit: number;
}

/** Which range a value is outside of, and on which side. Null when it is inside both. */
export function rangeBreach(def: CabinVariableDef, value: number): RangeBreach | null {
  const op = outside(value, def.operating);
  if (op) return { zone: 'operating', side: op, limit: op === 'above' ? def.operating!.max! : def.operating!.min! };
  const co = outside(value, def.comfort);
  if (co) return { zone: 'comfort', side: co, limit: co === 'above' ? def.comfort!.max! : def.comfort!.min! };
  return null;
}

/** "above its NASA limit of 27 °C" / "below its comfort zone of 20 °C". */
export function breachText(def: CabinVariableDef, b: RangeBreach): string {
  return `${b.side} its ${b.zone === 'operating' ? 'NASA limit' : 'comfort zone'} of ${formatValue(b.limit, def.unit)}`;
}

/** The short name used in sentences: "CO2" for the CO2 variable, the label otherwise. */
export const shortLabel = (def: CabinVariableDef): string => (def.id === 'co2' ? 'CO2' : def.label);

// ---------------------------------------------------------------- key indicators

export interface CabinNowSummary {
  status: ZoneStatus;
  /** The variable with the worst tier, or null without data. */
  driver: CabinVariableView | null;
  breach: RangeBreach | null;
}

/** The worst tier among CO2, temperature and humidity, naming the variable that drives it. */
export function summarizeCabinNow(view: CabinAnalysisView): CabinNowSummary {
  const withData = airVariables(view).filter((v) => v.latest !== null);
  if (!view.simulated || withData.length === 0) return { status: 'noData', driver: null, breach: null };
  let worst = withData[0]!;
  for (const v of withData) if (severity(v.status) < severity(worst.status)) worst = v;
  return { status: worst.status, driver: worst, breach: worst.latest === null ? null : rangeBreach(worst.def, worst.latest) };
}

export type OutlookSummary =
  | { kind: 'alert'; variable: CabinVariableView; alert: ForecastAlert }
  | { kind: 'clear' }
  | { kind: 'none' };

/** The earliest forecast alert across the variables, "no crossing" when forecasts exist, "none" when no forecast is available. */
export function summarizeOutlook(view: CabinAnalysisView): OutlookSummary {
  const forecasted = airVariables(view).filter((v) => v.forecast.length > 0);
  if (!view.simulated || forecasted.length === 0) return { kind: 'none' };
  let best: { variable: CabinVariableView; alert: ForecastAlert } | null = null;
  for (const v of forecasted) {
    if (v.forecastAlert && (best === null || v.forecastAlert.horizonH < best.alert.horizonH)) best = { variable: v, alert: v.forecastAlert };
  }
  return best ? { kind: 'alert', ...best } : { kind: 'clear' };
}

export interface RadiationSummary {
  dose: number;
  limit: number;
  unit: string;
  /** 0 to 100. */
  percent: number;
  def: CabinVariableDef;
}

/** The mission-total dose against the career limit, or null when there is no dose data. */
export function summarizeRadiation(view: CabinAnalysisView): RadiationSummary | null {
  const v = view.variables.find((x) => x.def.cumulativeLimit !== undefined);
  if (!v || v.latest === null || v.def.cumulativeLimit === undefined) return null;
  const limit = v.def.cumulativeLimit;
  return { dose: v.latest, limit, unit: v.def.unit, percent: Math.min(100, Math.max(0, (v.latest / limit) * 100)), def: v.def };
}

export const percentText = (p: number): string => `${p < 10 ? p.toFixed(1) : Math.round(p)}%`;

/** The crew tile's four causes, in the order they are shown. */
export const CAUSES: ReadonlyArray<{ verdict: Verdict; label: string }> = [
  { verdict: 'likely-external', label: 'Cabin' },
  { verdict: 'possibly-external', label: 'Possibly cabin' },
  { verdict: 'likely-internal', label: 'Personal' },
  { verdict: 'insufficient-data', label: 'Unclear' },
];

// ---------------------------------------------------------------- needs attention

const REVIEW_PROMPT: Record<CabinVariableId, string> = {
  co2: 'Review CO2 removal',
  cabinTemperature: 'Review cabin thermal control',
  humidity: 'Review cabin humidity control',
  radiationDose: 'Review the radiation exposure plan',
};
export const reviewPrompt = (id: CabinVariableId): string => REVIEW_PROMPT[id];

export interface CabinAttention {
  kind: 'cabin';
  id: string;
  variable: CabinVariableView;
  status: ZoneStatus;
  breach: RangeBreach;
  /** Mission minute the value has been continuously outside the range since, or null when unknown. */
  sinceT: number | null;
  /** True when the value was already outside at the start of the 48 h window, so the real start is earlier. */
  sinceBeforeWindow: boolean;
  prompt: string;
}

export interface ForecastAttention {
  kind: 'forecast';
  id: string;
  variable: CabinVariableView;
  alert: ForecastAlert;
  prompt: string;
}

export interface FindingAttention {
  kind: 'finding';
  id: string;
  finding: AttributedReading;
  ongoing: boolean;
}

/** Several readings of one person and indicator with the same verdict, as one item. */
export interface PersonAttention {
  kind: 'person';
  id: string;
  profileId: string;
  name: string;
  verdict: Verdict;
  /** Newest first, at least two. */
  findings: AttributedReading[];
  latest: AttributedReading;
  fromT: number;
  toT: number;
  ongoing: boolean;
}

export interface GroupAttention {
  kind: 'group';
  id: string;
  variable: CabinVariableId;
  label: string;
  unit: string;
  side: 'above' | 'below';
  limit: number;
  /** The most extreme value of the shared excursion. */
  peak: number;
  fromT: number;
  toT: number;
  /** Newest first. */
  findings: AttributedReading[];
  /** Distinct crew members in the group. */
  people: number;
  newestT: number;
  ongoing: boolean;
}

export type CrewAttention = GroupAttention | PersonAttention | FindingAttention;
export type AttentionItem = CabinAttention | ForecastAttention | CrewAttention;

/** A crew item is ongoing when its latest reading is within the last 24 hours. */
export const ONGOING_WINDOW_MIN = 1440;

/** How long a value has continuously been outside `range`, from the 48 h trend. */
export function outsideSince(
  range: Range,
  trend: readonly number[],
  trendT: readonly number[],
): { t: number; beforeWindow: boolean } | null {
  let i = trend.length - 1;
  if (i < 0 || outside(trend[i]!, range) === null) return null;
  while (i > 0 && outside(trend[i - 1]!, range) !== null) i -= 1;
  return { t: trendT[i]!, beforeWindow: i === 0 };
}

function cabinItems(view: CabinAnalysisView): CabinAttention[] {
  const items: CabinAttention[] = [];
  for (const v of airVariables(view)) {
    if (v.latest === null || severity(v.status) >= severity('none')) continue;
    const breach = rangeBreach(v.def, v.latest);
    if (!breach) continue;
    const range = breach.zone === 'operating' ? v.def.operating : v.def.comfort;
    const since = range ? outsideSince(range, v.trend, v.trendT) : null;
    items.push({
      kind: 'cabin',
      id: `cabin:${v.def.id}`,
      variable: v,
      status: v.status,
      breach,
      sinceT: since?.t ?? null,
      sinceBeforeWindow: since?.beforeWindow ?? false,
      prompt: reviewPrompt(v.def.id),
    });
  }
  return items.sort((a, b) => severity(a.status) - severity(b.status));
}

function forecastItems(view: CabinAnalysisView): ForecastAttention[] {
  const items: ForecastAttention[] = [];
  for (const v of airVariables(view)) {
    if (v.forecastAlert) items.push({ kind: 'forecast', id: `forecast:${v.def.id}`, variable: v, alert: v.forecastAlert, prompt: reviewPrompt(v.def.id) });
  }
  return items.sort((a, b) => a.alert.horizonH - b.alert.horizonH);
}

const excursionKey = (e: Pick<Excursion, 'variable' | 'side'>): string => `${e.variable}:${e.side}`;

/**
 * Turns the findings into attention items, newest first. Likely-external findings that rest on the same excursion
 * (same variable and side, overlapping windows) merge into one group, because one cabin event explains them all.
 * A lone likely-external finding stays a plain finding.
 */
export function groupFindings(findings: readonly AttributedReading[], nowT: number): CrewAttention[] {
  const isOngoing = (t: number) => nowT - t <= ONGOING_WINDOW_MIN;
  const external = findings.filter((f) => f.verdict === 'likely-external' && f.environment.status === 'linked-excursion');

  // Each finding joins the excursion shared with the most other findings, so one event does not split into groups.
  const popularity = new Map<string, number>();
  for (const f of external) {
    if (f.environment.status !== 'linked-excursion') continue;
    for (const k of new Set(f.environment.excursions.map(excursionKey))) popularity.set(k, (popularity.get(k) ?? 0) + 1);
  }
  const picked: Array<{ finding: AttributedReading; excursion: Excursion }> = [];
  for (const f of external) {
    if (f.environment.status !== 'linked-excursion') continue;
    const best = [...f.environment.excursions].sort(
      (a, b) => (popularity.get(excursionKey(b)) ?? 0) - (popularity.get(excursionKey(a)) ?? 0) || excursionKey(a).localeCompare(excursionKey(b)),
    )[0]!;
    picked.push({ finding: f, excursion: best });
  }

  // Merge overlapping windows of the same excursion key.
  const clusters: Array<{ key: string; from: number; to: number; members: typeof picked }> = [];
  const sorted = [...picked].sort((a, b) => excursionKey(a.excursion).localeCompare(excursionKey(b.excursion)) || a.excursion.fromT - b.excursion.fromT);
  for (const p of sorted) {
    const key = excursionKey(p.excursion);
    const last = clusters[clusters.length - 1];
    if (last && last.key === key && p.excursion.fromT <= last.to) {
      last.members.push(p);
      last.to = Math.max(last.to, p.excursion.toT);
    } else {
      clusters.push({ key, from: p.excursion.fromT, to: p.excursion.toT, members: [p] });
    }
  }

  const grouped = new Set<string>();
  const out: CrewAttention[] = [];
  for (const c of clusters) {
    if (c.members.length < 2) continue;
    const fs = c.members.map((m) => m.finding).sort((a, b) => b.t - a.t);
    const first = c.members[0]!.excursion;
    const above = first.side === 'above';
    for (const f of fs) grouped.add(f.id);
    out.push({
      kind: 'group',
      id: `group:${c.key}:${c.from}`,
      variable: first.variable,
      label: first.label,
      unit: first.unit,
      side: first.side,
      limit: first.limit,
      peak: c.members.reduce((acc, m) => (above ? Math.max(acc, m.excursion.peak) : Math.min(acc, m.excursion.peak)), first.peak),
      fromT: c.from,
      toT: c.to,
      findings: fs,
      people: new Set(fs.map((f) => f.profileId)).size,
      newestT: fs[0]!.t,
      ongoing: isOngoing(fs[0]!.t),
    });
  }

  // The rest: one item per person, indicator and verdict. Verdicts are never merged.
  const series = new Map<string, AttributedReading[]>();
  for (const f of findings) {
    if (grouped.has(f.id)) continue;
    const key = `${f.profileId}|${f.indicatorId}|${f.verdict}`;
    series.set(key, [...(series.get(key) ?? []), f]);
  }
  for (const [key, list] of series) {
    const fs = [...list].sort((a, b) => b.t - a.t);
    const latest = fs[0]!;
    if (fs.length === 1) {
      out.push({ kind: 'finding', id: latest.id, finding: latest, ongoing: isOngoing(latest.t) });
    } else {
      out.push({
        kind: 'person',
        id: `person:${key}`,
        profileId: latest.profileId,
        name: latest.name,
        verdict: latest.verdict,
        findings: fs,
        latest,
        fromT: fs[fs.length - 1]!.t,
        toT: latest.t,
        ongoing: isOngoing(latest.t),
      });
    }
  }
  return out.sort((a, b) => itemTime(b) - itemTime(a) || a.id.localeCompare(b.id));
}

const itemTime = (i: CrewAttention): number => (i.kind === 'group' ? i.newestT : i.kind === 'person' ? i.toT : i.finding.t);

/**
 * The single "Needs attention" list, most urgent first: cabin variables outside their range (worst tier first),
 * forecast alerts (shortest horizon first), then crew findings newest first. With a cause filter only the crew
 * findings of that cause remain, because the filter answers "who, and why".
 */
export function buildAttention(view: CabinAnalysisView, cause: Verdict | null): AttentionItem[] {
  const crew = groupFindings(cause === null ? view.analysis.findings : view.analysis.findings.filter((f) => f.verdict === cause), view.nowT);
  if (cause !== null) return crew;
  return [...cabinItems(view), ...forecastItems(view), ...crew];
}

/** The verdict an item stands for: a grouped excursion is always likely external. */
export const itemVerdict = (i: CrewAttention): Verdict => (i.kind === 'group' ? 'likely-external' : i.kind === 'person' ? i.verdict : i.finding.verdict);

/** How many items the list shows per cause. The crew tile counts these, with the readings as secondary text. */
export function countItemsByVerdict(view: CabinAnalysisView): Record<Verdict, number> {
  const counts: Record<Verdict, number> = { 'likely-external': 0, 'possibly-external': 0, 'likely-internal': 0, 'insufficient-data': 0 };
  for (const i of groupFindings(view.analysis.findings, view.nowT)) counts[itemVerdict(i)] += 1;
  return counts;
}

/** "Demo astronaut · Resting heart rate above their usual on 8 readings, Day 146–153 (latest 73 bpm, usual 62.5 bpm)". */
export function personHeadline(p: PersonAttention): string {
  const f = p.latest;
  const d0 = missionDay(p.fromT);
  const d1 = missionDay(p.toT);
  const dir = f.personal.direction === 'none' ? 'away from' : f.personal.direction;
  return `${p.name} · ${f.indicatorLabel} ${dir} their usual on ${p.findings.length} readings, ${d0 === d1 ? `Day ${d0}` : `Day ${d0}–${d1}`} (latest ${withUnit(f.value, f.unit)}, usual ${withUnit(f.personal.median, f.unit)})`;
}

/** "resting heart rate up" when every reading shares one indicator and direction, otherwise a count. */
export function groupOutcome(g: GroupAttention): string {
  const ids = new Set(g.findings.map((f) => f.indicatorId));
  const dirs = new Set(g.findings.map((f) => f.personal.direction));
  if (ids.size !== 1) return `atypical readings in ${g.findings.length} cases`;
  const label = g.findings[0]!.indicatorLabel;
  const name = /^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label;
  const dir = dirs.size === 1 ? [...dirs][0] : 'none';
  return `${name}${dir === 'above' ? ' up' : dir === 'below' ? ' down' : ' atypical'}`;
}

export function groupHeadline(g: GroupAttention, crewSize: number): string {
  return `${g.label} ${g.side} ${formatValue(g.limit, g.unit)} on Day ${missionDay(g.fromT)} → ${groupOutcome(g)} in ${g.people} of ${Math.max(crewSize, g.people)} crew`;
}

/** "Demo astronaut 3 · Resting heart rate 88 bpm (usual 64 bpm)". */
export const findingTitle = (f: AttributedReading): string =>
  `${f.name} · ${f.indicatorLabel} ${withUnit(f.value, f.unit)} (usual ${withUnit(f.personal.median, f.unit)})`;

// ---------------------------------------------------------------- cabin air meters

export interface MeterLayout {
  /** All positions are fractions of the track, 0 to 1. */
  operating: { from: number; to: number } | null;
  comfort: { from: number; to: number } | null;
  marker: number | null;
  reference: number | null;
  domain: [number, number];
}

/**
 * Where the NASA range, the comfort band, the current value and an optional reference sit on a horizontal track.
 * A one-sided limit starts the track at zero so the limit is not exaggerated; a two-sided range pads each side.
 */
export function meterLayout(def: CabinVariableDef, latest: number | null, reference: number | null = null): MeterLayout {
  const op = def.operating;
  const values = [latest, reference].filter((x): x is number => x !== null);
  let lo: number;
  let hi: number;
  if (op && op.min !== undefined && op.max !== undefined) {
    const pad = (op.max - op.min) * 0.25;
    lo = Math.min(op.min - pad, ...values);
    hi = Math.max(op.max + pad, ...values);
  } else {
    lo = Math.min(0, ...values);
    hi = Math.max(op?.max ?? 0, ...values) * 1.1;
    if (hi <= lo) hi = lo + 1;
  }
  const span = hi - lo;
  const f = (v: number) => Math.min(1, Math.max(0, (v - lo) / span));
  const band = (r: Range | null) => (r ? { from: r.min === undefined ? 0 : f(r.min), to: r.max === undefined ? 1 : f(r.max) } : null);
  return { operating: band(op), comfort: band(def.comfort), marker: latest === null ? null : f(latest), reference: reference === null ? null : f(reference), domain: [lo, hi] };
}

// ---------------------------------------------------------------- chart scales

/** Up to about `count` round tick values covering [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Math.round(v / step) * step);
  return ticks;
}

/** The value axis of a 48 h chart: the data plus the NASA limits, with a little air. */
export function chartDomain(def: CabinVariableDef, values: readonly number[]): [number, number] {
  const all = [...values];
  if (def.operating?.min !== undefined) all.push(def.operating.min);
  if (def.operating?.max !== undefined) all.push(def.operating.max);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.08;
  return [lo - pad, hi + pad];
}

/** Round-hour ticks (every 12 h on the mission clock) inside [t0, t1]. */
export function timeTicks(t0: number, t1: number, everyMin = 720): number[] {
  const out: number[] = [];
  for (let t = Math.ceil(t0 / everyMin) * everyMin; t <= t1; t += everyMin) out.push(t);
  return out;
}

/** The index of the sample closest to a mission minute. */
export function nearestIndex(ts: readonly number[], t: number): number {
  let best = 0;
  for (let i = 1; i < ts.length; i += 1) if (Math.abs(ts[i]! - t) < Math.abs(ts[best]! - t)) best = i;
  return best;
}

/** One value per hour (plus the latest) for the chart's table view. */
export function hourlyRows(trend: readonly number[], trendT: readonly number[]): Array<{ t: number; value: number }> {
  const rows: Array<{ t: number; value: number }> = [];
  for (let i = 0; i < trend.length; i += 1) {
    if (trendT[i]! % 60 === 0 || i === trend.length - 1) rows.push({ t: trendT[i]!, value: trend[i]! });
  }
  return rows;
}

// ---------------------------------------------------------------- sources

export interface SourceEntry {
  source: SourceRef;
  needsVerification: boolean;
  usedFor: string[];
}

/** Every NASA limit and every physiological link source once, with what each one backs. Deduplicated by URL. */
export function collectSources(view: CabinAnalysisView): SourceEntry[] {
  const byUrl = new Map<string, SourceEntry>();
  const add = (source: SourceRef, needsVerification: boolean, usedFor: string) => {
    const hit = byUrl.get(source.url);
    if (hit) {
      if (!hit.usedFor.includes(usedFor)) hit.usedFor.push(usedFor);
      hit.needsVerification ||= needsVerification;
    } else {
      byUrl.set(source.url, { source, needsVerification, usedFor: [usedFor] });
    }
  };
  for (const v of view.variables) add(v.def.source, v.def.needsVerification, v.def.cumulativeLimit !== undefined ? `${v.def.label} career limit` : `${v.def.label} limit`);
  const label = (id: CabinVariableId) => view.variables.find((v) => v.def.id === id)?.def.label ?? id;
  for (const l of view.links) add(l.source, l.needsVerification, `${label(l.variable)}: ${l.effect}`);
  return [...byUrl.values()];
}
