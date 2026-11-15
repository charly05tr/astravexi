/** The shape of a brand. Components read values only through this type; the values live in brand.config.ts. */
export type BrandColorName =
  | 'sage'
  | 'mint'
  | 'peach'
  | 'steel'
  | 'sky'
  | 'deepTeal'
  | 'mist'
  | 'night'
  | 'white'
  | 'canvas'
  | 'ink'
  | 'inkMuted'
  | 'border'
  | 'borderSubtle';

export interface BrandRoles {
  /** Page background. */
  surface: BrandColorName;
  /** Cards and panels, one step above the page (no shadow). */
  panel: BrandColorName;
  /** Primary controls and the active state. */
  surfaceRaised: BrandColorName;
  /** Text on `surfaceRaised`. */
  onRaised: BrandColorName;
  text: BrandColorName;
  textMuted: BrandColorName;
  /** Card borders. */
  border: BrandColorName;
  /** Dividers and quiet outlines. */
  borderSubtle: BrandColorName;
  /** Accent marks only: never a surface and never text (too light for contrast). */
  accent: BrandColorName;
  /** Keyboard focus ring. */
  focus: BrandColorName;
  /** Chart series 1 (single-series line charts). */
  chartSeries: BrandColorName;
}

export interface BrandConfig {
  productName: string;
  /** Shown as a text credit only. No insignia. */
  eventLabel: string;
  colors: Record<BrandColorName, string>;
  /** Any CSS background image. */
  gradient: string;
  fonts: { display: string; body: string; mono: string };
  logos: { full: string; mark: string; favicon: string };
  roles: BrandRoles;
  /** [text, background] color names that must reach 4.5:1. */
  textPairs: ReadonlyArray<readonly [BrandColorName, BrandColorName]>;
  /** Colors the 3D scene derives from. */
  scene: { background: BrandColorName; keyLight: BrandColorName; rimLight: BrandColorName; starTint: BrandColorName };
}
