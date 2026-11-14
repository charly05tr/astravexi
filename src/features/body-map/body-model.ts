import type { ComponentType } from 'react';
import type { ZoneId, ZoneStatus } from '../../core/health/model';

export interface ZoneView {
  id: ZoneId;
  label: string;
  status: ZoneStatus;
}

/**
 * The contract every body implementation fulfils: per-zone status in, a zone selection out. Swapping the
 * 2D SVG body for the 3D hologram (batch 4) must not change rule, panel or rail code.
 */
export interface BodyModelProps {
  zones: readonly ZoneView[];
  selectedZoneId: ZoneId | null;
  onSelectZone(id: ZoneId): void;
  /** True when the user asked for reduced motion: no pulses, drift or auto-rotate. */
  reducedMotion?: boolean;
}

export type BodyModel = ComponentType<BodyModelProps>;
