import { useEffect, useMemo } from 'react';
import { createRuleSuggestionProvider } from '../adapters/rule-suggestions';
import { content as defaultContent, knowledge as defaultKnowledge } from '../knowledge';
import type { Content } from '../knowledge';
import type { Knowledge } from '../core/health/model';
import type { SuggestionProvider } from '../core/ports';
import { MissionSetup } from '../features/onboarding/MissionSetup';
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
}: {
  store: AppStore;
  knowledge?: Knowledge;
  content?: Content;
  autoStart?: boolean;
  /** Defaults to the curated rule provider. Swap in an LLM provider here. */
  suggestions?: SuggestionProvider;
}) {
  const provider = useMemo(
    () => suggestions ?? createRuleSuggestionProvider(content.recommendations),
    [suggestions, content],
  );
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
    <AppProvider value={{ store, knowledge, content, suggestions: provider }}>
      <UiProvider>
        <Gate />
      </UiProvider>
    </AppProvider>
  );
}
