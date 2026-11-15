// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AttributedReading } from '../core/attribution/analyze';
import type { CabinAnalysisView, CabinVariableView } from '../core/use-cases/cabin-analysis';
import { CabinKpiRow } from '../features/environment/CabinKpiRow';
import { NeedsAttention } from '../features/environment/NeedsAttention';
import { VariableChart } from '../features/environment/VariableChart';
import { cabinKnowledge } from '../knowledge';
import { mountApp } from '../test-support/mount';
import { UiProvider } from './ui-state';

/** The individual findings: group lines and evidence lists are list items too. */
const findings = (list: HTMLElement) => within(list).getAllByRole('listitem').filter((li) => li.hasAttribute('data-verdict'));

async function openPage(role: 'cmo' | 'flightSurgeon' | 'astronaut' = 'cmo', mode: 'demo' | 'live' = 'demo') {
  const app = await mountApp(mode, { role });
  await app.user.click(await screen.findByRole('button', { name: /^cabin & crew$/i }));
  return app;
}

const page = async () => within(await screen.findByRole('region', { name: /^cabin & crew analysis$/i }));
const attentionList = async () => (await page()).findByRole('list', { name: /^needs attention$/i });

describe('Cabin & crew analysis page', () => {
  it('is reachable from the CMO navigation and has a heading', async () => {
    await openPage();
    expect(await screen.findByRole('heading', { level: 2, name: /cabin & crew analysis/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^cabin & crew$/i })).toHaveAttribute('aria-current', 'page');
  });

  it('lays out the sections in order: indicators, needs attention, cabin air, data and method', async () => {
    await openPage();
    const p = await page();
    const heads = (await p.findAllByRole('heading', { level: 3 })).map((h) => h.textContent);
    expect(heads).toEqual(['Needs attention', 'Cabin air', 'Data & method']);
    expect(p.getByRole('region', { name: /^key indicators$/i })).toBeInTheDocument();
  });

  it('shows one page-level simulated-data notice and no badge on the cards', async () => {
    await openPage();
    const p = await page();
    await p.findByRole('region', { name: /^key indicators$/i });
    expect(p.getAllByText('SYNTHETIC')).toHaveLength(1);
    expect(p.getByText(/^Simulated data/)).toBeInTheDocument();
  });

  it('answers four questions in the key indicator tiles', async () => {
    await openPage();
    const row = within(await screen.findByRole('region', { name: /^key indicators$/i }));
    const now = within(row.getByRole('group', { name: /^cabin now$/i }));
    expect(now.getByText('Within NASA limits')).toBeInTheDocument();
    expect(now.getByText('Within limits')).toBeInTheDocument();
    const next = within(row.getByRole('group', { name: /^next 6 h$/i }));
    expect(next.getByText(/no limit crossing forecast|no forecast available|may (exceed|fall below)/i)).toBeInTheDocument();
    const crew = within(row.getByRole('group', { name: /^crew$/i }));
    for (const cause of ['Cabin', 'Possibly cabin', 'Personal', 'Unclear']) {
      expect(crew.getByRole('button', { name: new RegExp(`^${cause} \\d+$`) })).toHaveAttribute('aria-pressed', 'false');
    }
    expect(crew.getByText(/3 crew, last 30 days/)).toBeInTheDocument();
    const radiation = within(row.getByRole('group', { name: /^radiation$/i }));
    const meter = radiation.getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuemax', '600');
    expect(radiation.getByText(/mSv \/ 600 mSv/)).toBeInTheDocument();
    expect(radiation.getByText(/context, not an acute cause/i)).toBeInTheDocument();
    expect(radiation.getByText(/this mission only/i)).toBeInTheDocument();
  });

  it('lists crew items with a verdict and a plain-language sentence, newest first, one item per person and indicator', async () => {
    const app = await openPage();
    const list = await attentionList();
    const items = [...list.querySelectorAll(':scope > li')] as HTMLElement[];
    const crew = items.filter((li) => ['person', 'finding', 'group'].includes(li.getAttribute('data-kind')!));
    // 27 readings collapse into a handful of items.
    expect(crew.length).toBeLessThan(10);
    expect(within(list).getAllByText('Likely internal (this person)').length).toBeGreaterThan(0);
    const latest = (li: HTMLElement) => {
      const days = [...(li.textContent ?? '').matchAll(/Day (\d+), (\d\d):(\d\d)/g)].map((m) => Number(m[1]) * 1440 + Number(m[2]) * 60 + Number(m[3]));
      return Math.max(...days);
    };
    const times = crew.map(latest);
    expect(times).toEqual([...times].sort((a, b) => b - a));
    const person = list.querySelector('[data-kind="person"]') as HTMLElement;
    expect(within(person).getByText(/above their usual on \d+ readings, Day \d+–\d+ \(latest .* usual /)).toBeInTheDocument();
    expect(within(person).getAllByRole('button', { name: /^Why\?/ }).length).toBeGreaterThan(1);
    await app.user.click(within(person).getByText(/their usual on/));
    expect(person.querySelector('details')).toHaveAttribute('open');
    expect(within(list).getAllByText(/Atypical for this person, the rest of the crew did not move with them/).length).toBeGreaterThan(0);
  });

  it('counts items in the crew tile, with the readings as secondary text', async () => {
    await openPage();
    const list = await attentionList();
    const crew = within(screen.getByRole('group', { name: /^crew$/i }));
    const personal = Number(/(\d+)$/.exec(crew.getByRole('button', { name: /^Personal \d+$/ }).getAttribute('aria-label')!)![1]);
    const shown = [...list.querySelectorAll(':scope > li')].filter((li) => li.getAttribute('data-verdict') === 'likely-internal');
    expect(shown).toHaveLength(personal);
    expect(crew.getByText(/from \d+ atypical readings/)).toBeInTheDocument();
  });

  it('groups the readings of one cabin excursion into one expandable item', async () => {
    const app = await openPage();
    const list = await attentionList();
    const group = list.querySelector('[data-kind="group"]') as HTMLElement;
    expect(group).not.toBeNull();
    expect(within(group).getByText(/Cabin temperature above 27 °C on Day 133 \u2192 resting heart rate up in 3 of 3 crew/)).toBeInTheDocument();
    // The people are inside the group, not repeated as separate items of the list.
    expect(findings(within(group).getByRole('list')).length).toBe(3);
    const outside = findings(list).filter((li) => !group.contains(li) && li.getAttribute('data-verdict') === 'likely-external');
    expect(outside).toHaveLength(0);
    await app.user.click(within(group).getByText(/Cabin temperature above 27/));
    expect(group.querySelector('details')).toHaveAttribute('open');
  });

  it('opens the three signals and the citation from "Why?"', async () => {
    const app = await openPage();
    const list = await attentionList();
    const group = list.querySelector('[data-kind="group"]') as HTMLElement;
    await app.user.click(within(group).getByText(/Cabin temperature above 27/));
    await app.user.click(within(group).getAllByRole('button', { name: /^Why\?/ })[0]!);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('1. Personal deviation')).toBeInTheDocument();
    expect(within(dialog).getByText('2. Crew comparison')).toBeInTheDocument();
    expect(within(dialog).getByText('3. Environmental link')).toBeInTheDocument();
    expect(within(dialog).getByText(/Cabin temperature above its NASA limit of 27 °C/)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /Pandolf/ })).toHaveAttribute('href', 'https://ntrs.nasa.gov/citations/19940029146');
    expect(within(dialog).getByRole('button', { name: /^Open .+'s detail$/ })).toBeInTheDocument();
    await app.user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the individual signals of an isolated reading in the dialog', async () => {
    const app = await openPage();
    const list = await attentionList();
    const item = findings(list).find((li) => li.getAttribute('data-verdict') === 'likely-internal' && /Demo astronaut 3 \u00b7 Resting heart rate/.test(li.textContent ?? ''))!;
    expect(item).toBeDefined();
    await app.user.click(within(item).getByRole('button', { name: /^Why\?/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Individual: 0 of 2 other crewmates/)).toBeInTheDocument();
  });

  it('opens the astronaut detail from the name', async () => {
    const app = await openPage();
    const list = await attentionList();
    const item = findings(list).find((li) => /Demo astronaut 3 \u00b7/.test(li.textContent ?? ''))!;
    await app.user.click(within(item).getByRole('button', { name: 'Demo astronaut 3' }));
    expect(await screen.findByRole('button', { name: /^dashboard$/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('region', { name: /^cabin & crew analysis$/i })).toBeNull();
  });

  it('filters the list by cause with the crew tile buttons', async () => {
    const app = await openPage();
    const list = await attentionList();
    const all = findings(list).length;
    const filter = screen.getByRole('button', { name: /^Personal \d+$/ });
    await app.user.click(filter);
    expect(filter).toHaveAttribute('aria-pressed', 'true');
    const items = findings(await attentionList());
    expect(items.length).toBeLessThan(all);
    expect(items.every((li) => li.getAttribute('data-verdict') === 'likely-internal')).toBe(true);
    await app.user.click(filter);
    expect(filter).toHaveAttribute('aria-pressed', 'false');
    expect(findings(await attentionList()).length).toBe(all);
  });

  it('shows CO2 once: a single meter row, no separate CO2 panel', async () => {
    await openPage();
    const p = await page();
    const air = await p.findByRole('list', { name: /^cabin air variables$/i });
    expect(air.querySelectorAll('[data-variable="co2"]')).toHaveLength(1);
    expect(within(air).queryByText('Radiation dose (mission total)')).toBeNull();
    expect(screen.queryByRole('region', { name: /^cabin co2$/i })).toBeNull();
    expect(p.getAllByText(/^\d[\d,]* ppm$/)).toHaveLength(1);
  });

  it('shows an honest no-data state in LIVE and no simulated badge', async () => {
    await openPage('cmo', 'live');
    const p = await page();
    expect(await p.findByText(/no simulated cabin values in LIVE mode/i)).toBeInTheDocument();
    const now = within(p.getByRole('group', { name: /^cabin now$/i }));
    expect(now.getByText('No data')).toBeInTheDocument();
    expect(p.getByText('No forecast available')).toBeInTheDocument();
    const air = p.getByRole('list', { name: /^cabin air variables$/i });
    expect(within(air).getAllByText('No data').length).toBe(3);
    expect(p.queryByText('SYNTHETIC')).toBeNull();
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

describe('Cabin air meters and charts', () => {
  it('shows the NASA range, the forecast inline and the ISS reference on the CO2 row only', async () => {
    const app = await mountApp('demo', {
      role: 'cmo',
      cabinSource: {
        fetchReference: async () => ({
          mission: 'RR-19',
          from: '2019-12-03T10:24:00Z',
          to: '2020-01-07T20:10:00Z',
          count: 10192,
          meanPpm: 2562,
          medianPpm: 2516,
          maxPpm: 3581,
          thresholdPpm: 2986,
          sourceUrl: 'https://visualization.osdr.nasa.gov/eda/',
        }),
      },
    });
    await app.user.click(await screen.findByRole('button', { name: /^cabin & crew$/i }));
    const air = await screen.findByRole('list', { name: /^cabin air variables$/i });
    const temp = air.querySelector('[data-variable="cabinTemperature"]') as HTMLElement;
    expect(within(temp).getByText(/NASA limit 18 to 27 °C; comfort zone 20 to 25 °C/)).toBeInTheDocument();
    const co2 = air.querySelector('[data-variable="co2"]') as HTMLElement;
    expect(await within(co2).findByText(/ISS typical \(p95\): 2,986 ppm/)).toBeInTheDocument();
    expect(within(co2).getByText(/NASA limit is the decision threshold/)).toBeInTheDocument();
    expect(within(temp).queryByText(/ISS typical/)).toBeNull();
    // The row shows all its content: no fixed height, and no clipping class shared with another component.
    for (const row of [co2, temp]) {
      expect(row.className).toBe('air-row');
      expect(row.getAttribute('style')).toBeNull();
      expect(row.querySelector('[style*="height"]')).toBeNull();
      expect(within(row).getByText(/^NASA limit /)).toBeVisible();
      expect(within(row).getByRole('button', { name: /48 h chart/ })).toBeVisible();
    }
    expect(within(co2).getAllByText(/^In \d h:/)[0]).toBeVisible();
    expect(within(co2).getByText('Within limits')).toBeInTheDocument();
    expect(within(co2).queryByText('No findings')).toBeNull();
    expect(within(co2).getAllByText(/^In \d h:/).length).toBeGreaterThan(0);
  });

  it('expands a row to a chart with a table view', async () => {
    const app = await openPage();
    const air = await screen.findByRole('list', { name: /^cabin air variables$/i });
    const co2 = air.querySelector('[data-variable="co2"]') as HTMLElement;
    await app.user.click(within(co2).getByRole('button', { name: /48 h chart/ }));
    await app.user.click(within(co2).getByRole('button', { name: 'Table view' }));
    const table = within(co2).getByRole('table', { name: /hourly values over the last 48 hours/i });
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(48);
  });
});

function chartView(): CabinVariableView {
  const def = cabinKnowledge.variables.find((v) => v.id === 'cabinTemperature')!;
  const now = 135 * 1440;
  const trendT = Array.from({ length: 192 }, (_, i) => now - (191 - i) * 15);
  return { def, latest: 28, status: 'caution', trend: trendT.map((t) => (t > now - 120 ? 28 : 22)), trendT, forecast: [], forecastAlert: null };
}

describe('VariableChart', () => {
  it('shows a tooltip on keyboard focus with arrow keys, and flags a value outside the limit', () => {
    render(<VariableChart v={chartView()} />);
    const plot = screen.getByRole('group', { name: /cabin temperature over the last 48 hours/i });
    expect(plot).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(plot, { key: 'End' });
    fireEvent.keyDown(plot, { key: 'ArrowLeft' });
    expect(screen.getAllByText('28 °C').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/above its NASA limit of 27 °C/).length).toBeGreaterThan(0);
    fireEvent.keyDown(plot, { key: 'Home' });
    expect(screen.getAllByText('22 °C').length).toBeGreaterThan(0);
  });

  it('offers the same values as a table', async () => {
    render(<VariableChart v={chartView()} />);
    const toggle = screen.getByRole('button', { name: 'Table view' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Cabin temperature' })).toBeInTheDocument();
    expect(within(table).getAllByText('28 °C').length).toBeGreaterThan(0);
    expect(screen.queryByRole('group', { name: /last 48 hours/i })).toBeNull();
  });
});

function boardView(): CabinAnalysisView {
  const v = (id: 'co2' | 'cabinTemperature' | 'humidity' | 'radiationDose', latest: number, status: CabinVariableView['status'], extra: Partial<CabinVariableView> = {}): CabinVariableView => {
    const def = cabinKnowledge.variables.find((x) => x.id === id)!;
    const now = 135 * 1440 + 360;
    const trendT = Array.from({ length: 192 }, (_, i) => now - (191 - i) * 15);
    return { def, latest, status, trend: trendT.map(() => latest), trendT, forecast: [], forecastAlert: null, ...extra };
  };
  const reading = (id: string, t: number, verdict: AttributedReading['verdict']): AttributedReading =>
    ({
      id,
      profileId: id,
      name: `Person ${id}`,
      indicatorId: 'heartRate',
      indicatorLabel: 'Resting heart rate',
      unit: 'bpm',
      readingId: id,
      t,
      day: 1,
      value: 80,
      verdict,
      reason: 'no-external-signal',
      personal: { status: 'outlier', value: 80, z: 4, direction: 'above', median: 62, scale: 2, n: 9 },
      crew: { status: 'individual', othersWithData: 2, deviating: 0, needed: 1, peers: [] },
      environment: { status: 'no-linked-excursion', checked: ['cabinTemperature'] },
    }) as AttributedReading;
  return {
    simulated: true,
    variables: [
      v('co2', 3800, 'none', { forecastAlert: { variable: 'co2', horizonH: 3, side: 'above', limit: 3947 }, forecast: [{ variable: 'co2', horizonH: 3, value: 3850, low: 3600, high: 4100 }] }),
      v('cabinTemperature', 28.4, 'caution'),
      v('humidity', 45, 'none'),
      v('radiationDose', 74.7, 'information'),
    ],
    analysis: { findings: [reading('a', 200, 'likely-internal'), reading('b', 900, 'insufficient-data')], withoutBaseline: 2, membersAnalyzed: 3 },
    unavailable: ['Demo astronaut 9'],
    spanDays: 30,
    nowT: 135 * 1440 + 360,
    links: cabinKnowledge.links,
    modelCard: {} as CabinAnalysisView['modelCard'],
  };
}

describe('Key indicators and attention with a constructed view', () => {
  it('names the driving variable, the earliest forecast alert and the crew causes', () => {
    render(<CabinKpiRow view={boardView()} cause={null} onCause={() => undefined} />);
    const now = within(screen.getByRole('group', { name: /^cabin now$/i }));
    expect(now.getByText('Caution')).toBeInTheDocument();
    expect(now.getByText('Cabin temperature 28.4 °C')).toBeInTheDocument();
    const next = within(screen.getByRole('group', { name: /^next 6 h$/i }));
    expect(next.getByText('Information')).toBeInTheDocument();
    expect(next.getByText('CO2 may exceed the NASA limit within ~3 h')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Personal 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unclear 1' })).toBeInTheDocument();
  });

  it('orders the list: cabin outside its limit, forecast alert, then crew newest first, with footers', () => {
    render(
      <UiProvider>
        <NeedsAttention view={boardView()} cause={null} onCause={() => undefined} />
      </UiProvider>,
    );
    const list = screen.getByRole('list', { name: /^needs attention$/i });
    const kinds = [...list.querySelectorAll(':scope > li')].map((li) => li.getAttribute('data-kind'));
    expect(kinds).toEqual(['cabin', 'forecast', 'finding', 'finding']);
    const [cabin, forecast, first, second] = [...list.querySelectorAll(':scope > li')] as HTMLElement[];
    expect(within(cabin!).getByText(/Cabin temperature 28.4 °C, above its NASA limit of 27 °C/)).toBeInTheDocument();
    expect(within(cabin!).getByText(/for at least 48 h, since before Day 134/)).toBeInTheDocument();
    expect(within(cabin!).getByText(/Review cabin thermal control/)).toBeInTheDocument();
    expect(within(forecast!).getByText(/CO2 may exceed the NASA limit of 3,947 ppm within ~3 h/)).toBeInTheDocument();
    expect(first!.textContent).toContain('Person b');
    expect(second!.textContent).toContain('Person a');
    expect(screen.getByText(/2 readings could not be judged yet/)).toBeInTheDocument();
    expect(screen.getByText(/Records could not be read for: Demo astronaut 9/)).toBeInTheDocument();
  });

  it('says so when nothing needs attention', () => {
    const calm = boardView();
    calm.variables = calm.variables.map((x) => ({ ...x, status: x.def.contextOnly ? 'information' : 'none', forecastAlert: null }));
    calm.analysis = { ...calm.analysis, findings: [] };
    render(
      <UiProvider>
        <NeedsAttention view={calm} cause={null} onCause={() => undefined} />
      </UiProvider>,
    );
    expect(screen.getByText('Nothing needs attention.')).toBeInTheDocument();
  });
});
