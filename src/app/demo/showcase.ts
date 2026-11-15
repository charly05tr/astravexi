import { drawTraits, generatePersonReadings } from '../../adapters/health-sim';
import type { SimInjection } from '../../adapters/health-sim';
import type { CabinEpisodeSpec } from '../../adapters/seeded-history/cabin-timeline';
import type { CabinVariableId } from '../../core/attribution/model';
import type { IndicatorId, MissionDay, Reading } from '../../core/health/model';
import { MINUTES_PER_DAY } from '../../core/playback/timeline';
import type { ScriptedClass, ScriptedEvent } from '../../core/playback/timeline';
import showcaseJson from './showcase.json';

/**
 * The presentation scenario. It lives apart from the frozen evaluation catalog (src/eval/scenarios.json) and the
 * evaluation never reads it. It reuses the SAME simulator (health-sim: traits, readings, injections) and the same
 * cabin episodes as the evaluation scenarios; only the script (several events, chosen days and people, 5 SD) differs.
 */
export interface ShowcaseSpec {
  id: string;
  name: string;
  description: string;
  seed: number;
  firstDay: MissionDay;
  warmupDays: number;
  judgedDays: number;
  initialHour: number;
  events: Array<{
    id: string;
    name: string;
    class: ScriptedClass;
    fromDay: MissionDay;
    toDay: MissionDay;
    cabin: { variable: CabinVariableId; delta: number; fromHourPreviousDay: number; toHourLastDay: number } | null;
    anomalies: Array<{ indicatorId: IndicatorId; people: number[]; direction: 'up' | 'down'; magnitudeSd: number }>;
  }>;
}

export const SHOWCASE = showcaseJson as unknown as ShowcaseSpec;
export const SHOWCASE_ID = SHOWCASE.id;
const CREW_SIZE = 3;

export interface ShowcaseInstance {
  seed: number;
  people: Array<{ profileId: string; name: string; readings: Reading[] }>;
  cabinEpisodes: CabinEpisodeSpec[];
  events: ScriptedEvent[];
  /** First and last mission minute of the playback span (start of the first judged day, end of the last). */
  startT: number;
  endT: number;
  lastDay: MissionDay;
}

export function buildShowcase(seed: number = SHOWCASE.seed, spec: ShowcaseSpec = SHOWCASE): ShowcaseInstance {
  const firstJudgedDay = spec.firstDay + spec.warmupDays;
  const lastDay = firstJudgedDay + spec.judgedDays - 1;
  const traits = Array.from({ length: CREW_SIZE }, (_, p) => drawTraits(seed, p));
  const injections: SimInjection[][] = traits.map(() => []);
  const cabinEpisodes: CabinEpisodeSpec[] = [];
  const events: ScriptedEvent[] = [];

  for (const e of spec.events) {
    if (e.cabin) {
      cabinEpisodes.push({
        variable: e.cabin.variable,
        fromDay: e.fromDay - 1,
        fromHour: e.cabin.fromHourPreviousDay,
        toDay: e.toDay,
        toHour: e.cabin.toHourLastDay,
        delta: e.cabin.delta,
      });
    }
    for (const a of e.anomalies) {
      for (const p of a.people) {
        const delta = (a.direction === 'up' ? 1 : -1) * a.magnitudeSd * traits[p]!.totalSd[a.indicatorId];
        injections[p]!.push({ indicatorId: a.indicatorId, fromDay: e.fromDay, toDay: e.toDay, delta });
      }
    }
    events.push({ id: e.id, name: e.name, startT: (e.fromDay - 1) * MINUTES_PER_DAY, endT: e.toDay * MINUTES_PER_DAY, truth: e.class });
  }

  return {
    seed,
    people: traits.map((t, p) => ({
      profileId: `sim-${p}`,
      name: `Crew ${p + 1}`,
      readings: generatePersonReadings(seed, t, spec.firstDay, lastDay, injections[p]),
    })),
    cabinEpisodes,
    events,
    startT: (firstJudgedDay - 1) * MINUTES_PER_DAY,
    endT: lastDay * MINUTES_PER_DAY - 1,
    lastDay,
  };
}
