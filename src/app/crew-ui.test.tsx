// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mountApp } from '../test-support/mount';
import { DEMO_ASTRONAUT_ID } from './demo/demo-profiles';
import { DB_NAME } from './mode';

const bp = (sys: number, dia: number) => ({ values: { bpSystolic: sys, bpDiastolic: dia } });
const crewList = () => screen.getByRole('list', { name: /^crew members$/i });
const cardNames = () => within(crewList()).getAllByRole('button').map((b) => b.querySelector('strong')!.textContent);
const card = (name: string) =>
  within(crewList())
    .getAllByRole('button')
    .find((b) => b.querySelector('strong')!.textContent === name)!;

describe('crew dashboard', () => {
  it('replaces the body model for a CMO, with the crew worst status first', async () => {
    await mountApp('demo', { role: 'cmo' });
    expect(await screen.findByRole('region', { name: /^crew$/i })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /^body zones$/i })).toBeNull();
    await waitFor(() => expect(cardNames()).toHaveLength(3)); // the demo CMO and the signed-in CMO have no records
    expect(cardNames().at(-1)).toBe('Demo astronaut 3'); // the calm crewmate sorts last
    expect(card('Demo astronaut 3')).toHaveTextContent(/no findings/i);
    expect(card('Demo astronaut')).toHaveTextContent(/caution/i);
    expect(card('Demo astronaut')).toHaveTextContent(/last check-in: day 150/i);
    expect(card('Demo astronaut').textContent).not.toMatch(/points|phq/i);
  });

  it('keeps the body model for an astronaut', async () => {
    await mountApp('demo', { role: 'astronaut' });
    expect(screen.getByRole('list', { name: /^body zones$/i })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /^crew$/i })).toBeNull();
  });

  it('shows an empty state when there is no crew', async () => {
    const m = await mountApp('live', { role: 'cmo' });
    expect(await screen.findByText(/no crew on this device yet/i)).toBeInTheDocument();
    expect(m.state().mode).toBe('live');
  });

  it('opens a member, shows zones, findings and trends, and goes back', async () => {
    const m = await mountApp('demo', { role: 'cmo' });
    await waitFor(() => expect(cardNames()).toHaveLength(3));
    await m.user.click(card('Demo astronaut'));

    expect(await screen.findByRole('heading', { name: 'Demo astronaut' })).toBeInTheDocument();
    const zones = screen.getByRole('list', { name: /^zone status$/i });
    expect(within(zones).getByText('Brain').closest('li')).toHaveTextContent(/caution/i);
    const findings = screen.getByRole('region', { name: /findings for review/i });
    expect(within(findings).getByText(/mood: notice/i)).toBeInTheDocument();
    expect(findings.textContent).not.toMatch(/points|\bphq2?\b/i);
    const trends = screen.getByRole('region', { name: /^trends$/i });
    expect(await within(trends).findByRole('img', { name: /^resting heart rate/i })).toBeInTheDocument(); // the chart loads lazily
    expect(within(trends).queryByRole('img', { name: /mood|phq/i })).toBeNull(); // mood is never charted

    await m.user.click(screen.getByRole('button', { name: /back to crew/i }));
    expect(await screen.findByRole('list', { name: /^crew members$/i })).toBeInTheDocument();
  });

  it('acknowledges a latched warning for that member, not for the signed-in CMO', async () => {
    const m = await mountApp('demo', { role: 'cmo' });
    await waitFor(() => expect(cardNames()).toHaveLength(3));

    // The demo astronaut records a Warning, then a normal re-measure: it stays latched.
    const astro = await m.world.app('demo', { role: 'astronaut' });
    const out = await astro.state().submitCheckIn(bp(185, 125));
    if (!out.ok) throw new Error('expected ok');
    m.world.wait(120);
    await astro.state().submitCheckIn(bp(130, 80));
    await m.state().refresh(); // a sync pull or a day change does the same in the real app

    await waitFor(() => expect(card('Demo astronaut')).toHaveTextContent(/warning/i));
    expect(cardNames()[0]).toBe('Demo astronaut'); // Warning outranks the Caution of the second crewmate
    await m.user.click(card('Demo astronaut'));
    const ack = await screen.findByRole('button', { name: /acknowledge heart warning/i });
    await m.user.click(ack);
    await waitFor(() => expect(screen.queryByRole('button', { name: /acknowledge/i })).toBeNull());

    const acks = (await m.world.databases.get(DB_NAME.demo)!.load()).acks;
    expect(acks).toHaveLength(1);
    expect(acks[0]!.by).toEqual({ profileId: m.app.profile.id, role: 'cmo' });
    expect(m.app.profile.id).not.toBe(DEMO_ASTRONAUT_ID);
    expect(within(screen.getByRole('list', { name: /^zone status$/i })).getByText('Heart').closest('li')).not.toHaveTextContent(/warning/i);
  });
});
