import { CircleCheck, Flag, Sparkles } from 'lucide-react';
import type { Suggestion } from '../../core/ports';
import { Button } from '../../ui/Button';
import type { SuggestionsState } from './use-suggestions';

export interface SuggestionListProps {
  state: SuggestionsState;
  onDecide(suggestion: Suggestion, decision: 'accepted' | 'dismissed'): void;
}

function SuggestionCard({ s, onDecide }: { s: Suggestion; onDecide: SuggestionListProps['onDecide'] }) {
  return (
    <li className="proposal" data-origin={s.origin}>
      <p className="proposal__title">
        {s.origin === 'llm' ? <Sparkles size={14} aria-label="Generated" /> : null}
        Proposed routine change: {s.title}
      </p>
      <p className="proposal__why">{s.rationale}</p>
      <ul>
        {s.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>
      {s.evidence || s.needsVerification ? (
        <p className="citation">
          {s.evidence ? <span>Evidence: {s.evidence.label}</span> : null}
          {s.needsVerification ? (
            <span className="verify-mark">
              <Flag size={14} aria-hidden="true" />
              Needs verification
            </span>
          ) : null}
        </p>
      ) : null}
      {s.decision === 'accepted' ? (
        <p className="status-line">
          <CircleCheck size={14} aria-hidden="true" />
          Accepted
        </p>
      ) : (
        <div className="proposal__actions">
          <Button size="small" variant="primary" onClick={() => onDecide(s, 'accepted')}>
            Accept
          </Button>
          <Button size="small" onClick={() => onDecide(s, 'dismissed')}>
            Dismiss
          </Button>
        </div>
      )}
    </li>
  );
}

/** Routine changes for the zone in focus. Shown only when an indicator crossed a threshold. */
export function SuggestionList({ state, onDecide }: SuggestionListProps) {
  if (state.status === 'idle') return null;
  return (
    <section className="zone-section" aria-labelledby="zone-suggestions" aria-busy={state.status === 'loading'}>
      <h3 id="zone-suggestions">What you can change in your routine</h3>
      <p className="muted small">Optional. Accepting or dismissing never changes the alert.</p>
      {state.status === 'loading' && state.items.length === 0 ? (
        <p className="muted" role="status">
          Preparing suggestions.
        </p>
      ) : null}
      {state.status === 'error' ? (
        <p className="banner" role="alert">
          Suggestions are unavailable right now ({state.message}). Your alerts are not affected.
        </p>
      ) : null}
      {state.status === 'ready' && state.items.length === 0 ? (
        <p className="muted">No open suggestions. You already decided on all of them.</p>
      ) : null}
      {state.items.length > 0 ? (
        <ul className="stack proposal-list">
          {state.items.map((s) => (
            <SuggestionCard key={`${s.id}:${s.findingKey}`} s={s} onDecide={onDecide} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
