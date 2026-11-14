import type { ZoneId } from '../../core/health/model';
import { TierChip, tierStyle } from '../../ui/TierChip';

export interface AlertRailRow {
  id: ZoneId;
  label: string;
  status: Parameters<typeof tierStyle>[0];
  note: string;
}

/**
 * The alert rail: the six zones sorted by tier, each a button with a tier chip (color, icon, shape and
 * label). It is also the accessible fallback for any body renderer, so every zone is reachable by keyboard
 * and screen reader without the body model.
 */
export function AlertRail({
  rows,
  selectedZoneId,
  onSelect,
}: {
  rows: readonly AlertRailRow[];
  selectedZoneId: ZoneId | null;
  onSelect(id: ZoneId): void;
}) {
  return (
    <ul className="rail" aria-label="Body zones by alert tier">
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            className="rail__item"
            style={tierStyle(row.status)}
            aria-pressed={row.id === selectedZoneId}
            data-zone-id={row.id}
            onClick={() => onSelect(row.id)}
          >
            <span className="rail__name">{row.label}</span>
            <TierChip status={row.status} />
            <span className="rail__note">{row.note}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
