import type { BrandConfig } from './brand.types';

/**
 * THE brand. Swapping the brand means editing this file, public/brand/* and (for other typefaces) fonts.ts.
 * Nothing else in the app may contain a brand color, font name or logo path.
 *
 * Palette from the brand sheet ("Paleta de color", "Colores principales", "Monocroma corporativo"). The
 * stage (semaphore) colors are NOT here: they encode alert tiers and live in src/theme/tiers.ts.
 * Neutrals follow the minimal light reference: off-white page, white cards, grey borders, near-black ink.
 */
const colors = {
  sage: '#7DA887',
  mint: '#A9F5BB',
  peach: '#F5B49D',
  steel: '#5B8EA8',
  sky: '#90D3F5',
  deepTeal: '#446B7E',
  mist: '#BDD2DC',
  night: '#14232B',
  white: '#FFFFFF',
  canvas: '#F9FAFB',
  ink: '#121212',
  inkMuted: '#53595C',
  border: '#8E8E8E',
  borderSubtle: '#E4E4E5',
} as const;

export const brand: BrandConfig = {
  productName: 'Astravexi', // placeholder: the repository name
  eventLabel: 'NASA Space Apps Challenge 2026',
  colors,
  gradient: `linear-gradient(to bottom, ${colors.white}, ${colors.canvas})`,
  fonts: {
    display: "'Inter', system-ui, sans-serif",
    body: "'Space Grotesk', system-ui, sans-serif",
    mono: "'Space Grotesk', ui-monospace, monospace",
  },
  logos: { full: '/brand/logo.svg', mark: '/brand/logo-mark.svg', favicon: '/brand/favicon.svg' },
  roles: {
    surface: 'canvas',
    panel: 'white',
    surfaceRaised: 'deepTeal',
    onRaised: 'white',
    text: 'ink',
    textMuted: 'inkMuted',
    border: 'border',
    borderSubtle: 'borderSubtle',
    accent: 'peach',
    focus: 'steel',
    chartSeries: 'deepTeal',
  },
  textPairs: [
    ['ink', 'white'],
    ['ink', 'canvas'],
    ['inkMuted', 'white'],
    ['inkMuted', 'canvas'],
    ['white', 'deepTeal'],
    ['deepTeal', 'white'],
  ],
  scene: { background: 'night', keyLight: 'white', rimLight: 'sky', starTint: 'white' },
};
