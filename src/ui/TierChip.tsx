import type { CSSProperties } from 'react';
import type { ZoneStatus } from '../core/health/model';
import { TIER_CHIP_SURFACE, TIER_CHIP_TEXT, tierTheme } from '../theme/tiers';
import type { TierShape } from '../theme/tiers';

const SHAPE_PATHS: Record<TierShape, string> = {
  circle: 'M12 2.5a9.5 9.5 0 1 0 0 19a9.5 9.5 0 0 0 0-19z',
  ring: 'M12 2.5a9.5 9.5 0 1 0 0 19a9.5 9.5 0 0 0 0-19z',
  dashed: 'M12 2.5a9.5 9.5 0 1 0 0 19a9.5 9.5 0 0 0 0-19z',
  diamond: 'M12 1.5L22.5 12L12 22.5L1.5 12Z',
  triangle: 'M12 2.5L22.5 21.5H1.5Z',
  octagon: 'M8 2H16L22 8V16L16 22H8L2 16V8Z',
  square: 'M3.5 3.5H20.5V20.5H3.5Z',
};

/** Style variables of a status, for elements that want the tier color on a border (never on text). */
export function tierStyle(status: ZoneStatus): CSSProperties {
  return { ['--tier-color' as string]: tierTheme(status).color } as CSSProperties;
}

export function TierShapeGlyph({ status, size = 26 }: { status: ZoneStatus; size?: number }) {
  const theme = tierTheme(status);
  const Icon = theme.icon;
  const outline = theme.shape === 'ring' || theme.shape === 'dashed';
  return (
    <span className="tier-chip__glyph" style={{ width: size, height: size, ...tierStyle(status) }} aria-hidden="true">
      <svg
        className={`tier-chip__shape${outline ? ' tier-chip__shape--outline' : ''}`}
        viewBox="0 0 24 24"
        data-shape={theme.shape}
        strokeDasharray={theme.shape === 'dashed' ? '3 2.5' : undefined}
      >
        <path d={SHAPE_PATHS[theme.shape]} />
      </svg>
      <Icon className="tier-chip__icon" size={Math.round(size * 0.55)} weight="bold" />
    </span>
  );
}

/** Color, icon, shape and text label together. The chip owns its surface so it survives any brand. */
export function TierChip({ status }: { status: ZoneStatus }) {
  const theme = tierTheme(status);
  const style = {
    ...tierStyle(status),
    ['--chip-surface' as string]: TIER_CHIP_SURFACE,
    ['--chip-text' as string]: TIER_CHIP_TEXT,
  } as CSSProperties;
  return (
    <span className="tier-chip" style={style} data-status={status} data-tier-color={theme.color}>
      <TierShapeGlyph status={status} />
      <span>{theme.label}</span>
    </span>
  );
}
