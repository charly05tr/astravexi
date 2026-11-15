import { describe, expect, it } from 'vitest';
import type { AttributedReading } from '../../core/attribution/analyze';
import type { CabinVariableId, Verdict } from '../../core/attribution/model';
import type { ForecastAlert } from '../../core/forecast/alert';
import type { ZoneStatus } from '../../core/health/model';
import type { CabinAnalysisView, CabinVariableView } from '../../core/use-cases/cabin-analysis';
import { cabinKnowledge } from '../../knowledge';
import {
  buildAttention,
  chartDomain,
  collectSources,
  countItemsByVerdict,
  groupFindings,
  personHeadline,
  groupHeadline,
  hourlyRows,
  meterLayout,
  nearestIndex,
  niceTicks,
  outsideSince,
  rangeBreach,
  summarizeCabinNow,
  summarizeOutlook,
  summarizeRadiation,
  timeTicks,
} from './cabin-board-model';

const def = (id: CabinVariableId) => cabinKnowledge.variables.find((v) => v.id === id)!;

/** A 48 h trend on a 15-minute grid ending at `nowT`, with a constant value except where `at(t)` says otherwise. */
function trendOf(nowT: number, at: (t: number) => number) {
  const trendT = Array.from({ length: 192 }, (_, i) => nowT - (191 - i) * 15);
  return { trendT, trend: trendT.map(at) };
}

const NOW = 135 * 1440 + 360;

function variable(
  id: CabinVariableId,
  latest: number | null,
  status: ZoneStatus,
  extra: Partial<CabinVariableView> = {},
): CabinVariableView {
  const series = latest === null ? { trend: [], trendT: [] } : trendOf(NOW, () => latest);
  return { def: def(id), latest, status, forecast: [], forecastAlert: null, ...series, ...extra };
}

const alertOf = (variableId: 'co2' | 'cabinTemperature', horizonH: 1 | 3 | 6, side: 'above' | 'below' = 'above'): ForecastAlert => ({
  variable: variableId,
  horizonH,
  side,
  limit: variableId === 'co2' ? 3947 : 27,
});

function finding(over: Partial<AttributedReading> & { id: string; t: number }, excursion?: { variable?: CabinVariableId; fromT: number; toT: number }): AttributedReading {
  const link = cabinKnowledge.links.find((l) => l.variable === (excursion?.variable ?? 'cabinTemperature'))!;
  const exDef = def(excursion?.variable ?? 'cabinTemperature');
  return {
    profileId: over.id,
    name: `Person ${over.id}`,
    indicatorId: 'heartRate',
    indicatorLabel: 'Resting heart rate',
    unit: 'bpm',
    readingId: `r-${over.id}`,
    day: Math.floor(over.t / 1440) + 1,
    value: 72,
    verdict: 'likely-internal',
    reason: 'no-external-signal',
    personal: { status: 'outlier', value: 72, z: 4, direction: 'above', median: 62, scale: 2, n: 20 },
    crew: { status: 'individual', othersWithData: 2, deviating: 0, needed: 1, peers: [] },
    environment: excursion
      ? {
          status: 'linked-excursion',
          excursions: [{ variable: exDef.id, label: exDef.label, unit: exDef.unit, side: 'above', peak: 29, limit: 27, fromT: excursion.fromT, toT: excursion.toT, link }],
        }
      : { status: 'no-linked-excursion', checked: ['cabinTemperature'] },
    ...over,
    ...(excursion ? { verdict: over.verdict ?? 'likely-external', reason: 'crew-wide-and-linked-excursion' as const } : {}),
  };
}

function view(over: { variables?: CabinVariableView[]; findings?: AttributedReading[]; simulated?: boolean; members?: number } = {}): CabinAnalysisView {
  return {
    simulated: over.simulated ?? true,
    variables: over.variables ?? [variable('co2', 3000, 'none'), variable('cabinTemperature', 22, 'none'), variable('humidity', 45, 'none'), variable('radiationDose', 60, 'information')],
    analysis: { findings: over.findings ?? [], withoutBaseline: 0, membersAnalyzed: over.members ?? 3 },
    unavailable: [],
    spanDays: 30,
    nowT: NOW,
    links: cabinKnowledge.links,
    modelCard: {} as CabinAnalysisView['modelCard'],
  };
}

describe('summarizeCabinNow', () => {
  it('names the variable with the worst tier', () => {
    const v = view({ variables: [variable('co2', 3000, 'none'), variable('cabinTemperature', 28.4, 'caution'), variable('humidity', 28, 'notice'), variable('radiationDose', 60, 'information')] });
    const now = summarizeCabinNow(v);
    expect(now.status).toBe('caution');
    expect(now.driver?.def.id).toBe('cabinTemperature');
    expect(now.breach).toEqual({ zone: 'operating', side: 'above', limit: 27 });
  });

  it('says nothing is wrong when every variable is in range, and ignores the context-only dose', () => {
    const now = summarizeCabinNow(view());
    expect(now.status).toBe('none');
    expect(now.breach).toBeNull();
  });

  it('has no data in LIVE', () => {
    const live = view({ simulated: false, variables: [variable('co2', null, 'noData'), variable('radiationDose', null, 'noData')] });
    expect(summarizeCabinNow(live)).toEqual({ status: 'noData', driver: null, breach: null });
  });
});

describe('summarizeOutlook', () => {
  const point = { variable: 'co2' as const, horizonH: 3 as const, value: 3850, low: 3600, high: 4100 };

  it('reports the earliest alert across variables', () => {
    const v = view({
      variables: [
        variable('co2', 3800, 'none', { forecast: [point], forecastAlert: alertOf('co2', 3) }),
        variable('cabinTemperature', 26.5, 'none', { forecast: [{ ...point, variable: 'cabinTemperature', horizonH: 1 }], forecastAlert: alertOf('cabinTemperature', 1) }),
      ],
    });
    const out = summarizeOutlook(v);
    expect(out.kind === 'alert' && out.alert.horizonH).toBe(1);
    expect(out.kind === 'alert' && out.variable.def.id).toBe('cabinTemperature');
  });

  it('says no crossing is forecast when forecasts exist without alerts', () => {
    expect(summarizeOutlook(view({ variables: [variable('co2', 3000, 'none', { forecast: [point] })] })).kind).toBe('clear');
  });

  it('has no forecast without enabled horizons or in LIVE', () => {
    expect(summarizeOutlook(view()).kind).toBe('none');
    expect(summarizeOutlook(view({ simulated: false })).kind).toBe('none');
  });
});

describe('summarizeRadiation', () => {
  it('gives the share of the career limit', () => {
    const r = summarizeRadiation(view());
    expect(r).toMatchObject({ dose: 60, limit: 600, percent: 10 });
  });

  it('is null without data', () => {
    expect(summarizeRadiation(view({ variables: [variable('radiationDose', null, 'noData')] }))).toBeNull();
  });
});

describe('outsideSince', () => {
  const t = (n: number) => NOW - (3 - n) * 15;
  it('finds when the value last crossed into the range', () => {
    expect(outsideSince({ max: 27 }, [25, 28, 29, 30], [t(0), t(1), t(2), t(3)])).toEqual({ t: t(1), beforeWindow: false });
  });
  it('flags a breach that began before the window', () => {
    expect(outsideSince({ max: 27 }, [28, 29], [t(2), t(3)])).toEqual({ t: t(2), beforeWindow: true });
  });
  it('is null while the value is inside', () => {
    expect(outsideSince({ max: 27 }, [28, 25], [t(2), t(3)])).toBeNull();
  });
});

describe('rangeBreach', () => {
  it('tells the NASA limit from the comfort zone', () => {
    expect(rangeBreach(def('cabinTemperature'), 28)).toEqual({ zone: 'operating', side: 'above', limit: 27 });
    expect(rangeBreach(def('cabinTemperature'), 19)).toEqual({ zone: 'comfort', side: 'below', limit: 20 });
    expect(rangeBreach(def('cabinTemperature'), 22)).toBeNull();
  });
});

describe('groupFindings', () => {
  const ex = { fromT: 132 * 1440, toT: 132 * 1440 + 300 };

  it('merges likely-external findings that share an excursion into one group', () => {
    const items = groupFindings([finding({ id: 'a', t: ex.toT }, ex), finding({ id: 'b', t: ex.toT + 20 }, ex), finding({ id: 'c', t: ex.toT + 10 }, ex)], NOW);
    expect(items).toHaveLength(1);
    const g = items[0]!;
    expect(g.kind).toBe('group');
    if (g.kind !== 'group') return;
    expect(g.people).toBe(3);
    expect(g.findings.map((f) => f.id)).toEqual(['b', 'c', 'a']);
    expect(g.peak).toBe(29);
    expect(groupHeadline(g, 3)).toBe('Cabin temperature above 27 °C on Day 133 → resting heart rate up in 3 of 3 crew');
  });

  it('merges overlapping windows and keeps disjoint ones apart', () => {
    const late = { fromT: 140 * 1440, toT: 140 * 1440 + 200 };
    const items = groupFindings([
      finding({ id: 'a', t: ex.toT }, ex),
      finding({ id: 'b', t: ex.toT }, { fromT: ex.fromT + 100, toT: ex.toT + 100 }),
      finding({ id: 'c', t: late.toT }, late),
      finding({ id: 'd', t: late.toT }, late),
    ], NOW);
    expect(items.map((i) => i.kind)).toEqual(['group', 'group']);
    // Newest first.
    expect(items[0]!.id).toContain(`${late.fromT}`);
  });

  it('keeps a lone external finding, and every non-external finding, as a plain finding', () => {
    const items = groupFindings([finding({ id: 'a', t: ex.toT }, ex), finding({ id: 'b', t: 5, verdict: 'likely-internal' })], NOW);
    expect(items.map((i) => i.kind)).toEqual(['finding', 'finding']);
  });

  it('does not merge excursions of different variables', () => {
    const items = groupFindings([finding({ id: 'a', t: ex.toT }, ex), finding({ id: 'b', t: ex.toT }, { ...ex, variable: 'humidity' })], NOW);
    expect(items.every((i) => i.kind === 'finding')).toBe(true);
  });
});

describe('personal grouping', () => {
  const person = (id: string, t: number, over: Partial<AttributedReading> = {}) => finding({ id, t, profileId: 'p1', name: 'Demo astronaut', ...over });

  it('merges readings of one person and indicator into one item, newest first', () => {
    const items = groupFindings([person('a', 146 * 1440), person('b', 150 * 1440), person('c', 148 * 1440)], 153 * 1440);
    expect(items).toHaveLength(1);
    const p = items[0]!;
    expect(p.kind).toBe('person');
    if (p.kind !== 'person') return;
    expect(p.findings.map((f) => f.id)).toEqual(['b', 'c', 'a']);
    expect(personHeadline(p)).toBe('Demo astronaut · Resting heart rate above their usual on 3 readings, Day 147–151 (latest 72 bpm, usual 62 bpm)');
  });

  it('keeps different verdicts, indicators and people apart', () => {
    const items = groupFindings(
      [
        person('a', 1000),
        person('b', 1100),
        person('c', 1200, { verdict: 'possibly-external' }),
        person('d', 1300, { indicatorId: 'sleepHours', indicatorLabel: 'Sleep' }),
        person('e', 1400, { profileId: 'p2', name: 'Other' }),
      ],
      1500,
    );
    expect(items.map((i) => i.kind).sort()).toEqual(['finding', 'finding', 'finding', 'person']);
  });

  it('flags an item as ongoing when its latest reading is within 24 hours', () => {
    const recent = groupFindings([person('a', 5000), person('b', 5000 + 600)], 5000 + 600 + 1440)[0]!;
    const stale = groupFindings([person('a', 5000), person('b', 5000 + 600)], 5000 + 600 + 1441)[0]!;
    expect(recent.kind === 'person' && recent.ongoing).toBe(true);
    expect(stale.kind === 'person' && stale.ongoing).toBe(false);
    const single = groupFindings([person('z', 9000)], 9100)[0]!;
    expect(single.kind === 'finding' && single.ongoing).toBe(true);
  });

  it('orders items by their latest reading and counts items, not readings', () => {
    const v = view({ findings: [person('a', 100), person('b', 900), finding({ id: 'x', t: 500, profileId: 'p9' })] });
    expect(groupFindings(v.analysis.findings, NOW).map((i) => i.id)).toEqual(['person:p1|heartRate|likely-internal', 'x']);
    expect(countItemsByVerdict(v)['likely-internal']).toBe(2);
    expect(v.analysis.findings).toHaveLength(3);
  });
});

describe('buildAttention ordering', () => {
  const ex = { fromT: 132 * 1440, toT: 132 * 1440 + 300 };
  const findings = [
    finding({ id: 'old', t: 100 * 1440 }),
    finding({ id: 'new', t: 120 * 1440 }),
    finding({ id: 'x1', t: ex.toT }, ex),
    finding({ id: 'x2', t: ex.toT }, ex),
  ];
  const busy = view({
    findings,
    variables: [
      variable('co2', 3800, 'none', { forecastAlert: alertOf('co2', 3), forecast: [{ variable: 'co2', horizonH: 3, value: 3850, low: 3600, high: 4100 }] }),
      variable('cabinTemperature', 26, 'notice'),
      variable('humidity', 80, 'caution'),
      variable('radiationDose', 60, 'information'),
    ],
  });

  it('puts cabin variables by tier, then forecast alerts, then crew findings newest first', () => {
    const items = buildAttention(busy, null);
    expect(items.map((i) => (i.kind === 'cabin' ? `cabin:${i.variable.def.id}` : i.kind === 'forecast' ? 'forecast' : i.kind === 'group' ? 'group' : `finding:${i.id}`))).toEqual([
      'cabin:humidity',
      'cabin:cabinTemperature',
      'forecast',
      'group',
      'finding:new',
      'finding:old',
    ]);
  });

  it('keeps only crew findings of the chosen cause', () => {
    const items = buildAttention(busy, 'likely-internal');
    expect(items.map((i) => i.id)).toEqual(['new', 'old']);
    expect(buildAttention(busy, 'likely-external').map((i) => i.kind)).toEqual(['group']);
    expect(buildAttention(busy, 'insufficient-data' as Verdict)).toEqual([]);
  });

  it('is empty when nothing needs attention', () => {
    expect(buildAttention(view(), null)).toEqual([]);
  });

  it('says since when a cabin variable crossed its limit', () => {
    const { trend, trendT } = trendOf(NOW, (t) => (t >= NOW - 60 ? 28 : 25));
    const item = buildAttention(view({ variables: [variable('cabinTemperature', 28, 'caution', { trend, trendT })] }), null)[0]!;
    expect(item.kind).toBe('cabin');
    if (item.kind === 'cabin') expect(item.sinceT).toBe(NOW - 60);
  });
});

describe('meterLayout', () => {
  it('starts a one-sided limit at zero and places the marker and the reference', () => {
    const l = meterLayout(def('co2'), 3800, 2986);
    expect(l.domain[0]).toBe(0);
    expect(l.operating).toEqual({ from: 0, to: expect.closeTo(3947 / l.domain[1], 5) });
    expect(l.marker).toBeCloseTo(3800 / l.domain[1], 5);
    expect(l.reference).toBeCloseTo(2986 / l.domain[1], 5);
    expect(l.comfort).toBeNull();
  });

  it('pads a two-sided range and keeps the comfort band inside the operating band', () => {
    const l = meterLayout(def('cabinTemperature'), 22);
    expect(l.operating!.from).toBeGreaterThan(0);
    expect(l.comfort!.from).toBeGreaterThan(l.operating!.from);
    expect(l.comfort!.to).toBeLessThan(l.operating!.to);
  });

  it('keeps an out-of-range marker on the track', () => {
    const l = meterLayout(def('cabinTemperature'), 40);
    expect(l.marker).toBeLessThanOrEqual(1);
  });
});

describe('chart scales', () => {
  it('rounds ticks to clean numbers', () => {
    expect(niceTicks(0, 100, 4)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(2900, 4100, 4)).toEqual([3000, 3500, 4000]);
  });

  it('includes the NASA limit in the value axis', () => {
    const [lo, hi] = chartDomain(def('co2'), [3000, 3200]);
    expect(hi).toBeGreaterThan(3947);
    expect(lo).toBeLessThan(3000);
  });

  it('ticks every 12 hours on the mission clock and finds the nearest sample', () => {
    expect(timeTicks(0, 1500)).toEqual([0, 720, 1440]);
    expect(nearestIndex([0, 15, 30], 22)).toBe(1);
  });

  it('keeps one row per hour for the table view, plus the latest sample', () => {
    const { trend, trendT } = trendOf(NOW, (t) => t);
    const rows = hourlyRows(trend, trendT);
    expect(rows.length).toBeGreaterThanOrEqual(48);
    expect(rows[rows.length - 1]!.t).toBe(NOW);
    expect(rows.slice(0, -1).every((r) => r.t % 60 === 0)).toBe(true);
  });
});

describe('collectSources', () => {
  it('lists each citation once, with everything it backs', () => {
    const sources = collectSources(view());
    const urls = sources.map((s) => s.source.url);
    expect(new Set(urls).size).toBe(urls.length);
    const ochmo = sources.find((s) => s.source.url.includes('ochmo-tb-002'))!;
    expect(ochmo.usedFor).toEqual(expect.arrayContaining(['Cabin temperature limit', 'Relative humidity limit']));
    expect(sources.some((s) => s.usedFor.some((u) => u.startsWith('Radiation dose') && u.includes('career limit')))).toBe(true);
    expect(urls).toContain('https://ntrs.nasa.gov/citations/19940029146');
  });
});
