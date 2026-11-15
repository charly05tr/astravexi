import { CircleAlert, CircleCheck, CircleDashed, Clock, Info, OctagonAlert, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ZoneStatus } from '../core/health/model';

/**
 * The alert-tier palette. It is independent of the brand on purpose: a brand swap must never change what
 * an alert means. This file imports nothing from src/brand, and its hex literals are the only ones allowed
 * outside src/brand.
 *
 * Badges follow the semantic status style of the reference app: a soft surface, with a dark text and icon
 * color on top (4.5:1 or better), and no side bars. Warning = danger, Caution = warning, No findings =
 * success. Every status is coded four ways (color, icon, shape, text label), so none relies on color alone.
 *
 * `accent` is the brand sheet's semaphore color ("Colores por etapa"). It is only used where a bright mark is
 * needed on a dark background (the organ glow in the 3D body), never as text.
 */
export type TierShape = 'circle' | 'diamond' | 'triangle' | 'octagon' | 'ring' | 'dashed' | 'square';

export interface TierTheme {
  status: ZoneStatus;
  label: string;
  /** Text and icon color of the badge. Reaches 4.5:1 on `surface` and on white. */
  color: string;
  /** Badge background. */
  surface: string;
  /** Bright semaphore color for marks on dark backgrounds. Never text. */
  accent: string;
  icon: LucideIcon;
  shape: TierShape;
  meaning: string;
}

export const TIER_THEME: Readonly<Record<ZoneStatus, TierTheme>> = {
  information: { status: 'information', label: 'Information', color: '#5B5A7A', surface: '#F0F0F5', accent: '#BDD2DC', icon: Info, shape: 'circle', meaning: 'For your awareness. Nothing to act on.' },
  notice: { status: 'notice', label: 'Notice', color: '#3C5160', surface: '#E8EFF4', accent: '#90D3F5', icon: CircleAlert, shape: 'diamond', meaning: 'A change worth watching.' },
  caution: { status: 'caution', label: 'Caution', color: '#8C5B24', surface: '#FAF0E2', accent: '#D8D260', icon: TriangleAlert, shape: 'triangle', meaning: 'Act on a routine change. The Crew Medical Officer is informed.' },
  warning: { status: 'warning', label: 'Warning', color: '#A3433C', surface: '#FBECEA', accent: '#DB7B5E', icon: OctagonAlert, shape: 'octagon', meaning: 'Urgent. The Crew Medical Officer and the flight surgeon are informed.' },
  none: { status: 'none', label: 'No findings', color: '#3F6B4D', surface: '#EAF3EC', accent: '#A9F5BB', icon: CircleCheck, shape: 'ring', meaning: 'Monitored, with recent data and nothing active.' },
  noData: { status: 'noData', label: 'No data', color: '#6A4F8C', surface: '#F2EEF8', accent: '#D5C8EE', icon: Clock, shape: 'square', meaning: 'Monitored, but there is no recent reading.' },
  unmonitored: { status: 'unmonitored', label: 'Not monitored', color: '#5F6366', surface: '#F4F4F5', accent: '#E4E4E5', icon: CircleDashed, shape: 'dashed', meaning: 'No indicator feeds this zone in this prototype.' },
};

export const TIER_ORDER: readonly ZoneStatus[] = ['warning', 'caution', 'notice', 'information', 'none', 'noData', 'unmonitored'];

export function tierTheme(status: ZoneStatus): TierTheme {
  return TIER_THEME[status];
}
