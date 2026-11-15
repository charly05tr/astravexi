import type { DeviceCredentialStore } from '../../core/ports';
import { enrollDevice } from '../../core/sync/enroll';
import type { EnrollResult } from '../../core/sync/enroll';
import { runSync } from '../../core/sync/engine';
import type { SyncDeps } from '../../core/sync/engine';
import type { SyncIssue, SyncLastError } from '../../core/sync/model';
import { createScheduler } from './scheduler';
import type { Scheduler, SchedulerOptions } from './scheduler';

export interface SyncStatus {
  /** False until the stored credentials have been read. */
  ready: boolean;
  enrolled: boolean;
  deviceName: string | null;
  enrolledAt: string | null;
  syncing: boolean;
  /** A local write is waiting to be pushed. */
  pending: boolean;
  lastSyncAt: string | null;
  error: SyncLastError | null;
  issues: SyncIssue[];
}

export interface SyncService {
  getStatus(): SyncStatus;
  /** For `useSyncExternalStore`: the status object is replaced (never mutated) on every change. */
  subscribe(listener: () => void): () => void;
  /** Reads the stored credentials and, when enrolled, starts the schedule. Never throws. */
  start(): Promise<void>;
  stop(): void;
  enroll(input: { code: string; name: string }): Promise<EnrollResult>;
  /** Runs a sync now (joins one already running). Never throws; the outcome is in the status. */
  syncNow(): Promise<void>;
  /** Forgets the credentials on this device. Local data stays. */
  disconnect(): Promise<void>;
  /** A local write happened; a debounced sync follows. */
  notifyLocalChange(): void;
  /** Called after a pull changed local data, with the profiles it touched. */
  onRemoteChanges(listener: (profileIds: readonly string[]) => void): () => void;
}

export interface SyncServiceDeps extends SyncDeps {
  credentials: DeviceCredentialStore;
  scheduler?: Partial<Omit<SchedulerOptions, 'run'>>;
}

const INITIAL: SyncStatus = {
  ready: false,
  enrolled: false,
  deviceName: null,
  enrolledAt: null,
  syncing: false,
  pending: false,
  lastSyncAt: null,
  error: null,
  issues: [],
};

/**
 * The app-side sync facade: owns the status the UI shows, the schedule, enrollment and disconnection. Every
 * entry point swallows its errors (they end up in `status.error`), so React never sees a throw from here.
 */
export function createSyncService(deps: SyncServiceDeps): SyncService {
  let status: SyncStatus = INITIAL;
  /** Bumped by `stop`, so a `start` still reading the credentials does not schedule after being stopped. */
  let generation = 0;
  const listeners = new Set<() => void>();
  const remote = new Set<(ids: readonly string[]) => void>();
  const set = (patch: Partial<SyncStatus>) => {
    status = { ...status, ...patch };
    for (const l of [...listeners]) l();
  };

  const loadStored = async () => {
    const [creds, state] = await Promise.all([deps.credentials.get(), deps.credentials.getState()]);
    set({
      ready: true,
      enrolled: creds !== null,
      deviceName: creds?.deviceName ?? null,
      enrolledAt: creds?.enrolledAt ?? null,
      lastSyncAt: state.lastSyncAt,
      error: state.lastError,
      issues: [state.issues.forbidden, state.issues.rejectedFuture].filter((i): i is SyncIssue => i !== null),
    });
  };

  const scheduler: Scheduler = createScheduler({
    ...deps.scheduler,
    async run() {
      set({ syncing: true });
      try {
        const result = await runSync(deps);
        await loadStored();
        set({ syncing: false, ...(result.outcome === 'ok' ? { pending: false } : {}) });
        if (result.changedProfileIds.length > 0) for (const l of [...remote]) l(result.changedProfileIds);
        if (result.outcome === 'disconnected' || result.outcome === 'not-enrolled') return 'stop';
        return result.outcome === 'ok' ? 'ok' : 'failed';
      } catch {
        set({ syncing: false });
        return 'failed';
      }
    },
  });

  return {
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    async start() {
      const mine = generation;
      try {
        await loadStored();
        if (status.enrolled && mine === generation) scheduler.start();
      } catch {
        set({ ready: true });
      }
    },
    stop() {
      generation += 1;
      scheduler.stop();
    },
    async enroll(input) {
      const result = await enrollDevice(deps, input);
      if (result.ok) {
        await loadStored().catch(() => undefined);
        scheduler.start();
      }
      return result;
    },
    async syncNow() {
      if (!status.enrolled) return;
      await scheduler.syncNow();
    },
    async disconnect() {
      scheduler.stop();
      try {
        await deps.credentials.clear();
      } catch {
        // Nothing to do: the status below still reflects an unenrolled device after the next read.
      }
      set({ ...INITIAL, ready: true });
    },
    notifyLocalChange() {
      if (!status.enrolled) return;
      set({ pending: true });
      scheduler.notifyChange();
    },
    onRemoteChanges(listener) {
      remote.add(listener);
      return () => void remote.delete(listener);
    },
  };
}
