import { useEffect, useState } from 'react';
import { useAppContext } from '../../app/app-context';
import type { Suggestion, SuggestionContext } from '../../core/ports';

export type SuggestionsState =
  | { status: 'idle'; items: [] }
  | { status: 'loading'; items: Suggestion[] }
  | { status: 'ready'; items: Suggestion[] }
  | { status: 'error'; items: Suggestion[]; message: string };

interface Answer {
  context: SuggestionContext;
  items: Suggestion[];
  error: string | null;
}

/**
 * Asks the configured provider for suggestions whenever the context changes. Stale answers are dropped
 * (abort on change), so a slow LLM answer for the previous zone never lands on the new one. Items from
 * the last answer stay on screen while a new one loads, so the list does not flicker.
 */
export function useSuggestions(context: SuggestionContext | null): SuggestionsState {
  const { suggestions } = useAppContext();
  const [answer, setAnswer] = useState<Answer | null>(null);
  const active = context !== null && context.findings.length > 0;

  useEffect(() => {
    if (!context || context.findings.length === 0) return;
    const controller = new AbortController();
    suggestions
      .suggest(context, { signal: controller.signal })
      .then((items) => {
        if (!controller.signal.aborted) setAnswer({ context, items, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : 'Suggestions are unavailable.';
        setAnswer((prev) => ({ context, items: prev?.items ?? [], error: message }));
      });
    return () => controller.abort();
  }, [context, suggestions]);

  if (!active) return { status: 'idle', items: [] };
  const items = answer?.items ?? [];
  if (answer?.context !== context) return { status: 'loading', items };
  if (answer.error !== null) return { status: 'error', items, message: answer.error };
  return { status: 'ready', items };
}
