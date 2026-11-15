import { createContext, useContext, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { SyncService, SyncStatus } from './sync-service';

const SyncContext = createContext<SyncService | null>(null);

/** Gives the UI the device sync service. Absent (null) in DEMO and whenever `VITE_API_URL` is not set. */
export function SyncProvider({ service, children }: { service: SyncService | null; children: ReactNode }) {
  return <SyncContext.Provider value={service}>{children}</SyncContext.Provider>;
}

export function useSyncService(): SyncService | null {
  return useContext(SyncContext);
}

const noopSubscribe = () => () => undefined;
const noSnapshot = () => null;

/** The live sync status, or null when sync is not available. */
export function useSyncStatus(): SyncStatus | null {
  const service = useSyncService();
  return useSyncExternalStore(service ? service.subscribe : noopSubscribe, service ? service.getStatus : noSnapshot);
}
