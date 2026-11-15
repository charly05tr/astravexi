// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { cabinForecastModel } from '../knowledge';
import { mountApp } from '../test-support/mount';

async function openPage(mode: 'demo' | 'live') {
  const app = await mountApp(mode, { role: 'cmo' });
  await app.user.click(await screen.findByRole('button', { name: /^cabin & crew$/i }));
  return app;
}

const enabledHours = (variable: 'co2' | 'cabinTemperature' | 'humidity') =>
  cabinForecastModel.variables[variable].horizons.filter((h) => h.enabled).map((h) => h.horizonH);

describe('cabin forecast on the Cabin & crew page', () => {
  it('shows each enabled horizon with an interval inline on the cabin air rows, and never a disabled one', async () => {
    await openPage('demo');
    const air = await screen.findByRole('list', { name: /^cabin air variables$/i });
    for (const id of ['co2', 'cabinTemperature', 'humidity'] as const) {
      const row = air.querySelector(`[data-variable="${id}"]`) as HTMLElement;
      const hours = enabledHours(id);
      const items = row.querySelectorAll('.forecast__list li');
      expect([...items].map((li) => Number(li.getAttribute('data-horizon')))).toEqual(hours);
      if (hours.length > 0) expect(within(row).getByRole('list', { name: /80% prediction interval/i })).toBeInTheDocument();
      for (const h of [1, 3, 6].filter((x) => !hours.includes(x as 1 | 3 | 6))) expect(within(row).queryByText(new RegExp(`^In ${h} h:`))).toBeNull();
    }
    // Radiation is a key-indicator tile, never a row, and has no forecast.
    expect(air.querySelector('[data-variable="radiationDose"]')).toBeNull();
  });

  it('shows the model card inside Data & method with the training data, the test method and MAE against both baselines', async () => {
    const app = await openPage('demo');
    expect(screen.queryByRole('group', { name: /^forecast model card$/i })).toBeNull();
    await app.user.click(await screen.findByRole('button', { name: /^data & method$/i }));
    const card = within(await screen.findByRole('group', { name: /^forecast model card$/i }));
    expect(card.getByText(/real ISS missions/i)).toBeInTheDocument();
    expect(card.getByText(/leave-mission-out/i)).toBeInTheDocument();
    expect(card.getByText(/calibrated on the same telemetry/i)).toBeInTheDocument();
    const table = card.getByRole('table', { name: /forecast error against baselines/i });
    expect(within(table).getByRole('columnheader', { name: /persistence mae/i })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: /seasonal naive mae/i })).toBeInTheDocument();
    // One row per variable and horizon.
    expect(table.querySelectorAll('tbody tr')).toHaveLength(9);
    const disabled = [...table.querySelectorAll('tbody tr')].filter((tr) => tr.getAttribute('data-enabled') === 'false');
    for (const tr of disabled) expect(within(tr as HTMLElement).getByText(/^Disabled: Test MAE does not beat/)).toBeInTheDocument();
    if (disabled.length > 0) expect(card.getByText(/never shown in Cabin air/i)).toBeInTheDocument();
  });

  it('lists every NASA limit and physiological link source once in Data & method', async () => {
    const app = await openPage('demo');
    await app.user.click(await screen.findByRole('button', { name: /^data & method$/i }));
    const sources = within(await screen.findByRole('group', { name: /^sources$/i }));
    const hrefs = sources.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs.some((h) => h?.includes('ochmo-tb-002'))).toBe(true);
    expect(hrefs).toContain('https://ntrs.nasa.gov/citations/19940029146');
    // The decision area carries no source links of its own.
    const attention = await screen.findByRole('list', { name: /^needs attention$/i });
    expect(within(attention).queryAllByRole('link')).toHaveLength(0);
  });

  it('shows an honest no-forecast state in LIVE and no forecast values', async () => {
    await openPage('live');
    const air = await screen.findByRole('list', { name: /^cabin air variables$/i });
    expect(air.querySelector('.forecast__list')).toBeNull();
    expect(within(air).getAllByText(/no forecast: a forecast needs recent cabin data/i).length).toBeGreaterThan(0);
    expect(within(air).queryByText(/^In \d h:/)).toBeNull();
  });
});
