import { describe, expect, it } from 'vitest';
import { brand } from '../brand/brand.config';
import type { BrandColorName } from '../brand/brand.types';
import { contrastRatio, hexToHsl } from '../test-support/color';
import { TIER_THEME } from '../theme/tiers';

// Every source file as raw text, keyed by path relative to this file.
const files = import.meta.glob('../**/*.{ts,tsx,css}', { query: '?raw', eager: true, import: 'default' }) as Record<
  string,
  string
>;

const isTest = (p: string) => /\.test\.(ts|tsx)$/.test(p) || p.includes('__fixtures__');
const inBrand = (p: string) => p.startsWith('../brand/');
const isTiers = (p: string) => p === '../theme/tiers.ts';
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;

// Source text as Vite reads it: invalid UTF-8 bytes decode to U+FFFD here, while the production
// bundler (rolldown) rejects the file outright. tsc and vitest tolerate them, so only this catches it.
const sourceText = import.meta.glob('../**/*.{ts,tsx,css,json}', { query: '?raw', eager: true, import: 'default' }) as Record<
  string,
  string
>;

describe('guard: every source file is valid UTF-8', () => {
  it('has no undecodable bytes (U+FFFD) in .ts, .tsx, .css or .json under src', () => {
    const offenders = Object.entries(sourceText)
      .filter(([, text]) => text.includes('�'))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});

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
  it('keeps the accent (peach) out of surfaces, text and text pairs: it is too light for either', () => {
    const accent = brand.roles.accent;
    for (const role of ['surface', 'panel', 'surfaceRaised', 'text', 'textMuted', 'onRaised'] as const) {
      expect(brand.roles[role], role).not.toBe(accent);
    }
    for (const [text, background] of brand.textPairs) {
      expect(text).not.toBe(accent);
      expect(background).not.toBe(accent);
    }
  });

  it('gives every tier its own badge color and surface', () => {
    expect(new Set(Object.values(TIER_THEME).map((t) => t.color.toUpperCase())).size).toBe(7);
    expect(new Set(Object.values(TIER_THEME).map((t) => t.surface.toUpperCase())).size).toBe(7);
  });

  it('never uses the accent or focus color as a CSS background', () => {
    const restricted = /background[^;{}]*var\(--(?:accent|focus|brand-peach)\)/;
    const offenders = Object.entries(files)
      .filter(([p, text]) => !isTest(p) && !inBrand(p) && restricted.test(text))
      .map(([p]) => p);
    expect(offenders).toEqual([]);
  });

  it('wires every role to a declared color', () => {
    const names = Object.keys(brand.colors) as BrandColorName[];
    for (const color of Object.values(brand.roles)) expect(names).toContain(color);
  });
});

describe('guard: contrast', () => {
  it('keeps every declared text pair at 4.5:1 or better', () => {
    for (const [text, background] of brand.textPairs) {
      const ratio = contrastRatio(brand.colors[text], brand.colors[background]);
      expect(ratio, `${text} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps every badge label and icon at 4.5:1 on its own surface and on white', () => {
    for (const theme of Object.values(TIER_THEME)) {
      expect(contrastRatio(theme.color, theme.surface), theme.status).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.color, '#FFFFFF'), `${theme.status} on white`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the focus ring at 3:1 on the page and on cards', () => {
    expect(contrastRatio(brand.colors[brand.roles.focus], brand.colors[brand.roles.surface])).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(brand.colors[brand.roles.focus], brand.colors[brand.roles.panel])).toBeGreaterThanOrEqual(3);
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
