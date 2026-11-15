// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mountApp } from '../test-support/mount';

const reference = {
  mission: 'RR-19',
  from: '2019-12-03T10:24:00Z',
  to: '2020-01-07T20:10:00Z',
  count: 10192,
  meanPpm: 2562,
  medianPpm: 2516,
  maxPpm: 3581,
  thresholdPpm: 2986,
  sourceUrl: 'https://visualization.osdr.nasa.gov/eda/',
};

/** Opens the "Cabin & crew" page, then the collapsed "Data & method" section where the ISS reference lives. */
async function openDataAndMethod(app: Awaited<ReturnType<typeof mountApp>>) {
  await app.user.click(await screen.findByRole('button', { name: /^cabin & crew$/i }));
  await app.user.click(await screen.findByRole('button', { name: /^data & method$/i }));
  return within(await screen.findByRole('group', { name: /^ISS CO2 reference$/i }));
}

describe('ISS CO2 reference (CMO cabin & crew page)', () => {
  it('is not on the CMO dashboard', async () => {
    await mountApp('demo', { role: 'cmo', cabinSource: { fetchReference: async () => reference } });
    await screen.findByRole('list', { name: /^crew members$/i });
    expect(screen.queryByRole('group', { name: /^ISS CO2 reference$/i })).toBeNull();
    expect(screen.queryByRole('region', { name: /^cabin co2$/i })).toBeNull();
  });

  it('is collapsed until Data & method is opened', async () => {
    const app = await mountApp('demo', { role: 'cmo', cabinSource: { fetchReference: async () => reference } });
    await app.user.click(await screen.findByRole('button', { name: /^cabin & crew$/i }));
    const toggle = await screen.findByRole('button', { name: /^data & method$/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('group', { name: /^ISS CO2 reference$/i })).toBeNull();
    await app.user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByRole('group', { name: /^ISS CO2 reference$/i })).toBeInTheDocument();
  });

  it('shows the mission, the p95 level, its freshness and the OSDR link', async () => {
    const app = await mountApp('demo', { role: 'cmo', cabinSource: { fetchReference: async () => reference } });
    const block = await openDataAndMethod(app);
    expect(await block.findByText(/2,986 ppm/)).toBeInTheDocument();
    expect(block.getByText(/mission RR-19/)).toBeInTheDocument();
    expect(block.getByText(/Updated 20\d\d-\d\d-\d\d \d\d:\d\d UTC/)).toBeInTheDocument();
    expect(block.getByText(/historical ISS mission values, not live/i)).toBeInTheDocument();
    expect(block.getByRole('link', { name: /NASA OSDR Environmental Data Application/i })).toHaveAttribute('href', 'https://visualization.osdr.nasa.gov/eda/');
  });

  it('shows an explicit error and no comparison when NASA is unreachable and nothing is cached', async () => {
    const app = await mountApp('demo', { role: 'cmo' });
    const block = await openDataAndMethod(app);
    expect(await block.findByRole('alert')).toHaveTextContent(/NASA ISS reference is unavailable/i);
    expect(block.queryByText(/95th percentile/i)).toBeNull();
    // The CO2 row then has no ISS tick.
    expect(screen.queryByText(/ISS typical \(p95\)/)).toBeNull();
  });

  it('shows no simulated values in LIVE', async () => {
    const app = await mountApp('live', { role: 'cmo', cabinSource: { fetchReference: async () => reference } });
    await app.user.click(await screen.findByRole('button', { name: /^cabin & crew$/i }));
    const page = within(await screen.findByRole('region', { name: /^cabin & crew analysis$/i }));
    expect(await page.findByText(/no simulated cabin values in LIVE mode/i)).toBeInTheDocument();
    expect(page.queryByText('SYNTHETIC')).toBeNull();
  });

  it('is not shown to a flight surgeon', async () => {
    await mountApp('demo', { role: 'flightSurgeon' });
    await screen.findByRole('region', { name: /^crew$/i });
    expect(screen.queryByRole('button', { name: /^cabin & crew$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^data & method$/i })).toBeNull();
  });
});
