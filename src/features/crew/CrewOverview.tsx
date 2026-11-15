import { Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { EmptyState } from '../../ui/Panel';
import { TierChip, tierStyle } from '../../ui/TierChip';
import { ROLE_LABEL } from '../profiles/role-labels';
import type { CrewCardView } from './crew-model';

/** Crew overview: one card per member, worst status first. Presentational: no store access. */
export function CrewOverview({
  cards,
  unavailable,
  onOpen,
  children,
}: {
  cards: readonly CrewCardView[];
  unavailable: readonly string[];
  onOpen(profileId: string): void;
  /** Rendered below the crew list, e.g. the medication stock. */
  children?: ReactNode;
}) {
  return (
    <section className="crew" aria-labelledby="crew-title">
      <header className="crew__head">
        <h2 id="crew-title" className="crew__title">
          <Users size={22} aria-hidden="true" />
          Crew
        </h2>
        <p className="panel__hint">Profiles on this device, worst status first. Mood shows as a tier, never as a score.</p>
      </header>
      {unavailable.length > 0 ? (
        <p className="banner" role="alert">
          Records could not be read for: {unavailable.join(', ')}.
        </p>
      ) : null}
      {cards.length === 0 ? (
        <EmptyState>No crew on this device yet. Astronaut profiles appear here once they exist.</EmptyState>
      ) : (
        <ul className="crew__grid" aria-label="Crew members">
          {cards.map((card) => (
            <li key={card.profileId}>
              <button
                type="button"
                className="crew-card"
                style={tierStyle(card.status)}
                data-profile-id={card.profileId}
                data-status={card.status}
                onClick={() => onOpen(card.profileId)}
              >
                <span className="crew-card__head">
                  <span className="crew-card__who">
                    <strong className="crew-card__name">{card.name}</strong>
                    <span className="eyebrow">{ROLE_LABEL[card.role]}</span>
                  </span>
                  <TierChip status={card.status} />
                </span>
                <span className="crew-card__count">
                  <span className="crew-card__number">{card.concernCount}</span>
                  <span>
                    {card.concernCount === 1 ? 'active finding at Caution or above' : 'active findings at Caution or above'}
                  </span>
                </span>
                {card.topFindings.length > 0 ? (
                  <ul className="crew-card__findings" aria-label="Top findings">
                    {card.topFindings.map((f) => (
                      <li key={f.key} className="crew-card__finding">
                        <span>{f.indicatorLabel}</span>
                        <TierChip status={f.tier} />
                      </li>
                    ))}
                  </ul>
                ) : null}
                <span className="item__meta">Last check-in: {card.lastCheckInText}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {children}
      <p className="muted small">Local data on this device. Decision support, not medical advice.</p>
    </section>
  );
}
