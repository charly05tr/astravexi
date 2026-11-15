import { describe, expect, it } from 'vitest';
import type { Indicator, Reading } from '../health/model';
import { analyzeCabinAndCrew } from './analyze';
import { assessCrewCooccurrence } from './crew-cooccurrence';
import type { PeerSignal } from './crew-cooccurrence';
import { assessEnvironmentLink } from './environment-link';
import type { AttributionConfig, CabinKnowledge, CabinSample } from './model';
import { assessPersonalDeviation, median } from './personal-deviation';
import { decideVerdict } from './verdict';
import { assessVariable } from './variable-status';

const DAY = 1440;
const config: AttributionConfig = {
  minBaselineReadings: 5,
  outlierZ: 3,
  crewZ: 2,
  crewMinOthers: 2,
  crewFraction: 0.5,
  crewWindowMin: 720,
  baselineWindowMin: 28 * DAY,
  spreadFloor: { sleepHours: 0.25, phq2: 0.5, heartRate: 1, temperature: 0.1, bpSystolic: 3, bpDiastolic: 2, glucose: 5 },
};
const source = { label: 'test', url: 'https://example.org', kind: 'primary' as const };
const cabin: CabinKnowledge = {
  config,
  variables: [
    { id: 'cabinTemperature', label: 'Cabin temperature', unit: '°C', operating: { min: 18, max: 27 }, comfort: { min: 20, max: 25 }, contextOnly: false, source, needsVerification: false, note: '' },
    { id: 'radiationDose', label: 'Radiation dose', unit: 'mSv', operating: null, comfort: null, cumulativeLimit: 600, contextOnly: true, source, needsVerification: false, note: '' },
  ],
  links: [
    { variable: 'cabinTemperature', indicatorId: 'heartRate', lagMin: 360, excursionSide: 'above', outlierDirection: 'above', effect: 'heat raises HR', source, needsVerification: false },
  ],
};

const flat = (n: number, value: number, t0 = 0) => Array.from({ length: n }, (_, i) => ({ t: t0 + i * DAY, value }));

describe('personal deviation', () => {
  it('has no verdict below the minimum baseline: never a guess', () => {
    const r = assessPersonalDeviation(flat(4, 62), { t: 10 * DAY, value: 90 }, config, 1);
    expect(r).toEqual({ status: 'insufficient-baseline', n: 4, required: 5 });
  });

  it('flags a reading far from the person own median and excludes the reading itself', () => {
    const history = [...flat(6, 62), { t: 6 * DAY, value: 80 }]; // the reading itself is in the series
    const r = assessPersonalDeviation(history, { t: 6 * DAY, value: 80 }, config, 1);
    expect(r).toMatchObject({ status: 'outlier', direction: 'above', median: 62, n: 6 });
  });

  it('treats a reading near the median as typical, and uses the floor on a flat history', () => {
    const r = assessPersonalDeviation(flat(8, 62), { t: 9 * DAY, value: 63 }, config, 1);
    expect(r).toMatchObject({ status: 'typical', z: 1, scale: 1 });
  });

  it('is robust to an earlier outlier in the baseline', () => {
    const history = [...flat(8, 62), { t: 8 * DAY, value: 120 }];
    const r = assessPersonalDeviation(history, { t: 9 * DAY, value: 70 }, config, 1);
    expect(r).toMatchObject({ status: 'outlier', median: 62 });
  });

  it('ignores prior readings older than the baseline window', () => {
    const r = assessPersonalDeviation(flat(6, 62), { t: 100 * DAY, value: 62 }, config, 1);
    expect(r.status).toBe('insufficient-baseline');
  });

  it('computes medians', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('crew co-occurrence', () => {
  const dev = (z: number): PeerSignal['deviation'] => ({ status: Math.abs(z) >= 3 ? 'outlier' : 'typical', value: 0, z, direction: z > 0 ? 'above' : 'below', median: 0, scale: 1, n: 10 });
  const peer = (id: string, deviation: PeerSignal['deviation']): PeerSignal => ({ profileId: id, name: id, deviation });

  it('is crew-wide when at least half (and at least two) of the others move the same way', () => {
    const r = assessCrewCooccurrence(5, [peer('a', dev(4)), peer('b', dev(2.5))], config);
    expect(r).toMatchObject({ status: 'crew-wide', deviating: 2, othersWithData: 2 });
  });

  it('is individual when the others stay put or move the other way', () => {
    expect(assessCrewCooccurrence(5, [peer('a', dev(0.5)), peer('b', dev(-4))], config).status).toBe('individual');
    expect(assessCrewCooccurrence(5, [peer('a', dev(4)), peer('b', dev(0.2))], config).status).toBe('individual');
  });

  it('needs two other crewmates with data', () => {
    const r = assessCrewCooccurrence(5, [peer('a', dev(4)), peer('b', null), peer('c', { status: 'insufficient-baseline', n: 2, required: 5 })], config);
    expect(r).toMatchObject({ status: 'insufficient-crew-data', othersWithData: 1 });
    expect(assessCrewCooccurrence(5, [], config).status).toBe('insufficient-crew-data');
  });

  it('needs at least half with four others', () => {
    const peers = [peer('a', dev(3)), peer('b', dev(3)), peer('c', dev(0)), peer('d', dev(0))];
    expect(assessCrewCooccurrence(5, peers, config)).toMatchObject({ status: 'crew-wide', needed: 2 });
    expect(assessCrewCooccurrence(5, [peers[0]!, peer('x', dev(0)), peer('y', dev(0)), peer('z', dev(0))], config).status).toBe('individual');
  });
});

describe('environmental link', () => {
  const hot = (t: number, v = 28.5): CabinSample => ({ t, values: { cabinTemperature: v } });
  const nominalSamples = (from: number, to: number): CabinSample[] => {
    const out: CabinSample[] = [];
    for (let t = from; t <= to; t += 15) out.push({ t, values: { cabinTemperature: 22.5 } });
    return out;
  };

  it('finds an excursion above the NASA limit inside the lag window with a documented link', () => {
    const r = assessEnvironmentLink('heartRate', 1000, 'above', [hot(900), hot(950, 29)], cabin);
    expect(r.status).toBe('linked-excursion');
    if (r.status === 'linked-excursion') {
      expect(r.excursions[0]).toMatchObject({ variable: 'cabinTemperature', side: 'above', peak: 29, limit: 27, fromT: 900, toT: 950 });
      expect(r.excursions[0]!.link.source.url).toBe(source.url);
    }
  });

  it('ignores an excursion outside the lag window', () => {
    expect(assessEnvironmentLink('heartRate', 1000, 'above', [hot(100), ...nominalSamples(900, 1000)], cabin).status).toBe('no-linked-excursion');
  });

  it('requires the reading to deviate the way the link says', () => {
    expect(assessEnvironmentLink('heartRate', 1000, 'below', [hot(990)], cabin).status).toBe('no-documented-link');
  });

  it('has no documented link for an indicator without one, even during an excursion', () => {
    expect(assessEnvironmentLink('bpSystolic', 1000, 'above', [hot(990)], cabin).status).toBe('no-documented-link');
  });

  it('reports no data without cabin samples (LIVE) or without samples in the window', () => {
    expect(assessEnvironmentLink('heartRate', 1000, 'above', null, cabin).status).toBe('no-data');
    expect(assessEnvironmentLink('heartRate', 1000, 'above', nominalSamples(5000, 5100), cabin).status).toBe('no-data');
  });

  it('never lets radiation dose explain a reading: it has no operating limit and no link', () => {
    const dose: CabinSample[] = [{ t: 990, values: { radiationDose: 9999 } }];
    expect(assessEnvironmentLink('heartRate', 1000, 'above', dose, cabin).status).toBe('no-data');
    expect(cabin.links.some((l) => l.variable === 'radiationDose')).toBe(false);
  });
});

describe('verdict', () => {
  const outlier = { status: 'outlier', value: 70, z: 8, direction: 'above', median: 62, scale: 1, n: 20 } as const;
  const wide = { status: 'crew-wide', othersWithData: 2, deviating: 2, needed: 2, peers: [] } as const;
  const individual = { status: 'individual', othersWithData: 2, deviating: 0, needed: 2, peers: [] } as const;
  const noCrew = { status: 'insufficient-crew-data', othersWithData: 0, required: 2, peers: [] } as const;
  const linked = { status: 'linked-excursion', excursions: [] } as const;
  const clear = { status: 'no-linked-excursion', checked: ['cabinTemperature'] } as const;
  const noLink = { status: 'no-documented-link' } as const;
  const noEnv = { status: 'no-data', variables: ['cabinTemperature'] } as const;

  it('likely external: crew-wide and a linked excursion', () => {
    expect(decideVerdict(outlier, wide, linked)).toEqual({ verdict: 'likely-external', reason: 'crew-wide-and-linked-excursion' });
  });
  it('possibly external: only the linked excursion (individual susceptibility)', () => {
    expect(decideVerdict(outlier, individual, linked)).toEqual({ verdict: 'possibly-external', reason: 'linked-excursion-individual-susceptibility' });
  });
  it('possibly external: only crew-wide, nothing monitored explains it', () => {
    expect(decideVerdict(outlier, wide, clear)).toEqual({ verdict: 'possibly-external', reason: 'crew-wide-no-monitored-excursion' });
    expect(decideVerdict(outlier, wide, noLink).reason).toBe('crew-wide-no-monitored-excursion');
    expect(decideVerdict(outlier, wide, noEnv).reason).toBe('crew-wide-environment-unknown');
  });
  it('possibly external: a linked excursion with no crew data', () => {
    expect(decideVerdict(outlier, noCrew, linked)).toEqual({ verdict: 'possibly-external', reason: 'linked-excursion-crew-unknown' });
  });
  it('likely internal: neither signal, both known', () => {
    expect(decideVerdict(outlier, individual, clear)).toEqual({ verdict: 'likely-internal', reason: 'no-external-signal' });
    expect(decideVerdict(outlier, individual, noLink).verdict).toBe('likely-internal');
  });
  it('insufficient data: too little personal history', () => {
    expect(decideVerdict({ status: 'insufficient-baseline', n: 2, required: 5 }, wide, linked)).toEqual({ verdict: 'insufficient-data', reason: 'insufficient-baseline' });
  });
  it('insufficient data: a negative that cannot be confirmed is never "internal"', () => {
    expect(decideVerdict(outlier, noCrew, clear)).toEqual({ verdict: 'insufficient-data', reason: 'insufficient-crew-data' });
    expect(decideVerdict(outlier, individual, noEnv)).toEqual({ verdict: 'insufficient-data', reason: 'no-environment-data' });
  });
});

describe('variable status', () => {
  const [temp, dose] = cabin.variables;
  it('is a tier: inside, outside comfort, outside the NASA limit', () => {
    expect(assessVariable(temp!, 22)).toBe('none');
    expect(assessVariable(temp!, 26)).toBe('notice');
    expect(assessVariable(temp!, 28)).toBe('caution');
    expect(assessVariable(temp!, 17)).toBe('caution');
  });
  it('shows no data without a value, and dose as context', () => {
    expect(assessVariable(temp!, null)).toBe('noData');
    expect(assessVariable(dose!, 75)).toBe('information');
  });
});

describe('analyzeCabinAndCrew', () => {
  const hr: Indicator = { id: 'heartRate', label: 'Heart rate', unit: 'bpm', unitScale: 1, min: 30, max: 200, howToMeasure: '', privacy: 'shareable', signal: 'hr', contextAware: true, staleAfterDays: 2 };
  const reading = (id: string, day: number, value: number, context: Reading['context'] = 'rest'): Reading => ({
    id, indicatorId: 'heartRate', value, day, t: (day - 1) * DAY + 360, source: 'SYNTHETIC', context, symptomatic: false, groupId: `g${day}`,
  });
  const history = (who: string, spikes: Record<number, number> = {}) =>
    Array.from({ length: 12 }, (_, i) => reading(`${who}-${i + 1}`, i + 1, 62 + (i % 2) + (spikes[i + 1] ?? 0)));
  const members = (spikes: Record<string, Record<number, number>>) =>
    ['a', 'b', 'c'].map((id) => ({ profileId: id, name: id.toUpperCase(), readings: history(id, spikes[id] ?? {}) }));
  /** A nominal cabin for 20 days, hot (29 C) from 03:20 to 07:00 of `heatDay` when given. */
  const cabinSamples = (heatDay?: number): CabinSample[] => {
    const out: CabinSample[] = [];
    for (let t = 0; t <= 20 * DAY; t += 15) {
      const hot = heatDay !== undefined && t >= (heatDay - 1) * DAY + 200 && t <= (heatDay - 1) * DAY + 420;
      out.push({ t, values: { cabinTemperature: hot ? 29 : 22 } });
    }
    return out;
  };
  const base = { indicators: [hr], cabin, fromT: 0, toT: 20 * DAY };

  it('produces likely external for a crew-wide rise during a cabin excursion', () => {
    const out = analyzeCabinAndCrew({ ...base, members: members({ a: { 10: 9 }, b: { 10: 9 }, c: { 10: 9 } }), samples: cabinSamples(10) });
    expect(out.findings).toHaveLength(3);
    expect(out.findings.every((f) => f.verdict === 'likely-external')).toBe(true);
  });

  it('produces likely internal for one person with a nominal cabin', () => {
    const out = analyzeCabinAndCrew({ ...base, members: members({ c: { 10: 10 } }), samples: cabinSamples() });
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]).toMatchObject({ name: 'C', verdict: 'likely-internal' });
  });

  it('produces possibly external for one person during a cabin excursion', () => {
    const out = analyzeCabinAndCrew({ ...base, members: members({ b: { 10: 10 } }), samples: cabinSamples(10) });
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]).toMatchObject({ verdict: 'possibly-external', reason: 'linked-excursion-individual-susceptibility' });
  });

  it('produces possibly external for a crew-wide rise with a nominal cabin', () => {
    const out = analyzeCabinAndCrew({ ...base, members: members({ a: { 10: 9 }, b: { 10: 9 }, c: { 10: 9 } }), samples: cabinSamples() });
    expect(out.findings.every((f) => f.reason === 'crew-wide-no-monitored-excursion')).toBe(true);
  });

  it('gives insufficient data without cabin data and without enough crew', () => {
    const solo = analyzeCabinAndCrew({ ...base, members: members({ a: { 10: 9 } }).slice(0, 1), samples: null });
    expect(solo.findings[0]).toMatchObject({ verdict: 'insufficient-data', reason: 'insufficient-crew-data' });
    const live = analyzeCabinAndCrew({ ...base, members: members({ c: { 10: 10 } }), samples: null });
    expect(live.findings[0]).toMatchObject({ verdict: 'insufficient-data', reason: 'no-environment-data' });
  });

  it('counts readings without enough history instead of judging them', () => {
    const short = [{ profileId: 'a', name: 'A', readings: history('a').slice(0, 4) }];
    const out = analyzeCabinAndCrew({ ...base, members: short, samples: null });
    expect(out.findings).toHaveLength(0);
    expect(out.withoutBaseline).toBe(4);
  });

  it('skips exercise readings of a context-aware indicator', () => {
    const m = members({});
    m[0]!.readings = [...m[0]!.readings, reading('a-ex', 11, 150, 'exercise')];
    expect(analyzeCabinAndCrew({ ...base, members: m, samples: null }).findings).toHaveLength(0);
  });
});
