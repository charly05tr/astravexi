/** The shape of a brand. Components read values only through this type; the values live in brand.config.ts. */
export type BrandColorName =
  | 'blueYonder'
  | 'neonBlue'
  | 'electricBlue'
  | 'deepBlue'
  | 'rocketRed'
  | 'martianRed'
  | 'neonYellow'
  | 'white';

export interface BrandRoles {
  /** Page and panel background. Must not be Rocket Red or Neon Yellow. */
  surface: BrandColorName;
  /** Active controls and emphasis surfaces. Must not be Rocket Red or Neon Yellow. */
  surfaceRaised: BrandColorName;
  text: BrandColorName;
  textMuted: BrandColorName;
  /** Accent marks only (never a surface). */
  accent: BrandColorName;
  /** Keyboard focus ring. */
  focus: BrandColorName;
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
  /** [text, background] role names or color names that must reach 4.5:1. */
  textPairs: ReadonlyArray<readonly [BrandColorName, BrandColorName]>;
  /** Colors the 3D scene derives from (batch 4). */
  scene: { hologram: BrandColorName; starTint: BrandColorName; marsBase: BrandColorName; marsHighlight: BrandColorName };
}
