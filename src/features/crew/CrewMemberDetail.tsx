import { ArrowLeft } from 'lucide-react';
import { lazy, Suspense } from 'react';
import type { ZoneId } from '../../core/health/model';
import { Panel } from '../../ui/Panel';
import { TierChip, tierStyle } from '../../ui/TierChip';
import { CmoPanel } from '../cmo/CmoPanel';
import { ROLE_LABEL } from '../profiles/role-labels';
import type { CrewDetailView } from './crew-model';

const TrendChart = lazy(() => import('../insights/TrendChart'));

/** One crew member: zone statuses, the findings for review with Acknowledge, and trends. Presentational. */
export function CrewMemberDetail({
  detail,
  onBack,
  onAcknowledge,
}: {
  detail: CrewDetailView;
  onBack(): void;
  onAcknowledge(zoneId: ZoneId, groupId: string): void;
}) {
  const { card } = detail;
  return (
    <section className="crew" aria-labelledby="crew-member-title" data-profile-id={card.profileId}>
      <button type="button" className="link-button" onClick={onBack}>
        <ArrowLeft size={14} aria-hidden="true" />
        Back to crew
      </button>
      <header className="crew__head crew__head--member">
        <div>
          <p className="eyebrow">{ROLE_LABEL[card.role]}</p>
          <h2 id="crew-member-title">{card.name}</h2>
          <p className="item__meta">Last check-in: {card.lastCheckInText}</p>
        </div>
        <TierChip status={card.status} />
      </header>

      <div className="crew__columns">
        <div className="stack">
          <Panel title="Zones" id="crew-zones">
            <ul className="item-list" aria-label="Zone status">
              {detail.zones.map((z) => (
                <li key={z.zoneId} className="item item--row" style={tierStyle(z.status)} data-zone-id={z.zoneId}>
                  <strong>{z.label}</strong>
                  <TierChip status={z.status} />
                </li>
              ))}
            </ul>
          </Panel>
          <CmoPanel
            id="crew-findings"
            title="Findings for review"
            hint="Caution and Warning items only. Mood shows as a tier, never as a score."
            zones={detail.cmoZones}
            onAcknowledge={onAcknowledge}
          />
        </div>

        <Panel title="Trends" id="crew-trends" hint="Last 30 days. Mood is not charted: it stays a tier.">
          {detail.trends.length === 0 ? (
            <p className="empty">No readings to chart yet.</p>
          ) : (
            <ul className="indicator-list">
              {detail.trends.map((t) => (
                <li key={t.id} className="indicator">
                  <div className="indicator__head">
                    <strong>{t.label}</strong>
                  </div>
                  <Suspense fallback={<div className="trend" />}>
                    <TrendChart
                      points={t.trend.points}
                      baseline={t.trend.baseline}
                      label={t.label}
                      precision={t.precision}
                      unit={t.unit}
                    />
                  </Suspense>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </section>
  );
}
