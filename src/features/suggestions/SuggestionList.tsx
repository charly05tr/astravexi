import { CircleCheck, Flag, Sparkles } from 'lucide-react';
import type { Suggestion } from '../../core/ports';
import { Button } from '../../ui/Button';
import type { SuggestionsState } from './use-suggestions';

export interface SuggestionListProps {
  state: SuggestionsState;
  onDecide(suggestion: Suggestion, decision: 'accepted' | 'dismissed'): void | Promise<void>;
  /**
   * `summary`: only the first open suggestion, no empty/loading chatter.
   * `full`: every suggestion, grouped so each recommendation shows once, laid out as a card grid.
   */
  variant?: 'summary' | 'full';
}

/** One recommendation and every finding it answers. */
export interface SuggestionGroup {
  head: Suggestion;
  members: Suggestion[];
}

/** The same recommendation can answer several findings: show it once and list every reason. */
export function groupSuggestions(items: readonly Suggestion[]): SuggestionGroup[] {
  const groups = new Map<string, SuggestionGroup>();
  for (const s of items) {
    const group = groups.get(s.id);
    if (group) group.members.push(s);
    else groups.set(s.id, { head: s, members: [s] });
  }
  return [...groups.values()];
}

function SuggestionCard({ group, onDecide }: { group: SuggestionGroup; onDecide: SuggestionListProps['onDecide'] }) {
  const { head, members } = group;
  const open = members.filter((m) => m.decision !== 'accepted');
  const reasons = [
    ...new Set(
      members.flatMap((m) => (m.rationales && m.rationales.length > 0 ? m.rationales : [m.rationale])),
    ),
  ];
  // A decision applies to every finding this recommendation answers. One at a time: each write reads the
  // session the previous one produced, so no decision is lost.
  const decide = async (decision: 'accepted' | 'dismissed') => {
    for (const m of open) await onDecide(m, decision);
  };
  return (
    <li className="proposal" data-origin={head.origin}>
      <div className="proposal__head">
        <p className="eyebrow">
          {head.origin === 'llm' ? <Sparkles size={12} aria-label="Generated" /> : null}
          Proposed routine change
        </p>
        <p className="proposal__title">{head.title}</p>
      </div>

      <div className="proposal__block">
        <p className="proposal__label">Why</p>
        {reasons.length === 1 ? (
          <p className="proposal__why">{reasons[0]}</p>
        ) : (
          <ul className="proposal__why proposal__why-list" aria-label="Why">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="proposal__block">
        <p className="proposal__label">Steps</p>
        <ol className="proposal__steps">
          {head.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      <div className="proposal__footer">
        {head.evidence || head.needsVerification ? (
          <div className="citation">
            {head.evidence ? <span>Evidence: {head.evidence.label}</span> : null}
            {head.needsVerification ? (
              <span className="verify-mark">
                <Flag size={12} aria-hidden="true" />
                Needs verification
              </span>
            ) : null}
          </div>
        ) : null}
        {open.length === 0 ? (
          <p className="status-line">
            <CircleCheck size={14} aria-hidden="true" />
            Accepted
          </p>
        ) : (
          <div className="proposal__actions">
            <Button size="small" variant="primary" onClick={() => void decide('accepted')}>
              Accept
            </Button>
            <Button size="small" onClick={() => void decide('dismissed')}>
              Dismiss
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

/** Routine changes for the zone in focus. Shown only when an indicator crossed a threshold. */
export function SuggestionList({ state, onDecide, variant = 'full' }: SuggestionListProps) {
  if (state.status === 'idle') return null;
  const summary = variant === 'summary';
  const groups = groupSuggestions(state.items);
  const shown = summary ? groups.filter((g) => g.members.some((m) => m.decision !== 'accepted')).slice(0, 1) : groups;
  if (summary && shown.length === 0 && state.status !== 'error') return null;
  const headingId = summary ? 'zone-suggestion-top' : 'zone-suggestions';
  return (
    <section className="zone-section" aria-labelledby={headingId} aria-busy={state.status === 'loading'}>
      <h3 id={headingId}>{summary ? 'Recommended change' : 'What you can change in your routine'}</h3>
      {summary ? null : <p className="muted small">Optional. Accepting or dismissing never changes the alert.</p>}
      {!summary && state.status === 'loading' && state.items.length === 0 ? (
        <p className="muted" role="status">
          Preparing suggestions.
        </p>
      ) : null}
      {state.status === 'error' ? (
        <p className="banner" role="alert">
          Suggestions are unavailable right now ({state.message}). Your alerts are not affected.
        </p>
      ) : null}
      {!summary && state.status === 'ready' && state.items.length === 0 ? (
        <p className="muted">No open suggestions. You already decided on all of them.</p>
      ) : null}
      {shown.length > 0 ? (
        <ul className={summary ? 'stack proposal-list' : 'card-grid proposal-list'}>
          {shown.map((g) => (
            <SuggestionCard key={g.head.id} group={g} onDecide={onDecide} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
