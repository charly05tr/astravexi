import type { BrandConfig } from './brand.types';

/**
 * THE brand. Swapping the brand means editing this file, public/brand/* and (for other typefaces) fonts.ts.
 * Nothing else in the app may contain a brand color, font name or logo path.
 */
const colors = {
  blueYonder: '#2E96F5',
  neonBlue: '#0960E1',
  electricBlue: '#0042A6',
  deepBlue: '#07173F',
  rocketRed: '#E43700',
  martianRed: '#8E1100',
  neonYellow: '#EAFE07',
  white: '#FFFFFF',
} as const;

export const brand: BrandConfig = {
  productName: 'Astravexi', // placeholder: the repository name
  eventLabel: 'NASA Space Apps Challenge 2026',
  colors,
  // The brand's "45 degrees" runs from the top-left corner to the bottom-right corner.
  gradient: `linear-gradient(to bottom right, ${colors.electricBlue}, ${colors.deepBlue})`,
  fonts: {
    display: "'Fira Sans', system-ui, sans-serif",
    body: "'Overpass', system-ui, sans-serif",
    mono: "'Overpass Mono', ui-monospace, monospace",
  },
  logos: { full: '/brand/logo.svg', mark: '/brand/logo-mark.svg', favicon: '/brand/favicon.svg' },
  roles: {
    surface: 'deepBlue',
    surfaceRaised: 'electricBlue',
    text: 'white',
    textMuted: 'blueYonder',
    accent: 'neonYellow',
    focus: 'neonYellow',
  },
  textPairs: [
    ['white', 'deepBlue'],
    ['white', 'electricBlue'],
    ['blueYonder', 'deepBlue'],
  ],
  scene: { hologram: 'blueYonder', starTint: 'white', marsBase: 'martianRed', marsHighlight: 'rocketRed' },
};
