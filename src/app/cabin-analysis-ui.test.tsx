// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mountApp } from '../test-support/mount';

/** The findings only: the evidence lists inside an opened finding are lists too. */
const findings = (list: HTMLElement) => within(list).getAllByRole('listitem').filter((li) => li.hasAttribute('data-verdict'));

async function openPage(role: 'cmo' | 'flightSurgeon' | 'astronaut' = 'cmo', mode: 'demo' | 'live' = 'demo') {
  const app = await mountApp(mode, { role });
  await app.user.click(await screen.findByRole('button', { name: /^cabin & crew$/i }));
  return app;
}

describe('Cabin & crew analysis page', () => {
  it('is reachable from the CMO navigation and has a heading', async () => {
    await openPage();
    expect(await screen.findByRole('heading', { name: /cabin & crew analysis/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^cabin & crew$/i })).toHaveAttribute('aria-current', 'page');
  });

  it('shows the cabin variables against their NASA limits with a citation', async () => {
    await openPage();
    const panel = await screen.findByRole('region', { name: /^cabin variables$/i });
    const temp = within(panel).getByText('Cabin temperature').closest('li')!;
    expect(within(temp).getByText(/NASA limit 18 to 27 °C; comfort zone 20 to 25 °C/)).toBeInTheDocument();
    expect(within(temp).getByRole('link', { name: /OCHMO-TB-002/ })).toHaveAttribute('href', expect.stringContaining('ochmo-tb-002'));
    expect(within(panel).getAllByText('SYNTHETIC').length).toBeGreaterThan(0);
    const dose = within(panel).getByText(/Radiation dose/).closest('li')!;
    expect(within(dose).getByText(/Career limit 600 mSv/)).toBeInTheDocument();
  });

  it('lists atypical readings with a verdict and the three signals as evidence', async () => {
    const app = await openPage();
    const panel = await screen.findByRole('region', { name: /^atypical readings$/i });
    const list = within(panel).getByRole('list', { name: /^atypical readings$/i });
    expect(within(list).getAllByText('Likely external (cabin)').length).toBeGreaterThan(0);

    // Open the isolated heart-rate spike of the third demo astronaut (day 135).
    const item = findings(list)
      .find((li) => li.getAttribute('data-verdict') === 'likely-internal' && /Demo astronaut 3: Resting heart rate/.test(li.textContent ?? ''))!;
    expect(item).toBeDefined();
    await app.user.click(within(item).getByText(/Demo astronaut 3: Resting heart rate/));
    expect(within(item).getByText('1. Personal deviation')).toBeInTheDocument();
    expect(within(item).getByText('2. Crew comparison')).toBeInTheDocument();
    expect(within(item).getByText('3. Environmental link')).toBeInTheDocument();
    expect(within(item).getByText(/Individual: 0 of 2 other crewmates/)).toBeInTheDocument();
  });

  it('shows the documented link and its citation for an external verdict', async () => {
    const app = await openPage();
    const list = await screen.findByRole('list', { name: /^atypical readings$/i });
    const item = findings(list).find((li) => li.getAttribute('data-verdict') === 'likely-external')!;
    await app.user.click(within(item).getByText(/Resting heart rate/));
    expect(within(item).getByText(/Cabin temperature above its NASA limit of 27 °C/)).toBeInTheDocument();
    expect(within(item).getByRole('link', { name: /Pandolf/ })).toHaveAttribute('href', 'https://ntrs.nasa.gov/citations/19940029146');
  });

  it('filters the list by verdict with toggle buttons', async () => {
    const app = await openPage();
    const list = await screen.findByRole('list', { name: /^atypical readings$/i });
    const all = findings(list).length;
    const filter = screen.getByRole('button', { name: /^Likely internal \(this person\) \(\d+\)$/ });
    expect(filter).toHaveAttribute('aria-pressed', 'false');
    await app.user.click(filter);
    expect(filter).toHaveAttribute('aria-pressed', 'true');
    const items = findings(screen.getByRole('list', { name: /^atypical readings$/i }));
    expect(items.length).toBeLessThan(all);
    expect(items.every((li) => li.getAttribute('data-verdict') === 'likely-internal')).toBe(true);
  });

  it('also hosts the cabin CO2 comparison with the NASA reference', async () => {
    await openPage();
    expect(await screen.findByRole('region', { name: /^cabin co2$/i })).toBeInTheDocument();
  });

  it('shows an honest no-data state in LIVE and no simulated badge', async () => {
    await openPage('cmo', 'live');
    const panel = await screen.findByRole('region', { name: /^cabin variables$/i });
    expect(within(panel).getByText(/no simulated cabin values in LIVE mode/i)).toBeInTheDocument();
    expect(within(panel).getAllByText('No data').length).toBeGreaterThan(0);
    expect(within(panel).queryByText('SYNTHETIC')).toBeNull();
  });

  it('is not offered to a flight surgeon or an astronaut', async () => {
    for (const role of ['flightSurgeon', 'astronaut'] as const) {
      const app = await mountApp('demo', { role });
      await screen.findByRole('navigation', { name: /views/i });
      expect(screen.queryByRole('button', { name: /^cabin & crew$/i })).toBeNull();
      app.unmount();
    }
  });
});

describe('one source of truth for simulated cabin CO2', () => {
  it('shows the same value in the CO2 panel and the cabin variable card for the same mission time', async () => {
    await openPage();
    const card = (await screen.findByRole('region', { name: /^cabin variables$/i })).querySelector('[data-variable="co2"]') as HTMLElement;
    const panel = await screen.findByRole('region', { name: /^cabin co2$/i });
    const num = (text: string) => Number(text.replace(/[^\d]/g, ''));
    const cardValue = num(within(card).getByText(/^\d[\d,]* ppm$/).textContent!);
    const panelValue = num(within(panel).getByText(/^\d[\d,]* ppm$/).textContent!);
    expect(panelValue).toBe(cardValue);
  });
});
