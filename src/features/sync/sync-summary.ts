import type { SyncStatus } from '../../app/sync/sync-service';

export type SyncTone = 'ok' | 'busy' | 'pending' | 'error';

export interface SyncSummary {
  tone: SyncTone;
  /** One short line, for the menu and the status dot. */
  label: string;
}

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function timeAgo(iso: string, nowMs: number): string {
  const seconds = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 1000));
  if (Number.isNaN(seconds) || seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** The status line of an enrolled device; null when sync is off or the device is not enrolled. */
export function summarize(status: SyncStatus | null, nowMs: number): SyncSummary | null {
  if (!status || !status.ready || !status.enrolled) return null;
  if (status.syncing) return { tone: 'busy', label: 'Syncing...' };
  if (status.error) return { tone: 'error', label: 'Sync problem, retrying' };
  if (status.issues.some((i) => i.kind === 'rejected_future')) return { tone: 'error', label: 'Sync blocked: device clock' };
  if (status.pending) return { tone: 'pending', label: 'Changes waiting to sync' };
  if (status.lastSyncAt) return { tone: 'ok', label: `Synced ${timeAgo(status.lastSyncAt, nowMs)}` };
  return { tone: 'pending', label: 'Not synced yet' };
}
