import { assessCo2 } from '../environment/co2';
import { recentSeries } from '../attribution/variable-status';
import type { Co2Assessment, Co2Reference } from '../environment/co2';
import type { MissionMinute } from '../health/model';
import type { CabinReferenceCache, CabinReferenceSource, SimulatedCabinTimeline } from '../ports';
import { assertCan } from '../profiles/policy';
import { tsMs } from '../sync/time';
import type { Deps } from './session';

/** What the cabin environment use-case needs: a subset of the session `Deps` plus the three cabin ports. */
export type EnvironmentDeps = Pick<Deps, 'actor' | 'nowIso' | 'clock'> & {
  /** Real NASA OSDR ISS telemetry (the reference). */
  reference: CabinReferenceSource;
  cache: CabinReferenceCache;
  /** Our simulated cabin on the mission clock (the same source the cabin analysis reads). Null in LIVE: no simulated values are shown there. */
  timeline: SimulatedCabinTimeline | null;
};

export type ReferenceState =
  | { status: 'live'; reference: Co2Reference; fetchedAt: string }
  /** The service could not be reached; this is the last successful response kept on the device. */
  | { status: 'cached'; reference: Co2Reference; fetchedAt: string }
  /** Served from the device without asking NASA (cache-first). `stale` asks the caller to refresh. */
  | { status: 'saved'; reference: Co2Reference; fetchedAt: string; stale: boolean }
  | { status: 'unavailable'; message: string };

export interface LoadCabinOptions {
  /** Answer from the saved copy when there is one, without waiting for NASA. */
  cacheFirst?: boolean;
}

/**
 * How old a saved copy may be before the caller should refresh it. The mission telemetry is historical and does
 * not change, so a day is plenty.
 */
export const REFERENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** One simulated CO2 sample, stamped in mission minutes. */
export interface SimulatedCo2Reading {
  t: MissionMinute;
  ppm: number;
}

export interface CabinEnvironmentView {
  /** Null in LIVE. */
  simulated: { readings: SimulatedCo2Reading[]; latest: SimulatedCo2Reading } | null;
  reference: ReferenceState;
  /** Our latest value against the reference threshold. Null without both a simulated value and a reference. */
  assessment: Co2Assessment | null;
}

/** The simulated cabin CO2 compared with the NASA ISS reference threshold. CMO only. */
export async function loadCabinEnvironment(deps: EnvironmentDeps, options: LoadCabinOptions = {}): Promise<CabinEnvironmentView> {
  assertCan(deps.actor.role, 'viewCabinEnvironment');
  const now = deps.nowIso();
  const missionNow = deps.clock.now();
  const samples = deps.timeline?.samples(missionNow - 48 * 60, missionNow) ?? [];
  const readings = recentSeries(samples, 'co2', missionNow).map((r) => ({ t: r.t, ppm: r.value }));
  const latest = readings[readings.length - 1];
  const simulated = latest ? { readings, latest } : null;

  const saved = options.cacheFirst ? await deps.cache.load().catch(() => null) : null;
  let reference: ReferenceState;
  if (saved) {
    const stale = tsMs(now) - tsMs(saved.fetchedAt) > REFERENCE_MAX_AGE_MS;
    reference = { status: 'saved', reference: saved.reference, fetchedAt: saved.fetchedAt, stale };
  } else try {
    const fresh = await deps.reference.fetchReference();
    await deps.cache.save(fresh, now).catch(() => undefined); // a cache failure must not hide fresh data
    reference = { status: 'live', reference: fresh, fetchedAt: now };
  } catch (error) {
    const cached = await deps.cache.load().catch(() => null);
    reference = cached
      ? { status: 'cached', reference: cached.reference, fetchedAt: cached.fetchedAt }
      : { status: 'unavailable', message: error instanceof Error ? error.message : 'The NASA reference could not be loaded.' };
  }

  const threshold = reference.status === 'unavailable' ? null : reference.reference.thresholdPpm;
  return { simulated, reference, assessment: simulated && threshold !== null ? assessCo2(simulated.latest.ppm, threshold) : null };
}
