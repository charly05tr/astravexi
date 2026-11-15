import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ZoneId } from '../core/health/model';
import { createInitialSymptomReports } from '../features/body-map/symptom-model';
import type { ZoneSymptomReport } from '../features/body-map/symptom-model';
import {
  createDefaultEnvironmentConfig,
  sanitizeEnvironmentConfig,
} from '../features/environment/environment-model';
import type { EnvironmentConfig, HabitatPresetId } from '../features/environment/environment-model';
import type { TriageAnswer } from '../features/triage/triage-model';

export type View = 'dashboard' | 'comms' | 'sources';

export interface UiState {
  view: View;
  setView(view: View): void;
  /** The zone the user picked, or null: the panel then follows the highest-priority zone. */
  selectedZoneId: ZoneId | null;
  selectZone(id: ZoneId): void;
  /** Back to the whole body: the panel follows the highest-priority zone again. */
  clearZone(): void;
  /** Quick anatomical symptom and discomfort reports tagged directly from the 3D body / zone panel. */
  symptomReports: Readonly<Record<ZoneId, ZoneSymptomReport>>;
  toggleSymptomTag(zoneId: ZoneId, tagId: string): void;
  setZoneDiscomfort(zoneId: ZoneId, level: number): void;
  clearZoneSymptoms(zoneId: ZoneId): void;
  /** Active habitat context and configurable ambient parameters (Module 2). */
  environment: EnvironmentConfig;
  setHabitatPreset(presetId: HabitatPresetId): void;
  updateEnvironment(patch: Partial<EnvironmentConfig>): void;
  resetEnvironment(): void;
  /** Guided differential triage Yes/No answers per zone (Module 4). */
  triageAnswers: Readonly<Record<string, TriageAnswer>>;
  setTriageAnswer(questionId: string, answer: TriageAnswer): void;
  clearTriageAnswers(questionIds: readonly string[]): void;
}

const UiContext = createContext<UiState | null>(null);

/** View and zone selection. Shared by the alert rail, the body model and the zone panel. */
export function UiProvider({ children, initialView = 'dashboard' }: { children: ReactNode; initialView?: View }) {
  const [view, setView] = useState<View>(initialView);
  const [selectedZoneId, setSelected] = useState<ZoneId | null>(null);
  const [symptomReports, setSymptomReports] = useState<Record<ZoneId, ZoneSymptomReport>>(() =>
    createInitialSymptomReports(),
  );
  const [environment, setEnvironment] = useState<EnvironmentConfig>(() => createDefaultEnvironmentConfig('transit'));
  const [triageAnswers, setTriageAnswers] = useState<Record<string, TriageAnswer>>({});

  const selectZone = useCallback((id: ZoneId) => setSelected(id), []);
  const clearZone = useCallback(() => setSelected(null), []);

  const setTriageAnswer = useCallback((questionId: string, answer: TriageAnswer) => {
    setTriageAnswers((prev) => ({ ...prev, [questionId]: answer }));
  }, []);

  const clearTriageAnswers = useCallback((questionIds: readonly string[]) => {
    setTriageAnswers((prev) => {
      const next = { ...prev };
      for (const id of questionIds) delete next[id];
      return next;
    });
  }, []);

  const setHabitatPreset = useCallback((presetId: HabitatPresetId) => {
    setEnvironment(createDefaultEnvironmentConfig(presetId));
  }, []);

  const updateEnvironment = useCallback((patch: Partial<EnvironmentConfig>) => {
    setEnvironment((prev) => sanitizeEnvironmentConfig({ ...prev, ...patch }));
  }, []);

  const resetEnvironment = useCallback(() => {
    setEnvironment(createDefaultEnvironmentConfig('transit'));
  }, []);

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
      symptomReports,
      toggleSymptomTag,
      setZoneDiscomfort,
      clearZoneSymptoms,
      environment,
      setHabitatPreset,
      updateEnvironment,
      resetEnvironment,
      triageAnswers,
      setTriageAnswer,
      clearTriageAnswers,
    }),
    [
      view,
      selectedZoneId,
      selectZone,
      clearZone,
      symptomReports,
      toggleSymptomTag,
      setZoneDiscomfort,
      clearZoneSymptoms,
      environment,
      setHabitatPreset,
      updateEnvironment,
      resetEnvironment,
      triageAnswers,
      setTriageAnswer,
      clearTriageAnswers,
    ],
  );
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiState {
  const value = useContext(UiContext);
  if (!value) throw new Error('useUi needs a UiProvider.');
  return value;
}
