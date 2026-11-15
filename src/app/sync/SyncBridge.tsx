import { useEffect, useRef } from 'react';
import type { CrewProfile } from '../../core/profiles/model';
import { useProfileContext } from '../profile-context';
import type { AppStore } from '../store/app-store';
import { useSyncService } from './sync-context';

/**
 * Connects the running app to the sync service. Renders nothing. It tells the service when the signed-in
 * profile writes something (so a push follows, debounced), and applies what a pull changed: the app store is
 * re-read, and a renamed, re-roled or deleted signed-in profile is picked up or sent back to the gate.
 */
export function SyncBridge({ store, onActiveChanged }: { store: AppStore; onActiveChanged(profile: CrewProfile): void }) {
  const sync = useSyncService();
  const ctx = useProfileContext();
  const refreshing = useRef(false);
  const latest = useRef({ ctx, onActiveChanged });
  useEffect(() => {
    latest.current = { ctx, onActiveChanged };
  });

  useEffect(() => {
    if (!sync) return;
    return store.subscribe((state, prev) => {
      const a = state.session;
      const b = prev.session;
      if (!a || refreshing.current) return;
      if (!b || a.manual !== b.manual || a.decisions !== b.decisions || a.acks !== b.acks || a.outbox !== b.outbox) {
        sync.notifyLocalChange();
      }
    });
  }, [sync, store]);

  useEffect(() => {
    if (!sync) return;
    return sync.onRemoteChanges((ids) => {
      const current = latest.current.ctx;
      if (!current) return;
      const activeId = current.active.id;
      if (!ids.includes(activeId)) return;
      void (async () => {
        try {
          const row = await current.services.profiles.get(activeId);
          if (!row || row.deleted) {
            // The signed-in profile was deleted on another device: back to the gate.
            current.switchProfile();
            return;
          }
          if (row.name !== current.active.name || row.role !== current.active.role) {
            latest.current.onActiveChanged(row);
          }
          refreshing.current = true;
          await store.getState().refresh();
        } catch {
          // A failed re-read leaves the app on what it already shows; the next sync tries again.
        } finally {
          refreshing.current = false;
        }
      })();
    });
  }, [sync, store]);

  return null;
}
