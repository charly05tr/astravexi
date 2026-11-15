// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { applyBrand, brandVariables } from '../brand/apply-brand';
import { BrandProvider } from '../brand/brand-context';
import { brand } from '../brand/brand.config';
import type { BrandConfig } from '../brand/brand.types';
import { TIER_ORDER, TIER_THEME } from '../theme/tiers';
import { mountApp } from '../test-support/mount';
import { TierChip } from '../ui/TierChip';

/** A different brand: other name, colors, gradient, fonts and logos. Tier meaning must not move. */
const other: BrandConfig = {
  ...brand,
  productName: 'Other Brand',
  eventLabel: 'Some Other Event',
  colors: {
    sage: '#6A9970',
    mint: '#B7F0C6',
    peach: '#F0A080',
    steel: '#4F7F99',
    sky: '#88CCEE',
    deepTeal: '#2F4F5F',
    mist: '#C8D8E0',
    night: '#101820',
    white: '#FFFFFF',
    canvas: '#F4F5F7',
    ink: '#0A0A0A',
    inkMuted: '#4A4F52',
    border: '#7A7A7A',
    borderSubtle: '#DDDDDE',
  },
  gradient: 'linear-gradient(to bottom, #FFFFFF, #F4F5F7)',
  fonts: { display: 'Georgia, serif', body: 'Arial, sans-serif', mono: 'Courier, monospace' },
  logos: { full: '/brand-b/logo.svg', mark: '/brand-b/mark.svg', favicon: '/brand-b/favicon.svg' },
};

const chipsOf = (root: ParentNode) =>
  [...root.querySelectorAll('.tier-chip')].map((c) => c.outerHTML);

afterEach(() => {
  document.documentElement.removeAttribute('style');
});

describe('brand swap leaves tier meaning unchanged', () => {
  it('renders the same tier chips (color, icon, shape, label) under two brands', () => {
    const renderSet = (config: BrandConfig) =>
      render(
        <BrandProvider value={config}>
          {TIER_ORDER.map((s) => (
            <TierChip key={s} status={s} />
          ))}
        </BrandProvider>,
      );
    const a = renderSet(brand);
    const chipsA = chipsOf(a.container);
    a.unmount();
    const b = renderSet(other);
    expect(chipsOf(b.container)).toEqual(chipsA);
    expect(chipsA).toHaveLength(7);
    for (const status of TIER_ORDER) {
      expect(chipsA.join('')).toContain(TIER_THEME[status].label);
      expect(chipsA.join('')).toContain(TIER_THEME[status].color);
    }
  });

  it('changes the brand CSS variables, and only those, when another BrandConfig is applied', () => {
    applyBrand(brand);
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--brand-deep-teal')).toBe(brand.colors.deepTeal);
    expect(root.style.getPropertyValue('--surface')).toBe('var(--brand-canvas)');
    applyBrand(other);
    expect(root.style.getPropertyValue('--brand-deep-teal')).toBe(other.colors.deepTeal);
    expect(root.style.getPropertyValue('--brand-gradient')).toBe(other.gradient);
    expect(root.style.getPropertyValue('--font-display')).toBe(other.fonts.display);
    expect(document.title).toBe('Other Brand');
    // No variable carries a tier color.
    for (const value of Object.values(brandVariables(other))) {
      for (const theme of Object.values(TIER_THEME)) expect(value).not.toBe(theme.color);
    }
  });

  it('renders the whole app under another brand with identical tier chips in the alert rail', async () => {
    const first = await mountApp('demo');
    const railA = chipsOf(screen.getByRole('list', { name: /body zones by alert tier/i }));
    first.unmount();

    await mountApp('demo', { brandConfig: other });
    expect(within(screen.getByRole('banner')).getByText('Other Brand')).toBeInTheDocument();
    expect(screen.getByText(/Entry for the Some Other Event/)).toBeInTheDocument();
    const railB = chipsOf(screen.getByRole('list', { name: /body zones by alert tier/i }));
    expect(railB).toEqual(railA);
    expect(railB).toHaveLength(6);
    expect(document.querySelector('.brand__mark')).toHaveAttribute('src', '/brand-b/mark.svg');
  });
});
