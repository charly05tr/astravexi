import { CheckCircle, CircleDashed, Clock, Info, Warning, WarningDiamond, WarningOctagon } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import type { ZoneStatus } from '../core/health/model';

/**
 * The alert-tier palette. It is independent of the brand on purpose: a brand swap must never change what
 * an alert means. This file imports nothing from src/brand, and its hex literals are the only ones allowed
 * outside src/brand.
 *
 * The stage colors come from the brand sheet's semaphore ("Colores por etapa"): green = no findings,
 * yellow = Caution, red = Warning. Notice and Information use the corporate blues, which differ from each
 * other in lightness. Every status is coded four ways (color, icon, shape, text label), so none relies on
 * color alone.
 *
 * The semaphore colors are light, so they are FILLS with dark text on top (4.5:1 or better), never text or
 * standalone glyphs on white.
 */
export type TierShape = 'circle' | 'diamond' | 'triangle' | 'octagon' | 'ring' | 'dashed' | 'square';

export interface TierTheme {
  status: ZoneStatus;
  label: string;
  /** Fill of the chip and accent marks. Never used as a text color. */
  color: string;
  icon: Icon;
  shape: TierShape;
  meaning: string;
}

/** Label and glyph color on top of a tier fill. */
export const TIER_CHIP_TEXT = '#121212';

export const TIER_THEME: Readonly<Record<ZoneStatus, TierTheme>> = {
  information: { status: 'information', label: 'Information', color: '#BDD2DC', icon: Info, shape: 'circle', meaning: 'For your awareness. Nothing to act on.' },
  notice: { status: 'notice', label: 'Notice', color: '#5B8EA8', icon: WarningDiamond, shape: 'diamond', meaning: 'A change worth watching.' },
  caution: { status: 'caution', label: 'Caution', color: '#D8D260', icon: Warning, shape: 'triangle', meaning: 'Act on a routine change. The Crew Medical Officer is informed.' },
  warning: { status: 'warning', label: 'Warning', color: '#DB7B5E', icon: WarningOctagon, shape: 'octagon', meaning: 'Urgent. The Crew Medical Officer and the flight surgeon are informed.' },
  none: { status: 'none', label: 'No findings', color: '#A9F5BB', icon: CheckCircle, shape: 'ring', meaning: 'Monitored, with recent data and nothing active.' },
  noData: { status: 'noData', label: 'No data', color: '#D5C8EE', icon: Clock, shape: 'square', meaning: 'Monitored, but there is no recent reading.' },
  unmonitored: { status: 'unmonitored', label: 'Not monitored', color: '#E4E4E5', icon: CircleDashed, shape: 'dashed', meaning: 'No indicator feeds this zone in this prototype.' },
};

export const TIER_ORDER: readonly ZoneStatus[] = ['warning', 'caution', 'notice', 'information', 'none', 'noData', 'unmonitored'];

export function tierTheme(status: ZoneStatus): TierTheme {
  return TIER_THEME[status];
}
