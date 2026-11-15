import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand';
import { can } from '../../core/profiles/policy';
import { announceHabitEvents } from '../../features/habits/habit-events';
import { FollowUpDialog } from '../../features/suggestions/FollowUpPanel';
import type { HabitSaving } from '../../features/suggestions/FollowUpPanel';
import { useNotification } from '../../ui/notification';
import { useAppContext, useAppState } from '../app-context';
import { useUi } from '../ui-state';

/**
 * Mounted once at the app root, so it outlives every view. It shows the follow-up modal for the job being
 * viewed, and raises a toast when a job finishes while the user is looking elsewhere. If the user is watching
 * the processing modal when it finishes, the modal simply turns into the result and no toast is raised.
 */
export function FollowUpHost() {
  const { followUpJobs, store } = useAppContext();
  const notify = useNotification();
  const { setAiSettingsOpen, setView } = useUi();
  const role = useAppState((s) => s.actor.role);
  const habits = useAppState((s) => s.habitData.habits);
  const canManage = can(role, 'manageHabits');
  const savedKeys = useMemo(() => new Set(habits.map((h) => h.sourceKey)), [habits]);
  const jobs = useStore(followUpJobs, (s) => s.jobs);
  const viewingId = useStore(followUpJobs, (s) => s.viewingId);

  useEffect(() => {
    const { markNotified, view, dismiss } = followUpJobs.getState();
    for (const job of Object.values(jobs)) {
      if (job.notified || job.status === 'processing') continue;
      markNotified(job.id);
      if (viewingId === job.id) continue; // the user is watching: the modal already shows the result
      if (job.status === 'ready') {
        notify('success', 'Your AI suggestion is ready', { action: { label: 'View', onClick: () => view(job.id) } });
      } else if (job.status === 'failed') {
        notify('error', `AI suggestion unavailable: ${job.message}`, {
          action: {
            label: 'AI assistant settings',
            onClick: () => {
              dismiss(job.id);
              setAiSettingsOpen(true);
            },
          },
        });
      }
    }
  }, [jobs, viewingId, followUpJobs, notify, setAiSettingsOpen]);

  const job = viewingId ? jobs[viewingId] : undefined;
  if (!job || job.status === 'unconfigured') return null;

  const habitSaving: HabitSaving | undefined =
    canManage && job.status === 'ready'
      ? {
          savedKeys,
          async onSave(blocks) {
            const result = await store.getState().saveHabits({ recommendationId: job.id, model: job.model, blocks });
            if (!result) return;
            if (result.saved === 0) {
              notify('info', 'Those habits were already saved.');
              return;
            }
            notify('success', result.saved === 1 ? 'Saved 1 habit to My habits.' : `Saved ${result.saved} habits to My habits.`, {
              action: {
                label: 'View habits',
                onClick: () => {
                  followUpJobs.getState().closeModal();
                  setView('habits');
                },
              },
            });
            announceHabitEvents(notify, result.events);
          },
        }
      : undefined;

  return (
    <FollowUpDialog
      job={job}
      habitSaving={habitSaving}
      onClose={() => followUpJobs.getState().closeModal()}
      onConfigure={() => {
        followUpJobs.getState().dismiss(job.id);
        setAiSettingsOpen(true);
      }}
    />
  );
}
