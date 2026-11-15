import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ZoneId } from '../core/health/model';

export type View = 'dashboard' | 'comms' | 'sources' | 'profiles' | 'sync';

export interface UiState {
  view: View;
  setView(view: View): void;
  /** The zone the user picked, or null: the panel then follows the highest-priority zone. */
  selectedZoneId: ZoneId | null;
  selectZone(id: ZoneId): void;
  /** Back to the whole body: the panel follows the highest-priority zone again. */
  clearZone(): void;
  /** Whether the full check-in dialog is open. */
  checkInOpen: boolean;
  setCheckInOpen(open: boolean): void;
}

const UiContext = createContext<UiState | null>(null);

/** View and zone selection. Shared by the alert rail, the body model and the zone panel. */
export function UiProvider({ children, initialView = 'dashboard' }: { children: ReactNode; initialView?: View }) {
  const [view, setView] = useState<View>(initialView);
  const [selectedZoneId, setSelected] = useState<ZoneId | null>(null);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const selectZone = useCallback((id: ZoneId) => setSelected(id), []);
  const clearZone = useCallback(() => setSelected(null), []);
  const value = useMemo<UiState>(
    () => ({ view, setView, selectedZoneId, selectZone, clearZone, checkInOpen, setCheckInOpen }),
    [view, selectedZoneId, selectZone, clearZone, checkInOpen],
  );
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiState {
  const value = useContext(UiContext);
  if (!value) throw new Error('useUi needs a UiProvider.');
  return value;
}
