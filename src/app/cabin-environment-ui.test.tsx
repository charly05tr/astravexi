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

describe('cabin CO2 panel (CMO crew dashboard)', () => {
  it('shows the simulated value, its status and the NASA reference below the crew list', async () => {
    await mountApp('demo', { role: 'cmo', cabinSource: { fetchReference: async () => reference } });
    const panel = await screen.findByRole('region', { name: /^cabin co2$/i });
    const crew = await screen.findByRole('list', { name: /^crew members$/i });
    expect(crew.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(within(panel).getByText('SYNTHETIC')).toBeInTheDocument();
    expect(within(panel).getByText(/mmHg\)/)).toBeInTheDocument();
    expect(within(panel).getByText(/2,986 ppm/)).toBeInTheDocument();
    expect(within(panel).getByText(/mission RR-19/)).toBeInTheDocument();
    expect(within(panel).getByText(/historical ISS mission values, not live/i)).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: /NASA OSDR Environmental Data Application/i })).toHaveAttribute(
      'href',
      'https://visualization.osdr.nasa.gov/eda/',
    );
  });

  it('shows an explicit error and no comparison when NASA is unreachable and nothing is cached', async () => {
    await mountApp('demo', { role: 'cmo' });
    const panel = await screen.findByRole('region', { name: /^cabin co2$/i });
    expect(within(panel).getByRole('alert')).toHaveTextContent(/NASA ISS reference is unavailable/i);
    expect(within(panel).queryByText(/reference threshold/i)).toBeNull();
  });

  it('shows no simulated values in LIVE', async () => {
    await mountApp('live', { role: 'cmo', cabinSource: { fetchReference: async () => reference } });
    const panel = await screen.findByRole('region', { name: /^cabin co2$/i });
    expect(within(panel).getByText(/no simulated cabin CO2 in LIVE mode/i)).toBeInTheDocument();
    expect(within(panel).queryByText('SYNTHETIC')).toBeNull();
  });

  it('is not shown to a flight surgeon', async () => {
    await mountApp('demo', { role: 'flightSurgeon' });
    await screen.findByRole('region', { name: /^crew$/i });
    expect(screen.queryByRole('region', { name: /^cabin co2$/i })).toBeNull();
  });
});
