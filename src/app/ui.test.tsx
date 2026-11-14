// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { knowledge } from '../knowledge';
import { mountApp } from '../test-support/mount';

type Mounted = Awaited<ReturnType<typeof mountApp>>;

const rail = () => screen.getByRole('list', { name: /body zones by alert tier/i });
const railRow = (zone: string) => rail().querySelector<HTMLElement>(`[data-zone-id="${zone}"]`)!;
const outboxCards = () => screen.queryAllByTestId('outbox-message');

/** Types into a check-in field. Scoped to the form: charts also carry aria-labels with the same words. */
async function fill(m: Mounted, label: RegExp, value: string) {
  const form = screen.queryByRole('form', { name: /daily check-in/i });
  const scope = form ? within(form) : screen;
  await m.user.clear(scope.getByLabelText(label));
  await m.user.type(scope.getByLabelText(label), value);
}
async function save(m: Mounted) {
  await m.user.click(screen.getByRole('button', { name: /save check-in/i }));
}
async function enterBp(m: Mounted, sys: string, dia: string) {
  await fill(m, /^systolic blood pressure/i, sys);
  await fill(m, /^diastolic blood pressure/i, dia);
  await save(m);
}

describe('app shell: disclaimer and mode badge on both views, both modes', () => {
  for (const mode of ['demo', 'live'] as const) {
    it(`shows the header badge, mission day and footer disclaimer in ${mode.toUpperCase()}, on Dashboard and Sources`, async () => {
      const m = await mountApp(mode);
      const header = () => screen.getByRole('banner');
      const footer = () => screen.getByRole('contentinfo');
      const check = () => {
        expect(within(header()).getByText(mode === 'demo' ? 'DEMO' : 'LIVE')).toBeInTheDocument();
        expect(within(header()).getByText(/Day \d+ of 210/)).toBeInTheDocument();
        expect(within(footer()).getByText(/decision support, not medical advice/i)).toBeInTheDocument();
        const synthetic = within(header()).queryByText('SYNTHETIC');
        if (mode === 'demo') expect(synthetic).toBeInTheDocument();
        else expect(synthetic).toBeNull();
      };
      check();
      expect(screen.getByRole('button', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
      await m.user.click(screen.getByRole('button', { name: 'Sources' }));
      expect(screen.getByRole('heading', { name: /sources and disclosures/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sources' })).toHaveAttribute('aria-current', 'page');
      check();
    });
  }

  it('shows Day 150 of 210 and the demo controls only in DEMO', async () => {
    const demo = await mountApp('demo');
    expect(within(screen.getByRole('banner')).getByText('Day 150 of 210')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Advance one day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset demo' })).toBeInTheDocument();
    demo.unmount();
    await mountApp('live');
    expect(within(screen.getByRole('banner')).getByText('Day 1 of 210')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Advance one day' })).toBeNull();
  });

  it('asks for confirmation before Reset demo and keeps data when cancelled', async () => {
    const m = await mountApp('demo');
    await m.user.click(screen.getByRole('button', { name: 'Reset demo' }));
    expect(screen.getByText(/reset the demo\?/i)).toBeInTheDocument();
    await m.user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Reset demo' })).toBeInTheDocument();
    expect(m.state().generation).toBe(0);
    await m.user.click(screen.getByRole('button', { name: 'Reset demo' }));
    await m.user.click(screen.getByRole('button', { name: 'Yes, reset' }));
    await waitFor(() => expect(m.state().generation).toBe(1));
  });

  it('advances one day from the header', async () => {
    const m = await mountApp('demo');
    await m.user.click(screen.getByRole('button', { name: 'Advance one day' }));
    await waitFor(() => expect(within(screen.getByRole('banner')).getByText('Day 151 of 210')).toBeInTheDocument());
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
    const adapters = await composeAdapters('demo', {
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
    await waitFor(() => expect(within(screen.getByRole('banner')).getByText('Day 1 of 210')).toBeInTheDocument());
  });

  it('rejects a bad transit length inline', async () => {
    const m = await mountApp('live', { configureLive: false });
    await fill(m, /transit length/i, '0');
    await m.user.click(screen.getByRole('button', { name: /start mission/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/whole number of days/i);
    expect(m.state().hasMissionConfig).toBe(false);
  });

  it('starts empty: zones read No data, the panel invites the first check-in, nothing is synthetic', async () => {
    await mountApp('live');
    expect(rail()).toHaveTextContent(/no recent reading/i);
    expect(screen.getByText(/add your first check-in/i)).toBeInTheDocument();
    expect(screen.queryByText('SYNTHETIC')).toBeNull();
    expect(screen.getByText(/no messages/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing needs review/i)).toBeInTheDocument();
  });
});

describe('alert rail and zone selection', () => {
  it('lists the six zones sorted by tier, Warning and Caution first, Not monitored last', async () => {
    await mountApp('demo');
    const ids = [...rail().querySelectorAll<HTMLElement>('[data-zone-id]')].map((el) => el.dataset.zoneId);
    expect(ids).toHaveLength(6);
    expect(ids[0]).toBe('brain'); // Caution at the demo seed
    expect(ids[1]).toBe('heart'); // Notice
    expect(ids.slice(-2).sort()).toEqual(['bone', 'eyes']); // Not monitored
    expect(railRow('brain')).toHaveTextContent(/caution/i);
    expect(railRow('eyes')).toHaveTextContent(/not monitored/i);
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
    await mountApp('demo');
    const panel = screen.getByRole('heading', { level: 2, name: 'Brain' }).closest('section')!;
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
    expect(screen.getAllByText(/no readings yet/i).length).toBeGreaterThan(0); // blood pressure has none
  });

  it('logs a Dismiss, removes the suggestion and leaves the tier alone', async () => {
    const m = await mountApp('demo');
    const before = screen.getAllByRole('button', { name: 'Dismiss' }).length;
    expect(before).toBeGreaterThan(0);
    const status = m.state().session!.evaluation.zones.brain.status;
    await m.user.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]!);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Dismiss' })).toHaveLength(before - 1));
    expect(m.state().session!.decisions.at(-1)?.decision).toBe('dismissed');
    expect(m.state().session!.evaluation.zones.brain.status).toBe(status);
  });

  it('logs an Accept and shows it as accepted', async () => {
    const m = await mountApp('demo');
    await m.user.click(screen.getAllByRole('button', { name: 'Accept' })[0]!);
    await waitFor(() => expect(screen.getAllByText('Accepted').length).toBeGreaterThan(0));
    expect(m.state().session!.decisions.at(-1)?.decision).toBe('accepted');
  });
});

describe('daily check-in form', () => {
  it('has exactly two PHQ-2 questions and no item 9 or self-harm item', async () => {
    await mountApp('demo');
    const form = screen.getByRole('form', { name: /daily check-in/i });
    expect(within(form).getAllByText(/little interest or pleasure|feeling down, depressed or hopeless/i)).toHaveLength(2);
    expect(form.textContent).not.toMatch(/self-harm|better off dead|hurt yourself|item 9/i);
  });

  it('shows hints, units and the rest, symptom and glucose controls', async () => {
    await mountApp('demo');
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
    expect(screen.getByLabelText(/^temperature/i)).toHaveAttribute('aria-invalid', 'true');
    expect(m.state().session!.manual).toHaveLength(before);
  });

  it('rejects half a blood pressure pair and half a PHQ-2', async () => {
    const m = await mountApp('demo');
    await fill(m, /^systolic blood pressure/i, '120');
    await m.user.click(screen.getByRole('radio', { name: /little interest.*: 2,/i }));
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
    expect(screen.queryByLabelText(/fasting glucose/i)).toBeNull();
    expect(screen.getByLabelText(/^temperature/i)).toBeInTheDocument();
  });
});

describe('golden flows through the UI', () => {
  it('BP 185/125 shows a Warning on the heart zone and exactly one outbox message', async () => {
    const m = await mountApp('demo');
    expect(outboxCards()).toHaveLength(0);
    await enterBp(m, '185', '125');
    await waitFor(() => expect(railRow('heart')).toHaveTextContent(/warning/i));
    expect(rail().querySelector('[data-zone-id]')).toBe(railRow('heart')); // sorted to the top
    expect(outboxCards()).toHaveLength(1);
    expect(outboxCards()[0]).toHaveTextContent(/queued/i);
    expect(outboxCards()[0]).toHaveTextContent(/earliest reply T\+24 min after sending/i);
    // The form reset and confirmed the save as MANUAL.
    expect(screen.getByText(/saved as manual/i)).toBeInTheDocument();
  });

  it('38.1 C stays Information with the in-flight shift explanation', async () => {
    const m = await mountApp('demo');
    await fill(m, /^temperature/i, '38.1');
    await save(m);
    await waitFor(() => expect(railRow('immune')).toHaveTextContent(/information/i));
    expect(railRow('immune')).not.toHaveTextContent(/caution|warning|notice/i);
    await m.user.click(railRow('immune'));
    expect(screen.getByText(/rises by about 1 C/i)).toBeInTheDocument();
    expect(outboxCards()).toHaveLength(0);
  });

  it('latches the Warning after a normal re-measure until the CMO acknowledges it', async () => {
    const m = await mountApp('demo');
    await enterBp(m, '185', '125');
    await waitFor(() => expect(outboxCards()).toHaveLength(1));
    m.world.wait(120);
    await enterBp(m, '130', '80');
    await waitFor(() => expect(screen.getAllByText(/latest re-measure/i).length).toBeGreaterThan(0));
    expect(railRow('heart')).toHaveTextContent(/warning/i);
    const cmo = screen.getByRole('region', { name: /crew medical officer/i });
    const acks = within(cmo).getAllByRole('button', { name: /acknowledge heart warning/i });
    expect(acks.length).toBe(1); // one per (zone, group)
    await m.user.click(acks[0]!);
    await waitFor(() => expect(within(cmo).queryByRole('button', { name: /acknowledge/i })).toBeNull());
    expect(railRow('heart')).not.toHaveTextContent(/warning/i);
    expect(outboxCards()).toHaveLength(1); // the message remains
  });
});

describe('Crew Medical Officer panel', () => {
  it('shows the corroborated brain zone as tiers, never as scores', async () => {
    await mountApp('demo');
    const cmo = screen.getByRole('region', { name: /crew medical officer/i });
    expect(within(cmo).getByText('Brain')).toBeInTheDocument();
    expect(within(cmo).getByText(/mood: notice/i)).toBeInTheDocument();
    expect(cmo.textContent).not.toMatch(/\d\s*points|phq/i);
  });

  it('keeps a mood score out of every CMO and outbox text even when mood is high', async () => {
    const m = await mountApp('demo');
    await m.user.click(screen.getByRole('radio', { name: /little interest.*: 3,/i }));
    await m.user.click(screen.getByRole('radio', { name: /feeling down.*: 3,/i }));
    await enterBp(m, '185', '125');
    await waitFor(() => expect(outboxCards()).toHaveLength(1));
    const cmo = screen.getByRole('region', { name: /crew medical officer/i });
    expect(cmo.textContent).not.toMatch(/\b6\b|points|phq/i);
  });
});

describe('outbox', () => {
  async function withWarning() {
    const m = await mountApp('demo');
    await enterBp(m, '185', '125');
    await waitFor(() => expect(outboxCards()).toHaveLength(1));
    return m;
  }

  it('payload preview shows tiers only: no PHQ values, mood is at most a tier', async () => {
    const m = await mountApp('demo');
    await m.user.click(screen.getByRole('radio', { name: /little interest.*: 3,/i }));
    await m.user.click(screen.getByRole('radio', { name: /feeling down.*: 3,/i }));
    await enterBp(m, '185', '125');
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
    await mountApp('demo');
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
    await m.user.click(screen.getByRole('button', { name: 'Sources' }));
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
