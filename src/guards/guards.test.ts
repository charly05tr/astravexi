import { describe, expect, it } from 'vitest';
import { brand } from '../brand/brand.config';
import type { BrandColorName } from '../brand/brand.types';
import { contrastRatio, hexToHsl } from '../test-support/color';
import { TIER_CHIP_SURFACE, TIER_CHIP_TEXT, TIER_THEME } from '../theme/tiers';

// Every source file as raw text, keyed by path relative to this file.
const files = import.meta.glob('../**/*.{ts,tsx,css}', { query: '?raw', eager: true, import: 'default' }) as Record<
  string,
  string
>;

const isTest = (p: string) => /\.test\.(ts|tsx)$/.test(p) || p.includes('__fixtures__');
const inBrand = (p: string) => p.startsWith('../brand/');
const isTiers = (p: string) => p === '../theme/tiers.ts';
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;

describe('guard: brand values live in one place', () => {
  it('scans a realistic number of files', () => {
    expect(Object.keys(files).length).toBeGreaterThan(40);
  });

  it('has no hex color literal in .ts, .tsx or .css outside src/brand and src/theme/tiers.ts', () => {
    const offenders: string[] = [];
    for (const [path, text] of Object.entries(files)) {
      if (isTest(path) || inBrand(path) || isTiers(path)) continue;
      const hits = text.match(HEX);
      if (hits) offenders.push(`${path}: ${hits.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the scan honest: it does find hex literals where they are allowed', () => {
    expect(files['../brand/brand.config.ts']!.match(HEX)?.length).toBeGreaterThanOrEqual(8);
    expect(files['../theme/tiers.ts']!.match(HEX)?.length).toBeGreaterThanOrEqual(7);
  });

  it('imports brand.config only from the composition root', () => {
    const importers = Object.entries(files)
      .filter(([p, text]) => !isTest(p) && !p.startsWith('../test-support/') && /from ['"][^'"]*brand\.config['"]/.test(text))
      .map(([p]) => p);
    expect(importers).toEqual(['../app/composition-root.ts']);
  });

  it('keeps the tier palette independent of the brand', () => {
    expect(files['../theme/tiers.ts']).not.toMatch(/from ['"][^'"]*brand/);
  });
});

describe('guard: brand roles', () => {
  const forbiddenSurface: BrandColorName[] = ['rocketRed', 'neonYellow'];

  it('never makes Rocket Red or Neon Yellow a surface or a text-pair background', () => {
    expect(forbiddenSurface).not.toContain(brand.roles.surface);
    expect(forbiddenSurface).not.toContain(brand.roles.surfaceRaised);
    for (const [, background] of brand.textPairs) expect(forbiddenSurface).not.toContain(background);
  });

  it('uses Neon Yellow only as accent or focus, and Rocket Red in no role', () => {
    const roles = Object.entries(brand.roles) as Array<[string, BrandColorName]>;
    for (const [role, color] of roles) {
      if (color === 'neonYellow') expect(['accent', 'focus']).toContain(role);
      expect(color).not.toBe('rocketRed');
    }
  });

  it('never uses a restricted color as a CSS or inline background', () => {
    const restricted = /background[^;{}]*var\(--(?:brand-rocket-red|brand-neon-yellow|brand-martian-red|accent|focus)\)/;
    const offenders = Object.entries(files)
      .filter(([p, text]) => !isTest(p) && !inBrand(p) && restricted.test(text))
      .map(([p]) => p);
    expect(offenders).toEqual([]);
  });
});

describe('guard: contrast', () => {
  it('keeps every declared text pair at 4.5:1 or better', () => {
    for (const [text, background] of brand.textPairs) {
      const ratio = contrastRatio(brand.colors[text], brand.colors[background]);
      expect(ratio, `${text} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the tier chip label at 4.5:1 and every tier glyph at 3:1 on the chip surface', () => {
    expect(contrastRatio(TIER_CHIP_TEXT, TIER_CHIP_SURFACE)).toBeGreaterThanOrEqual(4.5);
    for (const theme of Object.values(TIER_THEME)) {
      expect(contrastRatio(theme.color, TIER_CHIP_SURFACE), theme.status).toBeGreaterThanOrEqual(3);
    }
  });

  it('computes contrast correctly (white on black is 21:1)', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
  });
});

describe('guard: tier theme', () => {
  const themes = Object.values(TIER_THEME);

  it('gives all seven statuses a distinct color, icon, shape and label', () => {
    expect(themes).toHaveLength(7);
    for (const key of ['color', 'icon', 'shape', 'label'] as const) {
      expect(new Set(themes.map((t) => t[key])).size, key).toBe(themes.length);
    }
  });

  it('does not make Notice green, and is not colored like the brand scale', () => {
    const { h } = hexToHsl(TIER_THEME.notice.color);
    const isGreen = h >= 75 && h <= 165;
    expect(isGreen).toBe(false);
  });

  it('keeps the ordered tiers apart in hue family or lightness', () => {
    const order = ['information', 'notice', 'caution', 'warning'] as const;
    for (let i = 0; i < order.length; i += 1) {
      for (let j = i + 1; j < order.length; j += 1) {
        const a = hexToHsl(TIER_THEME[order[i]!].color);
        const b = hexToHsl(TIER_THEME[order[j]!].color);
        const hueGap = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h));
        expect(hueGap > 25 || Math.abs(a.l - b.l) > 0.15, `${order[i]} vs ${order[j]}`).toBe(true);
      }
    }
  });
});
