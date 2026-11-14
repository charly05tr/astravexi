import type { BrandColorName, BrandConfig } from './brand.types';

const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** The CSS custom properties of a brand, as a plain record (also used by tests). */
export function brandVariables(config: BrandConfig): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [name, value] of Object.entries(config.colors)) vars[`--brand-${kebab(name)}`] = value;
  const color = (role: BrandColorName) => `var(--brand-${kebab(role)})`;
  vars['--surface'] = color(config.roles.surface);
  vars['--surface-raised'] = color(config.roles.surfaceRaised);
  vars['--text'] = color(config.roles.text);
  vars['--text-muted'] = color(config.roles.textMuted);
  vars['--accent'] = color(config.roles.accent);
  vars['--focus'] = color(config.roles.focus);
  vars['--brand-gradient'] = config.gradient;
  vars['--font-display'] = config.fonts.display;
  vars['--font-body'] = config.fonts.body;
  vars['--font-mono'] = config.fonts.mono;
  return vars;
}

/** Writes the brand onto an element (the document root by default), then the title and favicon. */
export function applyBrand(config: BrandConfig, doc: Document = document): void {
  const root = doc.documentElement;
  for (const [name, value] of Object.entries(brandVariables(config))) root.style.setProperty(name, value);
  doc.title = config.productName;
  let icon = doc.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!icon) {
    icon = doc.createElement('link');
    icon.rel = 'icon';
    doc.head.appendChild(icon);
  }
  icon.href = config.logos.favicon;
}
