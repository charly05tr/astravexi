import { Stethoscope } from 'lucide-react';
import type { ZoneId } from '../../core/health/model';
import { SourceBadge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { EmptyState, Panel } from '../../ui/Panel';
import { TierChip, tierStyle } from '../../ui/TierChip';
import type { CmoZoneView } from './cmo-model';

/** On-board Crew Medical Officer view. Presentational: no store access. */
export function CmoPanel({
  zones,
  onAcknowledge,
  title = 'Crew Medical Officer',
  hint = 'On board. Caution and Warning items only. Mood shows as a tier, never as a score.',
  id = 'cmo',
}: {
  zones: readonly CmoZoneView[];
  onAcknowledge(zoneId: ZoneId, groupId: string): void;
  /** The crew detail reuses the panel for one member, under its own heading. */
  title?: string;
  hint?: string;
  id?: string;
}) {
  return (
    <Panel
      id={id}
      title={title}
      icon={<Stethoscope size={20} aria-hidden="true" />}
      hint={hint}
    >
      {zones.length === 0 ? (
        <EmptyState>Nothing needs review.</EmptyState>
      ) : (
        <ul className="item-list">
          {zones.map((zone) => (
            <li className="item" key={zone.zoneId} style={tierStyle(zone.status)} data-zone-id={zone.zoneId}>
              <div className="item__head">
                <strong>{zone.zoneLabel}</strong>
                <TierChip status={zone.status} />
              </div>
              {zone.corroborated ? (
                <p className="item__meta">Raised to Caution because two sustained signals agree. Tiers only.</p>
              ) : null}
              <ul className="item-list">
                {zone.items.map((item) => (
                  <li key={item.key} className="item__meta">
                    <span style={{ color: 'var(--text)' }}>
                      {item.tierOnlyText ?? `${item.indicatorLabel}${item.valueText ? `: ${item.valueText}` : ''}`}
                    </span>{' '}
                    - {item.ruleId} <SourceBadge source={item.source} />
                  </li>
                ))}
              </ul>
              {zone.latched.map((group) => (
                <div key={group.groupId} className="stack" style={{ gap: 6 }}>
                  <p className="latched" style={tierStyle('warning')}>
                    Warning{group.latest.length > 0 ? ` - latest re-measure ${group.latest.join(', ')}` : ''}
                  </p>
                  <div>
                    <Button
                      size="small"
                      variant="primary"
                      aria-label={`Acknowledge ${zone.zoneLabel} warning`}
                      onClick={() => onAcknowledge(zone.zoneId, group.groupId)}
                    >
                      Acknowledge
                    </Button>
                  </div>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
