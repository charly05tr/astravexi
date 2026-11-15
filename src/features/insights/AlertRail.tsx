import type { ZoneId } from '../../core/health/model';
import { Sparkline } from '../../ui/Sparkline';
import { TierChip, tierStyle } from '../../ui/TierChip';

export interface AlertRailRow {
  id: ZoneId;
  label: string;
  status: Parameters<typeof tierStyle>[0];
  note: string;
  /** The zone's primary indicator over the trend window, when the zone is monitored and has data. */
  spark: { label: string; values: number[]; baseline: number | null; last: string | null } | null;
}

/**
 * The alert rail: the six zones sorted by tier, each a button with a tier chip (color, icon, shape and
 * label) and a sparkline of its primary indicator. It is also the accessible fallback for any body
 * renderer, so every zone is reachable by keyboard and screen reader without the body model.
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
            <span className="rail__top">
              <span className="rail__name">{row.label}</span>
              <TierChip status={row.status} />
            </span>
            {row.spark ? (
              <span className="rail__metric">
                <Sparkline values={row.spark.values} baseline={row.spark.baseline} />
                <span className="rail__value">
                  <span className="rail__metric-label">{row.spark.label}</span>
                  <span className="mono">{row.spark.last ?? 'No reading'}</span>
                </span>
              </span>
            ) : null}
            <span className="rail__note">{row.note}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
