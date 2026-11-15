import { useEffect, useMemo } from 'react';
import { createLlmFollowUpProvider } from '../adapters/llm-suggestions';
import { createAiModelCatalog } from '../adapters/llm-suggestions/models';
import { createAiSettingsStore } from '../adapters/llm-suggestions/settings-store';
import { createRuleSuggestionProvider } from '../adapters/rule-suggestions';
import { content as defaultContent, knowledge as defaultKnowledge } from '../knowledge';
import type { Content } from '../knowledge';
import type { Knowledge } from '../core/health/model';
import type { AiModelCatalog, AiSettingsStore, FollowUpSuggestionProvider, SuggestionProvider } from '../core/ports';
import { MissionSetup } from '../features/onboarding/MissionSetup';
import { AiSettingsDialog } from '../features/ai/AiSettingsDialog';
import { NotificationProvider } from '../ui/notification';
import { FollowUpHost } from './follow-up/FollowUpHost';
import { createFollowUpJobs } from './follow-up/follow-up-jobs';
import { AppShell } from './AppShell';
import { AppProvider, useAppState } from './app-context';
import type { AppStore } from './store/app-store';
import { UiProvider } from './ui-state';

function Gate() {
  const status = useAppState((s) => s.status);
  const error = useAppState((s) => s.error);
  const mode = useAppState((s) => s.mode);
  const hasMissionConfig = useAppState((s) => s.hasMissionConfig);

  if (status === 'error') {
    return (
      <main className="center-stage" id="main">
        <p className="banner" role="alert">
          The app could not start: {error}
        </p>
      </main>
    );
  }
  if (status !== 'ready') {
    return (
      <main className="center-stage" id="main" aria-busy="true">
        <p className="muted" role="status">
          Loading.
        </p>
      </main>
    );
  }
  if (mode === 'live' && !hasMissionConfig) return <MissionSetup />;
  return <AppShell />;
}

/**
 * Hydrates the store, runs the link ticker and saves the demo clock when the page is hidden. Tests that
 * hydrate the store themselves pass `autoStart={false}`.
 */
export function AppRoot({
  store,
  knowledge = defaultKnowledge,
  content = defaultContent,
  autoStart = true,
  suggestions,
  followUps,
  aiSettings,
  aiModels,
}: {
  store: AppStore;
  knowledge?: Knowledge;
  content?: Content;
  autoStart?: boolean;
  /** Defaults to the curated rule provider. Swap in an LLM provider here. */
  suggestions?: SuggestionProvider;
  /** Defaults to the OpenAI-compatible LLM provider, driven by `aiSettings`. Tests inject a fake. */
  followUps?: FollowUpSuggestionProvider;
  /** Defaults to a store backed by sessionStorage (localStorage only when the user opts in). */
  aiSettings?: AiSettingsStore;
  /** Defaults to listing models over the OpenAI-compatible `/models` endpoint. */
  aiModels?: AiModelCatalog;
}) {
  const provider = useMemo(
    () => suggestions ?? createRuleSuggestionProvider(content.recommendations),
    [suggestions, content],
  );
  const settings = useMemo(() => aiSettings ?? createAiSettingsStore(), [aiSettings]);
  const followUpProvider = useMemo(
    () => followUps ?? createLlmFollowUpProvider({ settings }),
    [followUps, settings],
  );
  const modelCatalog = useMemo(() => aiModels ?? createAiModelCatalog(), [aiModels]);
  const followUpJobs = useMemo(
    () => createFollowUpJobs(followUpProvider, { modelName: () => settings.get().model }),
    [followUpProvider, settings],
  );
  // Jobs belong to the signed-in profile: a profile change, or the app going away, aborts them.
  useEffect(() => {
    let profileId = store.getState().actor.profileId;
    const unsubscribe = store.subscribe((state) => {
      if (state.actor.profileId === profileId) return;
      profileId = state.actor.profileId;
      followUpJobs.getState().cancelAll();
    });
    return () => {
      unsubscribe();
      followUpJobs.getState().cancelAll();
    };
  }, [store, followUpJobs]);
  useEffect(() => {
    if (!autoStart) return;
    void store
      .getState()
      .hydrate()
      .then(() => store.getState().startTicker());
    const flush = () => void store.getState().flushClock();
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      store.getState().stopTicker();
    };
  }, [store, autoStart]);

  return (
    <AppProvider value={{ store, knowledge, content, suggestions: provider, followUps: followUpProvider, followUpJobs, aiSettings: settings, aiModels: modelCatalog }}>
      <UiProvider>
        <NotificationProvider>
          <Gate />
          <FollowUpHost />
          <AiSettingsDialog />
        </NotificationProvider>
      </UiProvider>
    </AppProvider>
  );
}
