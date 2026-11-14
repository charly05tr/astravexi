import { CheckCircle, CircleDashed, Clock, Info, Warning, WarningDiamond, WarningOctagon } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import type { ZoneStatus } from '../core/health/model';

/**
 * The alert-tier palette. It is independent of the brand on purpose: a brand swap must never change what
 * an alert means. This file imports nothing from src/brand, and its hex literals are the only ones allowed
 * outside src/brand.
 *
 * Every status is coded four ways (color, icon, shape, text label), so none of them relies on color alone.
 * Colors are chosen for colorblind safety: the ordered tiers differ in lightness and hue family
 * (grey, sky blue, amber, red), Notice is not green, and the only green is "no findings".
 */
export type TierShape = 'circle' | 'diamond' | 'triangle' | 'octagon' | 'ring' | 'dashed' | 'square';

export interface TierTheme {
  status: ZoneStatus;
  label: string;
  /** Glyph and border color. Never used as a text color. */
  color: string;
  icon: Icon;
  shape: TierShape;
  meaning: string;
}

/** The chip owns its surface (spec R8.3), so tier meaning and contrast survive any brand. */
export const TIER_CHIP_SURFACE = '#0B1020';
export const TIER_CHIP_TEXT = '#F5F7FA';

export const TIER_THEME: Readonly<Record<ZoneStatus, TierTheme>> = {
  information: { status: 'information', label: 'Information', color: '#B8C4D6', icon: Info, shape: 'circle', meaning: 'For your awareness. Nothing to act on.' },
  notice: { status: 'notice', label: 'Notice', color: '#56B4E9', icon: WarningDiamond, shape: 'diamond', meaning: 'A change worth watching.' },
  caution: { status: 'caution', label: 'Caution', color: '#FFB020', icon: Warning, shape: 'triangle', meaning: 'Act on a routine change. The Crew Medical Officer is informed.' },
  warning: { status: 'warning', label: 'Warning', color: '#FF4D6D', icon: WarningOctagon, shape: 'octagon', meaning: 'Urgent. The Crew Medical Officer and the flight surgeon are informed.' },
  none: { status: 'none', label: 'No findings', color: '#7FD1AE', icon: CheckCircle, shape: 'ring', meaning: 'Monitored, with recent data and nothing active.' },
  noData: { status: 'noData', label: 'No data', color: '#B0A4D8', icon: Clock, shape: 'square', meaning: 'Monitored, but there is no recent reading.' },
  unmonitored: { status: 'unmonitored', label: 'Not monitored', color: '#6B7A90', icon: CircleDashed, shape: 'dashed', meaning: 'No indicator feeds this zone in this prototype.' },
};

export const TIER_ORDER: readonly ZoneStatus[] = ['warning', 'caution', 'notice', 'information', 'none', 'noData', 'unmonitored'];

export function tierTheme(status: ZoneStatus): TierTheme {
  return TIER_THEME[status];
}
