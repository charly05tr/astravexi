import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import type { FollowUpSuggestion } from '../../core/follow-up/blocks';
import type { PartialFollowUp } from '../../core/follow-up/partial';
import type { FollowUpContext, FollowUpSuggestionProvider } from '../../core/ports';

export type FollowUpJob =
  /** `partial` holds only finished, valid blocks that streamed in so far. */
  | { id: string; status: 'processing'; partial: PartialFollowUp | null; notified: boolean }
  | { id: string; status: 'ready'; suggestion: FollowUpSuggestion; notified: boolean }
  /** The AI could not help. The accepted recommendation stands on its own. */
  | { id: string; status: 'failed'; message: string; notified: boolean }
  /** No key is set: nothing was requested. Drives the one-line setup hint. */
  | { id: string; status: 'unconfigured'; notified: boolean };

export interface FollowUpJobsState {
  /** Jobs by recommendation id. */
  jobs: Readonly<Record<string, FollowUpJob>>;
  /** The job whose modal is open (processing or result), or null. */
  viewingId: string | null;
  /** Starts a job once per recommendation; a second call for the same id is ignored. Never throws. */
  start(id: string, context: FollowUpContext): void;
  /** Records a request that was not made, with a reason shown in the modal. The accepted change still stands. */
  skip(id: string, message: string): void;
  /** Opens the modal for a job (the toast's "View"). */
  view(id: string): void;
  /** Closes the modal. A pending request keeps running: it will notify when it finishes. */
  closeModal(): void;
  /** Removes a job and aborts it if it is still running. */
  dismiss(id: string): void;
  /** Aborts every running job and clears them. Used when the profile changes or the app unmounts. */
  cancelAll(): void;
  /** Marks that the user has been told about a finished job. */
  markNotified(id: string): void;
}

/**
 * The AI follow-up jobs, kept outside any page or panel so a request survives navigation between views and
 * zones. Only `cancelAll` (profile change, app unmount) or `dismiss` aborts one. Not persisted: a full
 * browser reload drops pending jobs.
 */
export function createFollowUpJobs(provider: FollowUpSuggestionProvider): StoreApi<FollowUpJobsState> {
  const controllers = new Map<string, AbortController>();

  return createStore<FollowUpJobsState>((set, get) => {
    const put = (job: FollowUpJob) => set((s) => ({ jobs: { ...s.jobs, [job.id]: job } }));

    return {
      jobs: {},
      viewingId: null,

      start(id, context) {
        if (get().jobs[id]) return;
        if (!provider.isConfigured()) {
          put({ id, status: 'unconfigured', notified: true });
          return;
        }
        const controller = new AbortController();
        controllers.set(id, controller);
        put({ id, status: 'processing', partial: null, notified: false });
        set({ viewingId: id });
        const finish = (job: FollowUpJob) => {
          if (controller.signal.aborted) return;
          controllers.delete(id);
          put(job);
        };
        const onPartial = (partial: PartialFollowUp) => {
          const job = get().jobs[id];
          if (controller.signal.aborted || job?.status !== 'processing') return;
          const before = job.partial;
          if (before && before.title === partial.title && before.blocks.length === partial.blocks.length) return;
          put({ ...job, partial });
        };
        // `suggest` may throw synchronously or reject: both end as a failed job, never as an unhandled error.
        Promise.resolve()
          .then(() => provider.suggest(context, { signal: controller.signal, onPartial }))
          .then(
            (suggestion) => finish({ id, status: 'ready', suggestion, notified: false }),
            (error: unknown) =>
              finish({
                id,
                status: 'failed',
                message: error instanceof Error ? error.message : 'The AI assistant is unavailable.',
                notified: false,
              }),
          );
      },

      skip(id, message) {
        if (get().jobs[id]) return;
        put({ id, status: 'failed', message, notified: true });
        set({ viewingId: id });
      },

      view(id) {
        if (get().jobs[id]) set({ viewingId: id });
      },

      closeModal() {
        const { viewingId, jobs } = get();
        // A finished job has been seen: closing its result removes it. A running one stays.
        if (viewingId && jobs[viewingId] && jobs[viewingId]!.status !== 'processing') get().dismiss(viewingId);
        else set({ viewingId: null });
      },

      dismiss(id) {
        controllers.get(id)?.abort();
        controllers.delete(id);
        set((s) => {
          const rest = { ...s.jobs };
          delete rest[id];
          return { jobs: rest, viewingId: s.viewingId === id ? null : s.viewingId };
        });
      },

      cancelAll() {
        controllers.forEach((c) => c.abort());
        controllers.clear();
        set({ jobs: {}, viewingId: null });
      },

      markNotified(id) {
        const job = get().jobs[id];
        if (job && !job.notified) put({ ...job, notified: true });
      },
    };
  });
}

export type FollowUpJobsStore = StoreApi<FollowUpJobsState>;
