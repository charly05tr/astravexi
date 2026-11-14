import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ZoneId } from '../core/health/model';

export type View = 'dashboard' | 'sources';

export interface UiState {
  view: View;
  setView(view: View): void;
  /** The zone the user picked, or null: the panel then follows the highest-priority zone. */
  selectedZoneId: ZoneId | null;
  selectZone(id: ZoneId): void;
}

const UiContext = createContext<UiState | null>(null);

/** View and zone selection. Shared by the alert rail, the body model and the zone panel. */
export function UiProvider({ children, initialView = 'dashboard' }: { children: ReactNode; initialView?: View }) {
  const [view, setView] = useState<View>(initialView);
  const [selectedZoneId, setSelected] = useState<ZoneId | null>(null);
  const selectZone = useCallback((id: ZoneId) => setSelected(id), []);
  const value = useMemo<UiState>(
    () => ({ view, setView, selectedZoneId, selectZone }),
    [view, selectedZoneId, selectZone],
  );
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiState {
  const value = useContext(UiContext);
  if (!value) throw new Error('useUi needs a UiProvider.');
  return value;
}
