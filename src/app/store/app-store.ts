import { createStore } from 'zustand/vanilla';
import type { MissionConfig } from '../../adapters/wall-clock';
import type { LinkState } from '../../core/escalation/link';
import type { RecommendationDecision, ZoneId } from '../../core/health/model';
import type { Actor } from '../../core/profiles/model';
import { acknowledge, advanceLink, decideRecommendation, sendNow } from '../../core/use-cases/actions';
import { bootstrap, reevaluate } from '../../core/use-cases/bootstrap';
import { submitCheckIn } from '../../core/use-cases/check-in';
import type { CheckInEntry, CheckInResult } from '../../core/use-cases/check-in';
import type { Session } from '../../core/use-cases/session';
import { MISSION_META_KEY } from '../adapters';
import type { Adapters } from '../adapters';
import { advanceDemoDay, persistDemoClock, resetDemo } from '../demo/demo-use-cases';
import type { AppMode } from '../mode';

export const MIN_DELAY_MIN = 0;
export const MAX_DELAY_MIN = 22;
export const DEFAULT_DELAY_MIN = 12;
/** The DEMO clock position is saved every this many ticks, and on `flushClock`. */
const CLOCK_PERSIST_EVERY_TICKS = 5;

export interface MissionInfo {
  /** The DEMO day is frozen; the LIVE day follows the calendar. */
  today: number;
  /** Integer mission minutes; advances 1 per real second in DEMO. */
  now: number;
  transitDays: number;
  destination: string;
  scaleLabel: string;
}

export interface AppState {
  mode: AppMode;
  /** Who is acting. Role-gated actions reject any other role, and the UI hides what the role cannot do. */
  actor: Actor;
  status: 'idle' | 'hydrating' | 'ready' | 'error';
  error: string | null;
  /** Bumped by Reset demo; queued work that started under an older generation is discarded. */
  generation: number;
  storageAvailable: boolean;
  /** LIVE only: false until the first-run mission setup is saved. */
  hasMissionConfig: boolean;
  mission: MissionInfo;
  /** Readings, acknowledgements, decisions, outbox and the evaluation. Null until hydrated. */
  session: Session | null;
  link: LinkState;

  hydrate(): Promise<void>;
  /** The signed-in profile was renamed or changed role: later actions run as the new actor. */
  setActor(actor: Actor): void;
  submitCheckIn(entry: CheckInEntry): Promise<CheckInResult>;
  acknowledge(zoneId: ZoneId, groupId: string): Promise<void>;
  decideRecommendation(input: {
    recommendationId: string;
    findingKey: string;
    decision: RecommendationDecision['decision'];
  }): Promise<void>;
  sendNow(messageId: string): Promise<void>;
  setDelay(minutes: number): Promise<void>;
  setBlackout(on: boolean): Promise<void>;
  /** One link tick. The ticker calls it once per second. */
  tick(): Promise<void>;
  startTicker(): void;
  stopTicker(): void;
  /** Persists the DEMO clock position now (call on `pagehide`). */
  flushClock(): Promise<void>;
  /** DEMO only. */
  advanceDay(): Promise<void>;
  /** DEMO only. */
  resetDemo(): Promise<void>;
  /** LIVE only. */
  saveMissionConfig(config: MissionConfig): Promise<void>;
}

export interface AppStoreOptions {
  tickMs?: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function missionInfo(adapters: Adapters): MissionInfo {
  const { clock } = adapters.deps;
  if (adapters.mode === 'live') {
    const cfg = adapters.deps.clock.getConfig();
    return {
      today: clock.today(),
      now: clock.now(),
      transitDays: cfg.transitDays,
      destination: cfg.destination,
      scaleLabel: clock.scaleLabel,
    };
  }
  return { today: clock.today(), now: clock.now(), transitDays: 210, destination: 'Mars', scaleLabel: clock.scaleLabel };
}

/**
 * The app store. All async work runs through ONE serial queue, so a tick can never interleave with a
 * check-in or a reset. Every queued job captures the generation when it is enqueued and is skipped if
 * a reset has bumped it since: a tick that was waiting cannot bring messages back after Reset demo.
 */
export function createAppStore(adapters: Adapters, options: AppStoreOptions = {}) {
  const tickMs = options.tickMs ?? 1000;
  let queue: Promise<unknown> = Promise.resolve();
  let timer: ReturnType<typeof setInterval> | null = null;
  let ticksSincePersist = 0;

  const store = createStore<AppState>()((set, get) => {
    const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
      const result = queue.then(job);
      queue = result.catch(() => undefined);
      return result;
    };
    /** Skips the job if the generation changed between enqueue and start. */
    const guarded = <T>(job: () => Promise<T>): Promise<T | undefined> => {
      const generation = get().generation;
      return enqueue(async () => (get().generation === generation ? job() : undefined));
    };
    const requireSession = (): Session => {
      const { session } = get();
      if (!session) throw new Error('Store is not hydrated.');
      return session;
    };
    const applySession = (session: Session) => set({ session, mission: missionInfo(adapters) });

    return {
      mode: adapters.mode,
      actor: adapters.deps.actor,
      status: 'idle',
      error: null,
      generation: 0,
      storageAvailable: adapters.storageAvailable,
      hasMissionConfig: adapters.mode === 'live' ? adapters.hasMissionConfig : true,
      mission: missionInfo(adapters),
      session: null,
      link: { oneWayDelayMin: DEFAULT_DELAY_MIN, blackout: false },

      async hydrate() {
        set({ status: 'hydrating', error: null });
        await enqueue(async () => {
          try {
            const session = await bootstrap(adapters.deps, get().link);
            set({ session, mission: missionInfo(adapters), status: 'ready' });
          } catch (error) {
            set({ status: 'error', error: error instanceof Error ? error.message : String(error) });
          }
        });
      },

      setActor(actor) {
        adapters.deps.actor = actor;
        // In LIVE the signed-in profile owns the database, so its name is the subject's name too.
        if (adapters.mode === 'live') adapters.deps.subject = { profileId: actor.profileId, name: actor.name };
        set({ actor });
      },

      async submitCheckIn(entry) {
        const result = await guarded(async () => {
          const out = await submitCheckIn(adapters.deps, requireSession(), entry, get().link);
          if (out.ok) applySession(out.session);
          return out;
        });
        return result ?? { ok: false, errors: { form: 'The app was reset. Try again.' } };
      },

      async acknowledge(zoneId, groupId) {
        await guarded(async () => applySession(await acknowledge(adapters.deps, requireSession(), { zoneId, groupId })));
      },

      async decideRecommendation(input) {
        await guarded(async () => applySession(await decideRecommendation(adapters.deps, requireSession(), input)));
      },

      async sendNow(messageId) {
        await guarded(async () =>
          applySession(await sendNow(adapters.deps, requireSession(), messageId, get().link)),
        );
      },

      async setDelay(minutes) {
        set({ link: { ...get().link, oneWayDelayMin: clamp(Math.round(minutes), MIN_DELAY_MIN, MAX_DELAY_MIN) } });
      },

      async setBlackout(on) {
        set({ link: { ...get().link, blackout: on } });
        await get().tick(); // queued -> held, or held -> sent, takes effect now
      },

      async tick() {
        await guarded(async () => {
          const session = get().session;
          if (!session) return;
          const { link } = get();
          let next = await advanceLink(adapters.deps, session, link);
          if (adapters.deps.clock.today() !== session.evaluation.asOf.day) {
            next = await reevaluate(adapters.deps, next, link); // LIVE day rollover
          }
          applySession(next);
          if (adapters.mode === 'demo') {
            ticksSincePersist += 1;
            if (ticksSincePersist >= CLOCK_PERSIST_EVERY_TICKS) {
              ticksSincePersist = 0;
              await persistDemoClock(adapters.deps);
            }
          }
        });
      },

      startTicker() {
        if (timer !== null) return;
        timer = setInterval(() => void get().tick(), tickMs);
      },

      stopTicker() {
        if (timer === null) return;
        clearInterval(timer);
        timer = null;
      },

      async flushClock() {
        if (adapters.mode !== 'demo') return;
        await guarded(() => persistDemoClock(adapters.deps));
      },

      async advanceDay() {
        if (adapters.mode !== 'demo') throw new Error('Advance one day is DEMO only.');
        const demo = adapters;
        await guarded(async () => applySession(await advanceDemoDay(demo.deps, requireSession(), get().link)));
      },

      async resetDemo() {
        if (adapters.mode !== 'demo') throw new Error('Reset demo is DEMO only.');
        const demo = adapters;
        const wasTicking = timer !== null;
        get().stopTicker();
        set({ generation: get().generation + 1 });
        await enqueue(async () => {
          const link: LinkState = { oneWayDelayMin: DEFAULT_DELAY_MIN, blackout: false };
          const session = await resetDemo(demo.deps, link);
          ticksSincePersist = 0;
          set({ session, link, mission: missionInfo(adapters), status: 'ready', error: null });
        });
        if (wasTicking) get().startTicker();
      },

      async saveMissionConfig(config) {
        if (adapters.mode !== 'live') throw new Error('Mission setup is LIVE only.');
        const live = adapters;
        await guarded(async () => {
          live.deps.clock.configure(config);
          await live.deps.store.setMeta(MISSION_META_KEY, config);
          const next = await reevaluate(live.deps, requireSession(), get().link);
          set({ hasMissionConfig: true });
          applySession(next);
        });
      },
    };
  });

  return store;
}

export type AppStore = ReturnType<typeof createAppStore>;
