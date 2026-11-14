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
    blueYonder: '#88CCEE',
    neonBlue: '#3355AA',
    electricBlue: '#223388',
    deepBlue: '#101830',
    rocketRed: '#CC3311',
    martianRed: '#882211',
    neonYellow: '#FFEE33',
    white: '#FFFFFF',
  },
  gradient: 'linear-gradient(to bottom right, #223388, #101830)',
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
    expect(root.style.getPropertyValue('--brand-deep-blue')).toBe(brand.colors.deepBlue);
    expect(root.style.getPropertyValue('--surface')).toBe('var(--brand-deep-blue)');
    applyBrand(other);
    expect(root.style.getPropertyValue('--brand-deep-blue')).toBe(other.colors.deepBlue);
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
