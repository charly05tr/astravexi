import type { DemoClockPosition } from '../../adapters/demo-clock';
import { createSimulatedCabinTimeline } from '../../adapters/seeded-history/cabin-timeline';
import type { Reading } from '../../core/health/model';
import type { PlaybackSpan, ScriptedEvent } from '../../core/playback/timeline';
import type { HistorySource, SimulatedCabinTimeline } from '../../core/ports';
import { CATALOG, buildScenario, catalogSeeds } from '../../eval/scenario-instance';
import { DEMO_ASTRONAUT_ID, DEMO_CREW_EXTRAS } from './demo-profiles';
import { SHOWCASE, SHOWCASE_ID, buildShowcase } from './showcase';

const MINUTES_PER_DAY = 1440;
/** Minutes after the last affected reading at which a scenario with a cabin excursion starts. */
const START_MARGIN_MIN = 5;

/** What the UI shows about the loaded scenario. */
export interface DemoScenarioInfo {
  id: string;
  name: string;
  description: string;
  seed: number;
}

/** A scenario of the engine evaluation, ready to run inside the DEMO session. */
export interface DemoScenario extends DemoScenarioInfo {
  /** The DEMO clock starts here (and Reset demo returns here): just after the injected anomaly. */
  clock: DemoClockPosition;
  timeline: SimulatedCabinTimeline;
  /** What the playback bar scrubs: the judged span, the scripted events and the reading times. */
  playback: PlaybackSpan;
  /**
   * Synthetic history of one crew member (0 = demo astronaut, 1 and 2 = the extra demo crew). With `visibleT`
   * (playback) a reading stamped after that mission minute does not exist yet, so seeking back hides it again.
   */
  historyFor(personIndex: number, visibleT?: () => number): HistorySource;
}

/** Scenario types selectable in DEMO, in catalog order. */
export const DEMO_SCENARIO_LIST: readonly DemoScenarioInfo[] = CATALOG.scenarioTypes.map((t) => ({
  id: t.id,
  name: t.name,
  description: t.description,
  seed: catalogSeeds()[CATALOG.demoSeedIndex]!,
}));

/** The presentation scenario, listed first in the picker; it is not an evaluation scenario. */
export const SHOWCASE_INFO: DemoScenarioInfo = { id: SHOWCASE.id, name: SHOWCASE.name, description: SHOWCASE.description, seed: SHOWCASE.seed };

/** What the scenario picker offers: the showcase, then the evaluation scenarios. */
export const DEMO_PICKER_LIST: readonly DemoScenarioInfo[] = [SHOWCASE_INFO, ...DEMO_SCENARIO_LIST];

/** Position of a DEMO profile in the simulated crew; -1 for a profile that is not part of it. */
export function crewIndexOf(profileId: string): number {
  if (profileId === DEMO_ASTRONAUT_ID) return 0;
  return DEMO_CREW_EXTRAS.findIndex((c) => c.id === profileId) + 1 || -1;
}

/**
 * Builds one evaluation scenario for the DEMO session. The clock is put on the last day of the injected event. With a
 * cabin excursion it sits inside the excursion, `START_MARGIN_MIN` minutes after the last affected reading, so the
 * "Cabin now" tile is out of limits (traffic light) and the affected crew findings are listed (alert). The clock does not run
 * by itself: the playback bar (play, pause, step, seek) moves it. Without an excursion it starts just after the last
 * injected reading, or 12 days into the judged span when nothing is injected.
 */
export function loadDemoScenario(id: string, seed?: number): DemoScenario | null {
  if (id === SHOWCASE_ID) return loadShowcase(seed);
  const type = CATALOG.scenarioTypes.find((t) => t.id === id);
  if (!type) return null;
  const chosen = seed !== undefined && catalogSeeds().includes(seed) ? seed : catalogSeeds()[CATALOG.demoSeedIndex]!;
  const instance = buildScenario(type.id, chosen);

  const day = instance.endDay ?? CATALOG.firstDay + CATALOG.warmupDays + 12;
  const lastAffectedReadings = instance.people.flatMap((p) => p.readings.filter((r) => r.day === day && instance.anomalies.some((a) => a.indicatorId === r.indicatorId)));
  const stampedBy = lastAffectedReadings.reduce((m, r) => Math.max(m, r.t + 1), 0);
  // With a cabin excursion the clock sits inside it, just after the last affected reading (the largest margin that still
  // lists every affected reading); without one, just after the last injected reading.
  const minute = instance.cabinEpisodes.length > 0 ? stampedBy + START_MARGIN_MIN : Math.max((day - 1) * MINUTES_PER_DAY + 7 * 60 + 29, stampedBy);

  const byPerson = instance.people.map((p) => p.readings);
  const events: ScriptedEvent[] =
    instance.onsetDay !== null && instance.endDay !== null
      ? [
          {
            id: type.id,
            name: type.name,
            startT: (instance.onsetDay - 1) * MINUTES_PER_DAY,
            endT: instance.endDay * MINUTES_PER_DAY,
            truth: instance.cabinEpisodes.length > 0 ? 'environmental' : (instance.anomalies[0]?.truth ?? 'individual'),
          },
        ]
      : [];
  return assemble({ id: type.id, name: type.name, description: type.description, seed: chosen }, { day, minute }, createSimulatedCabinTimeline(chosen, instance.cabinEpisodes), byPerson, {
    startT: instance.fromT,
    endT: instance.toT,
    initialT: minute,
    events,
  });
}

/** The presentation scenario (`?scenario=showcase`): see showcase.json. Not part of the engine evaluation. */
function loadShowcase(seed?: number): DemoScenario {
  const instance = buildShowcase(seed ?? SHOWCASE.seed);
  const minute = instance.startT + SHOWCASE.initialHour * 60;
  return assemble(
    { id: SHOWCASE.id, name: SHOWCASE.name, description: SHOWCASE.description, seed: instance.seed },
    { day: Math.floor(minute / MINUTES_PER_DAY) + 1, minute },
    createSimulatedCabinTimeline(instance.seed, instance.cabinEpisodes),
    instance.people.map((p) => p.readings),
    { startT: instance.startT, endT: instance.endT, initialT: minute, events: instance.events },
  );
}

function assemble(
  info: DemoScenarioInfo,
  clock: DemoClockPosition,
  timeline: SimulatedCabinTimeline,
  byPerson: Reading[][],
  span: Omit<PlaybackSpan, 'readingTimes'>,
): DemoScenario {
  const readingTimes = [...new Set(byPerson.flat().map((r) => r.t))].filter((t) => t >= span.startT && t <= span.endT).sort((a, b) => a - b);
  return {
    ...info,
    clock,
    timeline,
    playback: { ...span, readingTimes },
    historyFor(personIndex, visibleT): HistorySource {
      const readings: readonly Reading[] = byPerson[personIndex] ?? [];
      return { generate: (_seed, throughDay) => readings.filter((r) => r.day <= throughDay && (visibleT === undefined || r.t <= visibleT())) };
    },
  };
}

/** `?scenario=<id>` (and optional `&seed=<n>`), or null when the URL names no known scenario. */
export function scenarioFromSearch(search: string): DemoScenario | null {
  const params = new URLSearchParams(search);
  const id = params.get('scenario');
  if (!id) return null;
  const rawSeed = params.get('seed');
  const seed = rawSeed !== null && /^\d+$/.test(rawSeed) ? Number(rawSeed) : undefined;
  return loadDemoScenario(id, seed);
}
