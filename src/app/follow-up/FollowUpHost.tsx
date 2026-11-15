import { useEffect } from 'react';
import { useStore } from 'zustand';
import { FollowUpDialog } from '../../features/suggestions/FollowUpPanel';
import { useNotification } from '../../ui/notification';
import { useAppContext } from '../app-context';
import { useUi } from '../ui-state';

/**
 * Mounted once at the app root, so it outlives every view. It shows the follow-up modal for the job being
 * viewed, and raises a toast when a job finishes while the user is looking elsewhere. If the user is watching
 * the processing modal when it finishes, the modal simply turns into the result and no toast is raised.
 */
export function FollowUpHost() {
  const { followUpJobs } = useAppContext();
  const notify = useNotification();
  const { setAiSettingsOpen } = useUi();
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
  return (
    <FollowUpDialog
      job={job}
      onClose={() => followUpJobs.getState().closeModal()}
      onConfigure={() => {
        followUpJobs.getState().dismiss(job.id);
        setAiSettingsOpen(true);
      }}
    />
  );
}
