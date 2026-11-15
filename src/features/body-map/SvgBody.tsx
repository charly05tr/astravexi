import type { KeyboardEvent, ReactNode } from 'react';
import type { ZoneId } from '../../core/health/model';
import { tierTheme } from '../../theme/tiers';
import { tierStyle } from '../../ui/TierChip';
import type { BodyModelProps, ZoneView } from './body-model';

/** Where each zone sits on the silhouette, where its label goes, and where the leader line starts. */
interface ZoneLayout {
  shapes: ReactNode;
  anchor: [number, number];
  labelY: number;
}

const LAYOUT: Record<ZoneId, ZoneLayout> = {
  brain: { shapes: <ellipse cx="100" cy="36" rx="15" ry="11" />, anchor: [115, 36], labelY: 30 },
  eyes: {
    shapes: (
      <>
        <ellipse cx="90" cy="52" rx="6" ry="4" />
        <ellipse cx="110" cy="52" rx="6" ry="4" />
      </>
    ),
    anchor: [116, 52],
    labelY: 68,
  },
  immune: {
    shapes: (
      <>
        <circle cx="100" cy="80" r="6" />
        <circle cx="70" cy="108" r="6" />
        <circle cx="130" cy="108" r="6" />
      </>
    ),
    anchor: [136, 108],
    labelY: 106,
  },
  heart: { shapes: <circle cx="108" cy="130" r="13" />, anchor: [121, 130], labelY: 144 },
  metabolism: { shapes: <ellipse cx="100" cy="178" rx="21" ry="14" />, anchor: [121, 178], labelY: 188 },
  bone: {
    shapes: (
      <>
        <ellipse cx="100" cy="236" rx="24" ry="10" />
        <rect x="79" y="250" width="13" height="86" rx="6" />
        <rect x="108" y="250" width="13" height="86" rx="6" />
      </>
    ),
    anchor: [121, 292],
    labelY: 280,
  },
};

const LABEL_X = 196;

function ZoneGroup({
  zone,
  selected,
  onSelect,
}: {
  zone: ZoneView;
  selected: boolean;
  onSelect(id: ZoneId): void;
}) {
  const theme = tierTheme(zone.status);
  const Icon = theme.icon;
  const layout = LAYOUT[zone.id];
  const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(zone.id);
    }
  };
  const [ax, ay] = layout.anchor;
  return (
    <g
      className={`body-map__hit${selected ? ' body-map__selected' : ''}`}
      style={tierStyle(zone.status)}
      role="button"
      tabIndex={0}
      aria-label={`${zone.label}, ${theme.label}`}
      aria-pressed={selected}
      data-zone-id={zone.id}
      data-status={zone.status}
      onClick={() => onSelect(zone.id)}
      onKeyDown={onKeyDown}
    >
      <line x1={ax} y1={ay} x2={LABEL_X - 6} y2={layout.labelY + 4} className="body-map__leader" />
      <g className={`body-map__zone${theme.shape === 'dashed' ? ' body-map__zone--dashed' : ''}`}>{layout.shapes}</g>
      <rect x={LABEL_X - 4} y={layout.labelY - 14} width="124" height="36" rx="6" className="body-map__label-box" />
      <text x={LABEL_X} y={layout.labelY} className="body-map__label">
        {zone.label}
      </text>
      <g transform={`translate(${LABEL_X}, ${layout.labelY + 5})`} className="body-map__icon" aria-hidden="true">
        <Icon size={14} />
      </g>
      <text x={LABEL_X + 18} y={layout.labelY + 16} className="body-map__status">
        {theme.label}
      </text>
    </g>
  );
}

/**
 * The 2D body: a simple silhouette with six zones. It implements the same contract as the 3D hologram,
 * so it is the fallback when WebGL is unavailable and the stand-in in component tests.
 */
export function SvgBody({ zones, selectedZoneId, onSelectZone }: BodyModelProps) {
  const byId = new Map(zones.map((z) => [z.id, z]));
  const order: ZoneId[] = ['brain', 'eyes', 'immune', 'heart', 'metabolism', 'bone'];
  return (
    <svg className="body-map" viewBox="0 0 330 360" role="group" aria-label="Body map. Select a zone.">
      <g aria-hidden="true">
        <circle cx="100" cy="45" r="26" className="body-map__shell" />
        <rect x="92" y="70" width="16" height="14" className="body-map__shell" />
        <path d="M64 90 Q100 78 136 90 L140 215 L128 230 L72 230 L60 215 Z" className="body-map__shell" />
        <path d="M62 96 L42 196" className="body-map__limb" />
        <path d="M138 96 L158 196" className="body-map__limb" />
        <path d="M86 232 L82 340" className="body-map__limb body-map__limb--leg" />
        <path d="M114 232 L118 340" className="body-map__limb body-map__limb--leg" />
      </g>
      {order.map((id) => {
        const zone = byId.get(id);
        return zone ? <ZoneGroup key={id} zone={zone} selected={id === selectedZoneId} onSelect={onSelectZone} /> : null;
      })}
    </svg>
  );
}
