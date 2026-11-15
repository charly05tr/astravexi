// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { knowledge } from '../knowledge';
import { mountApp } from '../test-support/mount';

type Mounted = Awaited<ReturnType<typeof mountApp>>;

const rail = () => screen.getByRole('list', { name: /^body zones$/i });
const railRow = (zone: string) => rail().querySelector<HTMLElement>(`[data-zone-id="${zone}"]`)!;
const outboxCards = () => screen.queryAllByTestId('outbox-message');

const dailyForm = () => screen.queryByRole('form', { name: /daily check-in/i });

/** Opens the daily check-in dialog from the header, unless it is already open. */
async function openCheckIn(m: Mounted) {
  if (!dailyForm()) await m.user.click(screen.getByRole('button', { name: /^check-in$/i }));
  return within(dailyForm()!);
}
/** Signs the same app in as a Crew Medical Officer (the UI follows the store's actor). */
async function asCmo(m: Mounted) {
  await act(async () => m.actAs('cmo'));
}
/** Switches the main view from the header navigation. */
async function goTo(m: Mounted, view: 'Dashboard' | 'Comms' | 'Sources') {
  await m.user.click(within(screen.getByRole('navigation', { name: 'Views' })).getByRole('button', { name: new RegExp(`^${view}`) }));
}

/** Types into a daily check-in field. Scoped to the form: charts also carry aria-labels with the same words. */
async function fill(m: Mounted, label: RegExp, value: string) {
  // Outside the shell (mission setup) there is no check-in dialog: type into the page.
  const form = screen.queryByRole('button', { name: /^check-in$/i }) ? await openCheckIn(m) : screen;
  await m.user.clear(form.getByLabelText(label));
  await m.user.type(form.getByLabelText(label), value);
}
async function save(m: Mounted) {
  const form = await openCheckIn(m);
  await m.user.click(form.getByRole('button', { name: /save check-in/i }));
}
/** Opens the zone panel's full detail (the panel starts on its summary). */
async function openDetails(m: Mounted) {
  const more = screen.queryByRole('button', { name: /view details/i });
  if (more) await m.user.click(more);
}
async function phq(m: Mounted, name: RegExp) {
  const form = await openCheckIn(m);
  await m.user.click(form.getByRole('radio', { name }));
}
async function enterBp(m: Mounted, sys: string, dia: string) {
  await fill(m, /^systolic blood pressure/i, sys);
  await fill(m, /^diastolic blood pressure/i, dia);
  await save(m);
}

describe('app shell: disclaimer and mode badge on both views, both modes', () => {
  for (const mode of ['demo', 'live'] as const) {
    it(`shows the header badge in ${mode.toUpperCase()} on both views, and the disclaimer footer off the dashboard`, async () => {
      const m = await mountApp(mode);
      const header = () => screen.getByRole('banner');
      const check = () => {
        expect(within(header()).getByText(mode === 'demo' ? 'DEMO' : 'LIVE')).toBeInTheDocument();
        const synthetic = within(header()).queryByText('SYNTHETIC');
        if (mode === 'demo') expect(synthetic).toBeInTheDocument();
        else expect(synthetic).toBeNull();
      };
      check();
      expect(screen.getByRole('button', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
      // The dashboard has no footer: the body model uses the full height.
      expect(screen.queryByRole('contentinfo')).toBeNull();
      await goTo(m, 'Sources');
      expect(screen.getByRole('heading', { name: /sources and disclosures/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sources' })).toHaveAttribute('aria-current', 'page');
      check();
      expect(within(screen.getByRole('contentinfo')).getByText(/decision support, not medical advice/i)).toBeInTheDocument();
    });
  }

  it('shows the demo actions only in DEMO, inside the account menu', async () => {
    const demo = await mountApp('demo');
    expect(demo.state().mission.today).toBe(150);
    await demo.user.click(screen.getByRole('button', { name: /^profile menu/i }));
    const menu = within(screen.getByRole('menu'));
    expect(menu.getByRole('menuitem', { name: 'Advance one day' })).toBeInTheDocument();
    expect(menu.getByRole('menuitem', { name: 'Reset demo' })).toBeInTheDocument();
    demo.unmount();
    const live = await mountApp('live');
    expect(live.state().mission.today).toBe(1);
    await live.user.click(screen.getByRole('button', { name: /^profile menu/i }));
    expect(screen.queryByRole('menuitem', { name: 'Advance one day' })).toBeNull();
  });

  it('asks for confirmation before Reset demo and keeps data when cancelled', async () => {
    const m = await mountApp('demo');
    const reset = async () => {
      await m.user.click(screen.getByRole('button', { name: /^profile menu/i }));
      await m.user.click(screen.getByRole('menuitem', { name: 'Reset demo' }));
    };
    await reset();
    expect(screen.getByText(/reset the demo\?/i)).toBeInTheDocument();
    await m.user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(/reset the demo\?/i)).toBeNull();
    expect(m.state().generation).toBe(0);
    await reset();
    await m.user.click(screen.getByRole('button', { name: 'Yes, reset' }));
    await waitFor(() => expect(m.state().generation).toBe(1));
  });

  it('advances one day from the header', async () => {
    const m = await mountApp('demo');
    await m.user.click(screen.getByRole('button', { name: /^profile menu/i }));
    await m.user.click(screen.getByRole('menuitem', { name: 'Advance one day' }));
    await waitFor(() => expect(m.state().mission.today).toBe(151));
  });

  it('shows a persistent banner when storage is unavailable', async () => {
    const { createTestWorld } = await import('../test-support/compose');
    const { composeAdapters } = await import('./composition-root');
    const { createMemoryRecordStore } = await import('../adapters/memory-record-store');
    const { createAppStore } = await import('./store/app-store');
    const { render } = await import('@testing-library/react');
    const { BrandProvider } = await import('../brand/brand-context');
    const { brand } = await import('../brand/brand.config');
    const { AppRoot } = await import('./AppRoot');
    const world = createTestWorld();
    const { testProfile } = await import('../test-support/compose');
    const adapters = await composeAdapters('demo', testProfile(), {
      nowMs: () => world.time.ms,
      open: async (name) => ({ store: createMemoryRecordStore(name), storageAvailable: false }),
    });
    const store = createAppStore(adapters);
    await store.getState().hydrate();
    render(
      <BrandProvider value={brand}>
        <AppRoot store={store} autoStart={false} />
      </BrandProvider>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/entries will not be kept/i);
  });
});

describe('LIVE first run', () => {
  it('shows the mission setup before the shell and reaches Day 1 after the defaults', async () => {
    const m = await mountApp('live', { configureLive: false });
    expect(screen.getByRole('heading', { name: /set up your mission/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/transit length/i)).toHaveValue('210');
    expect(screen.getByLabelText(/destination/i)).toHaveValue('Mars');
    await m.user.click(screen.getByRole('button', { name: /start mission/i }));
    await waitFor(() => expect(m.state().hasMissionConfig).toBe(true));
    expect(m.state().mission.today).toBe(1);
  });

  it('rejects a bad transit length inline', async () => {
    const m = await mountApp('live', { configureLive: false });
    await fill(m, /transit length/i, '0');
    await m.user.click(screen.getByRole('button', { name: /start mission/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/whole number of days/i);
    expect(m.state().hasMissionConfig).toBe(false);
  });

  it('starts empty: zones read No data, the panel invites the first check-in, nothing is synthetic', async () => {
    const m = await mountApp('live');
    expect(rail()).toHaveTextContent(/no recent reading/i);
    expect(screen.getByText(/add your first check-in/i)).toBeInTheDocument();
    expect(screen.queryByText('SYNTHETIC')).toBeNull();
    await goTo(m, 'Comms');
    expect(screen.getByText(/no messages/i)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /crew medical officer/i })).toBeNull(); // astronauts do not see it
    await asCmo(m);
    expect(screen.getByText(/nothing needs review/i)).toBeInTheDocument();
  });
});

describe('alert rail and zone selection', () => {
  it('lists the six zones in fixed head-to-toe order, whatever their tier', async () => {
    await mountApp('demo');
    const ids = [...rail().querySelectorAll<HTMLElement>('[data-zone-id]')].map((el) => el.dataset.zoneId);
    expect(ids).toEqual(['brain', 'eyes', 'heart', 'immune', 'metabolism', 'bone']);
    expect(railRow('brain')).toHaveTextContent(/caution/i);
    expect(railRow('eyes')).toHaveTextContent(/not monitored/i);
  });

  it('selects a card on tap and turns the wheel to bring it to the centre', async () => {
    const m = await mountApp('demo');
    const transformOf = () => rail().querySelector<HTMLElement>('.rail__slot:has([data-zone-id="bone"])')!.style.transform;
    const before = transformOf();
    expect(before).toContain('translate'); // the wheel did lay the cards out
    await m.user.click(railRow('bone'));
    expect(railRow('bone')).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(transformOf()).not.toBe(before));
  });

  it('turns the wheel with the arrow keys when nothing on the page has focus', async () => {
    await mountApp('demo');
    const transformOf = () => rail().querySelector<HTMLElement>('.rail__slot:has([data-zone-id="brain"])')!.style.transform;
    (document.activeElement as HTMLElement | null)?.blur();
    const before = transformOf();
    fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    await waitFor(() => expect(transformOf()).not.toBe(before));
  });

  it('leaves the arrow keys alone while a control has focus', async () => {
    await mountApp('demo');
    const transformOf = () => rail().querySelector<HTMLElement>('.rail__slot:has([data-zone-id="brain"])')!.style.transform;
    const nav = screen.getByRole('button', { name: 'Comms' });
    nav.focus();
    const before = transformOf();
    fireEvent.keyDown(nav, { key: 'ArrowDown' });
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(transformOf()).toBe(before);
  });

  it('opens a zone panel when a rail row is selected, and marks the selection', async () => {
    const m = await mountApp('demo');
    await m.user.click(railRow('heart'));
    expect(screen.getByRole('heading', { level: 2, name: 'Heart' })).toBeInTheDocument();
    expect(railRow('heart')).toHaveAttribute('aria-pressed', 'true');
    expect(railRow('brain')).toHaveAttribute('aria-pressed', 'false');
  });

  it('selects a zone from the body model with the keyboard', async () => {
    const m = await mountApp('demo');
    const eyes = screen.getByRole('button', { name: 'Eyes, Not monitored' });
    eyes.focus();
    await m.user.keyboard('{Enter}');
    expect(screen.getByRole('heading', { level: 2, name: 'Eyes' })).toBeInTheDocument();
    expect(eyes).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows function text only for a zone that is not monitored', async () => {
    const m = await mountApp('demo');
    await m.user.click(railRow('bone'));
    const panel = screen.getByRole('heading', { level: 2, name: 'Bone' }).closest('section')!;
    expect(within(panel).getByText(/skeleton and muscle/i)).toBeInTheDocument();
    expect(within(panel).getByText(/not monitored in this prototype/i)).toBeInTheDocument();
    expect(within(panel).queryByText(/what changed/i)).toBeNull();
    expect(within(panel).queryByText('Indicators')).toBeNull();
  });
});

describe('zone panel content', () => {
  it('shows what changed, why it matters, what to do, rule id, citation and the verify mark for brain', async () => {
    const m = await mountApp('demo');
    await openDetails(m);
    const panel = screen.getByRole('dialog', { name: /brain details/i });
    expect(within(panel).getAllByText('What changed').length).toBeGreaterThan(0);
    expect(within(panel).getAllByText('Why it matters').length).toBeGreaterThan(0);
    expect(within(panel).getAllByText('What to do').length).toBeGreaterThan(0);
    expect(within(panel).getAllByText(/^Rule (sleep-mean-low|mood-mean-above-baseline)/).length).toBeGreaterThan(0);
    expect(within(panel).getAllByText('Needs verification').length).toBeGreaterThan(0);
    expect(within(panel).getByTestId('corroboration')).toBeInTheDocument();
    expect(within(panel).getAllByText('SYNTHETIC').length).toBeGreaterThan(0);
  });

  it('never leaves an unfilled template token on screen', async () => {
    await mountApp('demo');
    expect(document.body.textContent).not.toMatch(/\{\w+\}/);
  });

  it('shows per-indicator status, with the baseline-building wording in LIVE', async () => {
    const m = await mountApp('live');
    await m.user.click(railRow('heart'));
    await fill(m, /^resting heart rate/i, '62');
    await save(m);
    await waitFor(() => expect(screen.getAllByText(/baseline building, 0 of 7 in the baseline window/i).length).toBeGreaterThan(0));
    await openDetails(m);
    expect(screen.getAllByText(/no readings yet/i).length).toBeGreaterThan(0); // blood pressure has none
  });

  it('logs a Dismiss, removes the suggestion and leaves the tier alone', async () => {
    const m = await mountApp('demo');
    await openDetails(m);
    const before = (await screen.findAllByRole('button', { name: 'Dismiss' })).length;
    expect(before).toBeGreaterThan(0);
    const status = m.state().session!.evaluation.zones.brain.status;
    await m.user.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]!);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Dismiss' })).toHaveLength(before - 1));
    expect(m.state().session!.decisions.at(-1)?.decision).toBe('dismissed');
    expect(m.state().session!.evaluation.zones.brain.status).toBe(status);
  });

  it('logs an Accept and shows it as accepted', async () => {
    const m = await mountApp('demo');
    await openDetails(m);
    await m.user.click((await screen.findAllByRole('button', { name: 'Accept' }))[0]!);
    await waitFor(() => expect(screen.getAllByText('Accepted').length).toBeGreaterThan(0));
    expect(m.state().session!.decisions.at(-1)?.decision).toBe('accepted');
  });
});

describe('daily check-in form', () => {
  it('has exactly two PHQ-2 questions and no item 9 or self-harm item', async () => {
    const m = await mountApp('demo');
    await openCheckIn(m);
    const form = dailyForm()!;
    expect(within(form).getAllByText(/little interest or pleasure|feeling down, depressed or hopeless/i)).toHaveLength(2);
    expect(form.textContent).not.toMatch(/self-harm|better off dead|hurt yourself|item 9/i);
  });

  it('shows hints, units and the rest, symptom and glucose controls', async () => {
    const m = await mountApp('demo');
    await openCheckIn(m);
    expect(screen.getByText(/count the pulse for 60 s/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fasting glucose/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /at rest/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /after exercise/i })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: /symptoms now/i })).not.toBeChecked();
    expect(screen.getByText(/chills, palpitations, dizziness, chest discomfort/i)).toBeInTheDocument();
  });

  it('rejects an out-of-range value inline and stores nothing', async () => {
    const m = await mountApp('demo');
    const before = m.state().session!.manual.length;
    await fill(m, /^temperature/i, '50');
    await save(m);
    expect(await screen.findByText(/enter a value between 30 and 45 C/i)).toBeInTheDocument();
    expect(within(dailyForm()!).getByLabelText(/^temperature/i)).toHaveAttribute('aria-invalid', 'true');
    expect(m.state().session!.manual).toHaveLength(before);
  });

  it('rejects half a blood pressure pair and half a PHQ-2', async () => {
    const m = await mountApp('demo');
    await fill(m, /^systolic blood pressure/i, '120');
    await phq(m, /little interest.*: 2,/i);
    await save(m);
    expect(screen.getByText(/enter both blood pressure values/i)).toBeInTheDocument();
    expect(screen.getByText(/answer both questions/i)).toBeInTheDocument();
    expect(m.state().session!.manual).toHaveLength(0);
  });

  it('asks for at least one value on an empty submit', async () => {
    const m = await mountApp('demo');
    await save(m);
    expect(await screen.findByText(/enter at least one value/i)).toBeInTheDocument();
  });

  it('hides the glucose field when the glucose flag is off', async () => {
    const { loadKnowledge } = await import('../knowledge');
    const { createTestWorld } = await import('../test-support/compose');
    const { render } = await import('@testing-library/react');
    const { BrandProvider } = await import('../brand/brand-context');
    const { brand } = await import('../brand/brand.config');
    const { AppRoot } = await import('./AppRoot');
    const world = createTestWorld();
    const { store } = await world.app('demo');
    render(
      <BrandProvider value={brand}>
        <AppRoot store={store} knowledge={loadKnowledge({ glucose: false })} autoStart={false} />
      </BrandProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /^check-in$/i }));
    expect(screen.queryByLabelText(/fasting glucose/i)).toBeNull();
    expect(screen.getByLabelText(/^temperature/i)).toBeInTheDocument();
  });
});

describe('golden flows through the UI', () => {
  it('BP 185/125 shows a Warning on the heart zone and exactly one outbox message', async () => {
    const m = await mountApp('demo');
    await enterBp(m, '185', '125');
    await waitFor(() => expect(railRow('heart')).toHaveTextContent(/warning/i));
    // The menu keeps its order; the panel follows the most urgent zone instead.
    expect(rail().querySelector('[data-zone-id]')).toBe(railRow('brain'));
    expect(screen.getByRole('heading', { level: 2, name: 'Heart' })).toBeInTheDocument();
    // The form reset and confirmed the save as MANUAL.
    expect(screen.getByText(/saved as manual/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^comms/i })).toHaveTextContent('1');
    await goTo(m, 'Comms');
    expect(outboxCards()).toHaveLength(1);
    expect(outboxCards()[0]).toHaveTextContent(/queued/i);
    expect(outboxCards()[0]).toHaveTextContent(/earliest reply T\+24 min after sending/i);
  });

  it('38.1 C stays Information with the in-flight shift explanation', async () => {
    const m = await mountApp('demo');
    await fill(m, /^temperature/i, '38.1');
    await save(m);
    await waitFor(() => expect(railRow('immune')).toHaveTextContent(/information/i));
    expect(railRow('immune')).not.toHaveTextContent(/caution|warning|notice/i);
    await m.user.click(railRow('immune'));
    await openDetails(m);
    expect(screen.getByText(/rises by about 1 C/i)).toBeInTheDocument();
    await goTo(m, 'Comms');
    expect(outboxCards()).toHaveLength(0);
  });

  it('latches the Warning after a normal re-measure until the CMO acknowledges it', async () => {
    const m = await mountApp('demo');
    await enterBp(m, '185', '125');
    await waitFor(() => expect(railRow('heart')).toHaveTextContent(/warning/i));
    m.world.wait(120);
    await enterBp(m, '130', '80');
    await openDetails(m);
    await waitFor(() => expect(screen.getAllByText(/latest re-measure/i).length).toBeGreaterThan(0));
    expect(railRow('heart')).toHaveTextContent(/warning/i);
    await asCmo(m);
    await goTo(m, 'Comms');
    const cmo = screen.getByRole('region', { name: /crew medical officer/i });
    const acks = within(cmo).getAllByRole('button', { name: /acknowledge heart warning/i });
    expect(acks.length).toBe(1); // one per (zone, group)
    await m.user.click(acks[0]!);
    await waitFor(() => expect(within(cmo).queryByRole('button', { name: /acknowledge/i })).toBeNull());
    expect(outboxCards()).toHaveLength(1); // the message remains
    await goTo(m, 'Dashboard');
    expect(railRow('heart')).not.toHaveTextContent(/warning/i);
  });
});

describe('Crew Medical Officer panel', () => {
  it('shows the corroborated brain zone as tiers, never as scores', async () => {
    const m = await mountApp('demo', { role: 'cmo' });
    await goTo(m, 'Comms');
    const cmo = screen.getByRole('region', { name: /crew medical officer/i });
    expect(within(cmo).getByText('Brain')).toBeInTheDocument();
    expect(within(cmo).getByText(/mood: notice/i)).toBeInTheDocument();
    expect(cmo.textContent).not.toMatch(/\d\s*points|phq/i);
  });

  it('keeps a mood score out of every CMO and outbox text even when mood is high', async () => {
    const m = await mountApp('demo');
    await phq(m, /little interest.*: 3,/i);
    await phq(m, /feeling down.*: 3,/i);
    await enterBp(m, '185', '125');
    await asCmo(m);
    await goTo(m, 'Comms');
    await waitFor(() => expect(outboxCards()).toHaveLength(1));
    const cmo = screen.getByRole('region', { name: /crew medical officer/i });
    expect(cmo.textContent).not.toMatch(/\b6\b|points|phq/i);
  });
});

describe('outbox', () => {
  async function withWarning() {
    const m = await mountApp('demo');
    await enterBp(m, '185', '125');
    await goTo(m, 'Comms');
    await waitFor(() => expect(outboxCards()).toHaveLength(1));
    return m;
  }

  it('payload preview shows tiers only: no PHQ values, mood is at most a tier', async () => {
    const m = await mountApp('demo');
    await phq(m, /little interest.*: 3,/i);
    await phq(m, /feeling down.*: 3,/i);
    await enterBp(m, '185', '125');
    await goTo(m, 'Comms');
    await waitFor(() => expect(outboxCards()).toHaveLength(1));
    const preview = within(outboxCards()[0]!).getByLabelText('Message payload');
    expect(within(outboxCards()[0]!).getByText('What would be sent')).toBeInTheDocument();
    const payload = JSON.parse(preview.textContent!);
    expect(payload.zoneTiers.brain).toBe('caution'); // a tier
    expect(payload.trigger.every((t: { indicatorId: string }) => t.indicatorId !== 'phq2')).toBe(true);
    expect(preview.textContent).not.toMatch(/phq|points/i);
    expect(JSON.stringify(payload)).not.toMatch(/"(phq2|mood)"/i);
    expect(payload.source).toBe('MANUAL');
  });

  it('labels the link as simulated, with the demo scale', async () => {
    const m = await mountApp('demo');
    await goTo(m, 'Comms');
    expect(screen.getByText(/simulated link\. 1 s = 1 min/i)).toBeInTheDocument();
  });

  it('reads the earliest reply from the delay slider while queued, then freezes it at send', async () => {
    const m = await withWarning();
    const slider = screen.getByLabelText(/one-way delay/i);
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '22');
    fireEvent.change(slider, { target: { value: '20' } });
    await waitFor(() => expect(outboxCards()[0]).toHaveTextContent(/earliest reply T\+40 min after sending/i));
    await m.user.click(screen.getByRole('button', { name: /send now/i }));
    await waitFor(() => expect(outboxCards()[0]).toHaveAttribute('data-state', 'sent'));
    expect(outboxCards()[0]).toHaveTextContent(/earliest reply T\+40 min/i);
    fireEvent.change(slider, { target: { value: '5' } });
    await waitFor(() => expect(slider).toHaveValue('5'));
    expect(outboxCards()[0]).toHaveTextContent(/earliest reply T\+40 min/i); // frozen at send
    expect(within(outboxCards()[0]!).getByText('What was sent')).toBeInTheDocument();
  });

  it('holds a queued message during a blackout and shows no reply time', async () => {
    const m = await withWarning();
    await m.user.click(screen.getByRole('switch', { name: /link blackout/i }));
    await waitFor(() => expect(outboxCards()[0]).toHaveAttribute('data-state', 'held'));
    expect(outboxCards()[0]).toHaveTextContent(/no reply time until the link returns/i);
    expect(within(outboxCards()[0]!).queryByRole('button', { name: /send now/i })).toBeNull();
    await m.user.click(screen.getByRole('switch', { name: /link blackout/i }));
    await waitFor(() => expect(outboxCards()[0]).toHaveAttribute('data-state', 'sent'));
  });

  it('shows Reply possible once the earliest reply time has passed', async () => {
    const m = await withWarning();
    fireEvent.change(screen.getByLabelText(/one-way delay/i), { target: { value: '1' } });
    await m.user.click(screen.getByRole('button', { name: /send now/i }));
    await waitFor(() => expect(outboxCards()[0]).toHaveAttribute('data-state', 'sent'));
    m.world.wait(150);
    await m.state().tick();
    await waitFor(() => expect(outboxCards()[0]).toHaveAttribute('data-state', 'replyPossible'));
    expect(outboxCards()[0]).toHaveTextContent(/reply possible/i);
  });
});

describe('sources view', () => {
  it('lists every rule with its citation and verification flag, and the disclosures', async () => {
    const m = await mountApp('demo');
    await goTo(m, 'Sources');
    const rows = document.querySelectorAll('tr[data-rule-id]');
    expect(rows).toHaveLength(knowledge.rules.length);
    const flagged = knowledge.rules.filter((r) => r.needsVerification).length;
    expect(within(document.querySelector('#rules')!.parentElement!).getAllByText('Needs verification')).toHaveLength(flagged);
    expect(screen.getByText(/the demo generates the drift it then detects/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /licenses and credits/i })).toBeInTheDocument();
    expect(screen.getAllByText(/NASA Space Apps Challenge 2026/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/SIL Open Font License/i).length).toBeGreaterThan(0);
  });
});

describe('focus and suggestions', () => {
  it('shows suggestions only for a zone with findings, and none for a zone without', async () => {
    const m = await mountApp('demo');
    expect(await screen.findByRole('heading', { name: /recommended change/i })).toBeInTheDocument();
    await m.user.click(railRow('eyes'));
    expect(screen.queryByRole('heading', { name: /recommended change/i })).toBeNull();
  });

  it('starts on a summary (one chart, one recommendation) and opens the full detail in a dialog', async () => {
    const m = await mountApp('demo');
    const panel = () => screen.getByRole('heading', { level: 2, name: 'Brain' }).closest('section')!;
    await screen.findByRole('heading', { name: /recommended change/i });
    expect(within(panel()).getAllByRole('img', { name: /last \d+ days/i })).toHaveLength(1);
    expect(within(panel()).getAllByRole('button', { name: 'Accept' })).toHaveLength(1);
    expect(screen.queryByText('What changed')).toBeNull();
    await m.user.click(screen.getByRole('button', { name: /view details/i }));
    const dialog = screen.getByRole('dialog', { name: /brain details/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getAllByText('What changed').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByRole('img', { name: /last \d+ days/i }).length).toBeGreaterThan(1);
    await m.user.click(within(dialog).getByRole('button', { name: /close details/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('What changed')).toBeNull();
  });

  it('shows each recommendation once in the detail, and one Accept records it for every finding it answers', async () => {
    const m = await mountApp('demo');
    await openDetails(m);
    const dialog = screen.getByRole('dialog', { name: /brain details/i });
    await within(dialog).findAllByRole('button', { name: 'Accept' });
    const titles = [...dialog.querySelectorAll('.proposal__title')].map((el) => el.textContent);
    expect(titles.length).toBeGreaterThan(0);
    expect(new Set(titles).size).toBe(titles.length); // no duplicates
    const grouped = within(dialog).queryAllByRole('list', { name: 'Why' })[0];
    if (grouped) {
      const card = grouped.closest('li')!;
      const reasons = within(grouped).getAllByRole('listitem').length;
      const before = m.state().session!.decisions.length;
      await m.user.click(within(card).getByRole('button', { name: 'Accept' }));
      await waitFor(() => expect(m.state().session!.decisions.length).toBe(before + reasons));
      expect(new Set(m.state().session!.decisions.map((d) => d.id)).size).toBe(m.state().session!.decisions.length);
    }
  });

  it('Esc closes the detail dialog without leaving the focused zone, and focus returns to the opener', async () => {
    const m = await mountApp('demo');
    await m.user.click(railRow('heart'));
    const opener = screen.getByRole('button', { name: /view details/i });
    await m.user.click(opener);
    expect(screen.getByRole('dialog', { name: /heart details/i })).toBeInTheDocument();
    await m.user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(/focused zone/i)).toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('Esc closes the check-in first, then leaves the focused zone', async () => {
    const m = await mountApp('demo');
    await m.user.click(railRow('heart'));
    await openCheckIn(m);
    await m.user.keyboard('{Escape}');
    expect(dailyForm()).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Heart' })).toBeInTheDocument();
    await m.user.keyboard('{Escape}');
    expect(screen.getByRole('heading', { level: 2, name: 'Brain' })).toBeInTheDocument();
  });

  it('saves a reading from the zone-scoped form, which shows only that zone\'s fields', async () => {
    const m = await mountApp('demo');
    await m.user.click(railRow('immune'));
    await openDetails(m);
    await m.user.click(screen.getByText(/update immune readings/i));
    const form = within(screen.getByRole('form', { name: /update immune readings/i }));
    expect(form.queryByLabelText(/fasting glucose/i)).toBeNull();
    const before = m.state().session!.manual.length;
    await m.user.type(form.getByLabelText(/^temperature/i), '37.2');
    await m.user.click(form.getByRole('button', { name: /save readings/i }));
    await waitFor(() => expect(m.state().session!.manual.length).toBe(before + 1));
  });
});
