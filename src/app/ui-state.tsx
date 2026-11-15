import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ZoneId } from '../core/health/model';
import { createInitialSymptomReports } from '../features/body-map/symptom-model';
import type { ZoneSymptomReport } from '../features/body-map/symptom-model';

export type View = 'dashboard' | 'comms' | 'sources';

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
  /** Quick anatomical symptom and discomfort reports tagged directly from the 3D body / zone panel. */
  symptomReports: Readonly<Record<ZoneId, ZoneSymptomReport>>;
  toggleSymptomTag(zoneId: ZoneId, tagId: string): void;
  setZoneDiscomfort(zoneId: ZoneId, level: number): void;
  clearZoneSymptoms(zoneId: ZoneId): void;
}

const UiContext = createContext<UiState | null>(null);

/** View and zone selection. Shared by the alert rail, the body model and the zone panel. */
export function UiProvider({ children, initialView = 'dashboard' }: { children: ReactNode; initialView?: View }) {
  const [view, setView] = useState<View>(initialView);
  const [selectedZoneId, setSelected] = useState<ZoneId | null>(null);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [symptomReports, setSymptomReports] = useState<Record<ZoneId, ZoneSymptomReport>>(() =>
    createInitialSymptomReports(),
  );

  const selectZone = useCallback((id: ZoneId) => setSelected(id), []);
  const clearZone = useCallback(() => setSelected(null), []);

  const toggleSymptomTag = useCallback((zoneId: ZoneId, tagId: string) => {
    setSymptomReports((prev) => {
      const current = prev[zoneId];
      const has = current.tags.includes(tagId);
      const nextTags = has ? current.tags.filter((t) => t !== tagId) : [...current.tags, tagId];
      return {
        ...prev,
        [zoneId]: { ...current, tags: nextTags },
      };
    });
  }, []);

  const setZoneDiscomfort = useCallback((zoneId: ZoneId, level: number) => {
    const clamped = Math.max(0, Math.min(10, Math.round(level)));
    setSymptomReports((prev) => ({
      ...prev,
      [zoneId]: { ...prev[zoneId], discomfort: clamped },
    }));
  }, []);

  const clearZoneSymptoms = useCallback((zoneId: ZoneId) => {
    setSymptomReports((prev) => ({
      ...prev,
      [zoneId]: { zoneId, discomfort: 0, tags: [] },
    }));
  }, []);

  const value = useMemo<UiState>(
    () => ({
      view,
      setView,
      selectedZoneId,
      selectZone,
      clearZone,
      checkInOpen,
      setCheckInOpen,
      symptomReports,
      toggleSymptomTag,
      setZoneDiscomfort,
      clearZoneSymptoms,
    }),
    [
      view,
      selectedZoneId,
      selectZone,
      clearZone,
      checkInOpen,
      symptomReports,
      toggleSymptomTag,
      setZoneDiscomfort,
      clearZoneSymptoms,
    ],
  );
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiState {
  const value = useContext(UiContext);
  if (!value) throw new Error('useUi needs a UiProvider.');
  return value;
}
