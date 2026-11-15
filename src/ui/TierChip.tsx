import type { CSSProperties } from 'react';
import type { ZoneStatus } from '../core/health/model';
import { tierTheme } from '../theme/tiers';

/** Style variables of a status: `--tier-color` (text and icon) and `--tier-surface` (soft background). */
export function tierStyle(status: ZoneStatus): CSSProperties {
  const theme = tierTheme(status);
  return { ['--tier-color' as string]: theme.color, ['--tier-surface' as string]: theme.surface } as CSSProperties;
}

/** Icon, color and text label together, on a soft surface. Independent of the brand. */
export function TierChip({ status }: { status: ZoneStatus }) {
  const theme = tierTheme(status);
  const Icon = theme.icon;
  return (
    <span
      className={`tier-chip${theme.shape === 'dashed' ? ' tier-chip--dashed' : ''}`}
      style={tierStyle(status)}
      data-status={status}
      data-shape={theme.shape}
      data-tier-color={theme.color}
    >
      <Icon className="tier-chip__icon" size={14} strokeWidth={2.25} aria-hidden="true" />
      <span>{theme.label}</span>
    </span>
  );
}
