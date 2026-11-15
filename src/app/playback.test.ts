import { describe, expect, it } from 'vitest';
import type { VerdictReason } from '../core/attribution/model';
import { MINUTES_PER_DAY, missionTimeLabel } from '../core/playback/timeline';
import { CATALOG, REASON_CLASS } from '../eval/scenario-instance';
import { createFakeScheduler } from '../test-support/fake-scheduler';
import { createTestWorld } from '../test-support/compose';
import { loadDemoScenario } from './demo/demo-scenario';
import { SHOWCASE, SHOWCASE_ID } from './demo/showcase';
import type { Role } from '../core/profiles/model';

const CREW = ['Demo astronaut', 'Demo astronaut 2', 'Demo astronaut 3'];

async function open(role: Role = 'cmo', scenarioId = SHOWCASE_ID) {
  const world = createTestWorld();
  const fake = createFakeScheduler();
  const scenario = loadDemoScenario(scenarioId)!;
  await world.profileSession('demo'); // seeds the demo crew profiles
  const app = await world.app('demo', { role, scenario, playback: { scheduler: fake.scheduler } });
  const adapters = app.adapters;
  if (adapters.mode !== 'demo' || !adapters.playback) throw new Error('playback expected');
  return { world, fake, scenario, store: app.store, playback: adapters.playback };
}

describe('showcase scenario', () => {
  it('is separate from the frozen evaluation catalog and chains four events with normal days between them', () => {
    expect(CATALOG.scenarioTypes.some((t) => t.id === SHOWCASE_ID)).toBe(false);
    const { events, startT, endT } = loadDemoScenario(SHOWCASE_ID)!.playback;
    expect(events.map((e) => e.truth)).toEqual(['environmental', 'individual', 'environmental', 'shared']);
    expect((endT + 1 - startT) / MINUTES_PER_DAY).toBe(SHOWCASE.judgedDays);
    for (let i = 1; i < events.length; i += 1) expect(events[i]!.startT - events[i - 1]!.endT).toBeGreaterThanOrEqual(2 * MINUTES_PER_DAY);
    expect(startT).toBe((SHOWCASE.firstDay + SHOWCASE.warmupDays - 1) * MINUTES_PER_DAY);
  });

  it('injects clearly visible effects (at least 4 SD) and says so in its description', () => {
    for (const e of SHOWCASE.events) for (const a of e.anomalies) expect(a.magnitudeSd).toBeGreaterThanOrEqual(4);
    expect(SHOWCASE.description).toMatch(/5 SD/);
    expect(SHOWCASE.description).toMatch(/not part of the engine evaluation/i);
  });

  it('gives every evaluation scenario a playback span too', () => {
    const heat = loadDemoScenario('cabin-heat-crew')!.playback;
    expect(heat.events).toHaveLength(1);
    expect(heat.events[0]!.truth).toBe('environmental');
    expect(heat.initialT).toBeGreaterThan(heat.startT);
    expect(loadDemoScenario('no-anomaly')!.playback.events).toEqual([]);
  });
});

describe('visible state at mission time t', () => {
  const T1 = (SHOWCASE.firstDay + SHOWCASE.warmupDays + 4) * MINUTES_PER_DAY + 9 * 60; // day 153, 09:00 (after the heat event)
  const T2 = T1 + 9 * MINUTES_PER_DAY;

  it('shows no crew reading, cabin sample, forecast or finding stamped after t, anywhere', async () => {
    const { store, playback } = await open();
    for (const t of [T1, T2, T1 + 123, playback.span.endT]) {
      await playback.seek(t);
      const s = store.getState();
      expect(s.session!.synthetic.every((r) => r.t <= t)).toBe(true);
      const review = await s.loadCrew();
      expect(review.members.length).toBe(3);
      for (const m of review.members) {
        expect(m.readings.every((r) => r.t <= t), `${m.name} readings at ${missionTimeLabel(t)}`).toBe(true);
        expect(m.lastReadingT!).toBeLessThanOrEqual(t);
      }
      const view = await s.loadCabinAnalysis();
      expect(view.nowT).toBe(t);
      expect(view.analysis.findings.every((f) => f.t <= t)).toBe(true);
      for (const v of view.variables) expect(Math.max(...v.trendT)).toBeLessThanOrEqual(t);
    }
  });

  it('is monotonic in t and exact when seeking back: the same t always shows the same readings and findings', async () => {
    const { store, playback } = await open();
    const idsAt = async (t: number) => {
      await playback.seek(t);
      return store.getState().session!.synthetic.map((r) => r.id).sort();
    };
    const early = await idsAt(T1);
    const late = await idsAt(T2);
    expect(late.length).toBeGreaterThan(early.length);
    expect(early.every((id) => late.includes(id))).toBe(true);
    const findingsLate = JSON.stringify((await store.getState().loadCabinAnalysis()).analysis.findings);
    expect(await idsAt(T1)).toEqual(early); // seeking back hides the later readings again
    expect((await store.getState().loadCabinAnalysis()).analysis.findings.every((f) => f.t <= T1)).toBe(true);
    await playback.seek(T2);
    expect(JSON.stringify((await store.getState().loadCabinAnalysis()).analysis.findings)).toBe(findingsLate);
  });

  it('hides a check-in recorded in the future once the clock goes back, and brings it back when it catches up', async () => {
    const { store, playback } = await open('astronaut');
    await playback.seek(T2);
    const out = await store.getState().submitCheckIn({ values: { heartRate: 71 }, context: 'rest', symptomatic: false });
    expect(out.ok).toBe(true);
    expect(store.getState().session!.manual.filter((r) => r.indicatorId === 'heartRate')).toHaveLength(1);
    await playback.seek(T1);
    expect(store.getState().session!.manual).toHaveLength(0);
    await playback.seek(T2);
    expect(store.getState().session!.manual).toHaveLength(1);
  });
});

describe('what the engine shows for each showcase event (production engine)', () => {
  /** After each event: the first finding of every affected (person, indicator) has the expected class. */
  const expectations = [
    { id: 'cabin-heat', people: [0, 1, 2], indicators: ['heartRate', 'temperature'], cls: 'environmental' },
    { id: 'fever', people: [1], indicators: ['temperature'], cls: 'individual' },
    { id: 'co2-sleep', people: [0, 2], indicators: ['sleepHours'], cls: 'environmental' },
    { id: 'shared-sleep', people: [0, 1, 2], indicators: ['sleepHours'], cls: 'shared' },
  ] as const;

  it.each(expectations)('$id is classed $cls for every affected person', async ({ id, people, indicators, cls }) => {
    const { store, playback } = await open();
    const ev = playback.span.events.find((e) => e.id === id)!;
    await playback.seek(ev.endT + 60);
    const { analysis } = await store.getState().loadCabinAnalysis();
    for (const p of people) {
      for (const indicator of indicators) {
        const first = analysis.findings
          .filter((f) => f.name === CREW[p] && f.indicatorId === indicator && f.t >= ev.startT && f.t < ev.endT + 60)
          .sort((a, b) => a.t - b.t)[0];
        expect(first, `${id} ${CREW[p]} ${indicator}`).toBeDefined();
        expect(REASON_CLASS[first!.reason as VerdictReason], `${id} ${CREW[p]} ${indicator}`).toBe(cls);
      }
    }
  });

  it('puts the Cabin now tile out of limits during the CO2 and heat events and back within limits on a normal day', async () => {
    const { store, playback } = await open();
    const events = playback.span.events;
    await playback.seek(events[2]!.endT - 24 * 60 + 5 * 60); // day 163, 05:00: the CO2 excursion runs until 07:30
    let view = await store.getState().loadCabinAnalysis();
    expect(view.variables.find((v) => v.def.id === 'co2')!.status).toBe('caution');
    await playback.seek(events[0]!.endT - 24 * 60 + 5 * 60); // day 153, 05:00
    view = await store.getState().loadCabinAnalysis();
    expect(view.variables.find((v) => v.def.id === 'cabinTemperature')!.status).toBe('caution');
    await playback.seek(events[1]!.startT - MINUTES_PER_DAY + 12 * 60); // a normal day
    view = await store.getState().loadCabinAnalysis();
    expect(view.variables.filter((v) => !v.def.contextOnly).every((v) => v.status === 'none')).toBe(true);
  });
});

describe('playback controller', () => {
  it('plays at the chosen speed, pauses, and stops by itself at the end', async () => {
    const { fake, playback } = await open();
    const { startT, endT } = playback.span;
    await playback.seek(startT);
    playback.setSpeed('1h');
    playback.play();
    await fake.run(10_000);
    expect(playback.store.getState().t).toBeGreaterThanOrEqual(startT + 590);
    expect(playback.store.getState().t).toBeLessThanOrEqual(startT + 610);
    expect(playback.clock.now()).toBeGreaterThan(startT + 500); // the app followed
    playback.pause();
    const at = playback.store.getState().t;
    await fake.run(2_000);
    expect(playback.store.getState().t).toBe(at);
    expect(playback.store.getState().playing).toBe(false);

    await playback.seek(endT - 60);
    playback.setSpeed('6h');
    playback.play();
    await fake.run(1_000);
    expect(playback.store.getState().t).toBe(endT);
    expect(playback.store.getState().playing).toBe(false);
    expect(playback.clock.now()).toBe(endT);
  });

  it('re-evaluates the app at most every 250 ms real time, even at 6 h/s', async () => {
    const { fake, playback } = await open();
    await playback.seek(playback.span.startT);
    const before = playback.metrics.commits;
    playback.setSpeed('6h');
    playback.play();
    await fake.run(5_000);
    playback.pause();
    const commits = playback.metrics.commits - before;
    expect(commits).toBeGreaterThan(5);
    expect(commits).toBeLessThanOrEqual(5_000 / 250 + 2);
  });

  it('steps to the previous and next reading, by an hour, and restarts', async () => {
    const { playback } = await open();
    const { readingTimes, initialT } = playback.span;
    await playback.seek(readingTimes[100]! + 3);
    await playback.step(1);
    expect(playback.store.getState().t).toBe(readingTimes[101]);
    await playback.step(-1);
    expect(playback.store.getState().t).toBe(readingTimes[100]);
    await playback.stepMinutes(60);
    expect(playback.store.getState().t).toBe(readingTimes[100]! + 60);
    expect(playback.clock.now()).toBe(readingTimes[100]! + 60);
    await playback.restart();
    expect(playback.store.getState().t).toBe(initialT);
    expect(playback.store.getState().playing).toBe(false);
  });

  it('announces only throttled, de-duplicated notable changes', async () => {
    const { fake, playback } = await open();
    playback.announce('Cabin now changed to Caution.');
    expect(playback.store.getState().announcement).toBe('Cabin now changed to Caution.');
    playback.announce('2 new items need attention.');
    playback.announce('3 new items need attention.');
    expect(playback.store.getState().announcement).toBe('Cabin now changed to Caution.'); // too soon
    await fake.run(3_100);
    expect(playback.store.getState().announcement).toBe('3 new items need attention.'); // only the latest survives
  });
});
