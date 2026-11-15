// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BrandProvider } from '../brand/brand-context';
import { brand } from '../brand/brand.config';
import { mountApp } from '../test-support/mount';
import { createTestWorld } from '../test-support/compose';
import { ProfileFlow } from './ProfileFlow';
import { DEMO_CMO_ID } from './demo/demo-profiles';

const nav = () => within(screen.getByRole('navigation', { name: 'Views' }));
const navButton = (name: RegExp) => nav().queryByRole('button', { name });
const trigger = () => screen.getByRole('button', { name: /^profile menu/i });

type User = ReturnType<typeof userEvent.setup>;
async function openMenu(user: User) {
  if (trigger().getAttribute('aria-expanded') !== 'true') await user.click(trigger());
  return within(screen.getByRole('menu'));
}
async function hasManage(user: User) {
  const menu = await openMenu(user);
  const has = menu.queryByRole('menuitem', { name: /manage profiles/i }) !== null;
  await user.keyboard('{Escape}');
  return has;
}
async function goManage(user: User) {
  await user.click((await openMenu(user)).getByRole('menuitem', { name: /manage profiles/i }));
}

async function renderFlow(mode: 'live' | 'demo', setup?: (world: ReturnType<typeof createTestWorld>) => Promise<void>) {
  const world = createTestWorld();
  const session = await world.profileSession(mode);
  await setup?.(world);
  const reload = vi.fn();
  const user = userEvent.setup();
  const view = render(
    <BrandProvider value={brand}>
      <ProfileFlow session={session} reload={reload} />
    </BrandProvider>,
  );
  return { world, session, reload, user, ...view };
}

describe('profile gate', () => {
  it('first run: asks for the first profile, creates it, remembers it and goes on', async () => {
    const m = await renderFlow('live');
    expect(await screen.findByRole('heading', { name: 'Create your profile' })).toBeInTheDocument();
    await m.user.type(screen.getByLabelText('Name'), 'Ada');
    // No role picker on first run: the role is fixed to CMO and explained.
    expect(screen.queryByLabelText('Role')).toBeNull();
    expect(screen.getByText('Crew Medical Officer')).toBeInTheDocument();
    expect(screen.getByText(/first profile is the crew medical officer/i)).toBeInTheDocument();
    await m.user.click(screen.getByRole('button', { name: /create profile and start/i }));
    expect(await screen.findByRole('heading', { name: /set up your mission/i })).toBeInTheDocument();
    const [created] = await m.session.services.profiles.list();
    expect(created).toMatchObject({ name: 'Ada', role: 'cmo' });
    expect(m.session.services.activeProfile.get()).toBe(created!.id);
  });

  it('describes the PIN as separation, not security', async () => {
    await renderFlow('live');
    expect(await screen.findByText(/keeps profiles apart on a shared device/i)).toBeInTheDocument();
    expect(screen.getByText(/not a security feature/i)).toBeInTheDocument();
  });

  it('shows an inline error instead of creating a nameless profile', async () => {
    const m = await renderFlow('live');
    await m.user.click(await screen.findByRole('button', { name: /create profile and start/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a name.');
    expect(await m.session.services.profiles.list()).toEqual([]);
  });

  it('lists the profiles; a PIN-protected one asks for its PIN and rejects a wrong one', async () => {
    const m = await renderFlow('live', async (world) => {
      const { services } = await world.profileSession('live');
      await services.create(null, { name: 'Ada', role: 'cmo', pin: '1234' });
      await services.create(null, { name: 'Bo', role: 'astronaut' });
    });
    await m.user.click(await screen.findByRole('button', { name: /^Ada/ }));
    const pin = await screen.findByLabelText(/pin for ada/i, { selector: 'input' });
    await m.user.type(pin, '9999');
    await m.user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/does not match/i);
    expect(screen.queryByRole('heading', { name: /set up your mission/i })).toBeNull();
    await m.user.type(screen.getByLabelText(/pin for ada/i, { selector: 'input' }), '1234');
    await m.user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('heading', { name: /set up your mission/i })).toBeInTheDocument();
  });

  it('a profile without a PIN goes straight in; Back returns to the list', async () => {
    const m = await renderFlow('live', async (world) => {
      const { services } = await world.profileSession('live');
      await services.create(null, { name: 'Ada', role: 'cmo', pin: '1234' });
      await services.create(null, { name: 'Bo', role: 'astronaut' });
    });
    await m.user.click(await screen.findByRole('button', { name: /^Ada/ }));
    await m.user.click(await screen.findByRole('button', { name: 'Back' }));
    await m.user.click(await screen.findByRole('button', { name: /^Bo/ }));
    expect(await screen.findByRole('heading', { name: /set up your mission/i })).toBeInTheDocument();
  });

  it('creating a profile at the gate once profiles exist offers astronaut only', async () => {
    const m = await renderFlow('live', async (world) => {
      const { services } = await world.profileSession('live');
      await services.create(null, { name: 'Ada', role: 'cmo' });
    });
    await m.user.click(await screen.findByRole('button', { name: 'Create a profile' }));
    expect(await screen.findByRole('heading', { name: 'New profile' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Role')).toBeNull();
    await m.user.type(screen.getByLabelText('Name'), 'Cy');
    await m.user.click(screen.getByRole('button', { name: 'Create profile' }));
    await screen.findByRole('heading', { name: /set up your mission/i });
    const all = await m.session.services.profiles.list();
    expect(all.find((p) => p.name === 'Cy')?.role).toBe('astronaut');
  });

  it('a remembered profile with a PIN comes back through the PIN prompt', async () => {
    const m = await renderFlow('live', async (world) => {
      const { services } = await world.profileSession('live');
      const made = await services.create(null, { name: 'Ada', role: 'cmo', pin: '1234' });
      if (made.ok) services.activeProfile.set(made.profile.id);
    });
    expect(await screen.findByLabelText(/pin for ada/i, { selector: 'input' })).toBeInTheDocument();
    expect(m.reload).not.toHaveBeenCalled();
  });
});

describe('profile switcher and the role switch in DEMO', () => {
  it('starts as the demo astronaut, shows name and role, and lets the astronaut check in', async () => {
    await renderFlow('demo');
    const header = await screen.findByRole('banner');
    expect(within(header).getByRole('button', { name: /^profile menu, demo astronaut$/i })).toHaveAttribute('aria-haspopup', 'menu');
    expect((await openMenu(userEvent.setup())).getAllByText('Astronaut').length).toBeGreaterThan(0);
    await userEvent.setup().keyboard('{Escape}');
    expect(screen.getByRole('button', { name: /^check-in$/i })).toBeInTheDocument();
    expect(await hasManage(userEvent.setup())).toBe(false);
  });

  it('Switch profile clears the active profile and reloads; picking the demo CMO flips what the UI allows', async () => {
    const m = await renderFlow('demo');
    await screen.findByRole('banner');
    await m.user.click((await openMenu(m.user)).getByRole('menuitem', { name: 'All profiles...' }));
    expect(m.reload).toHaveBeenCalledTimes(1);
    expect(m.session.services.activeProfile.get()).toBeNull();

    m.unmount();
    const again = render(
      <BrandProvider value={brand}>
        <ProfileFlow session={m.session} reload={m.reload} />
      </BrandProvider>,
    );
    await userEvent.setup().click(await screen.findByRole('button', { name: /demo cmo/i }));
    const header = await screen.findByRole('banner');
    expect(within(header).getByRole('button', { name: /^profile menu, demo cmo$/i })).toBeInTheDocument();
    expect(m.session.services.activeProfile.get()).toBe(DEMO_CMO_ID);
    expect(screen.queryByRole('button', { name: /^check-in$/i })).toBeNull(); // a CMO does not check in
    expect(await hasManage(userEvent.setup())).toBe(true);
    await userEvent.setup().click(navButton(/^comms/i)!);
    expect(screen.getByRole('region', { name: /crew medical officer/i })).toBeInTheDocument();
    again.unmount();
  });
});

describe('account menu', () => {
  it('is a menu button: aria-haspopup, aria-expanded, Esc and outside click close it and return focus', async () => {
    const m = await mountApp('demo', { role: 'astronaut' });
    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    await m.user.click(trigger());
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await m.user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger()).toHaveFocus();
    await m.user.click(trigger());
    await m.user.click(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('moves between items with the arrow keys, wrapping around', async () => {
    const m = await mountApp('demo', { role: 'cmo' });
    await m.user.click(trigger());
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
    expect(items[0]).toHaveFocus();
    await m.user.keyboard('{ArrowDown}');
    expect(items[1]).toHaveFocus();
    await m.user.keyboard('{ArrowUp}{ArrowUp}');
    expect(items[items.length - 1]).toHaveFocus();
    await m.user.keyboard('{Home}');
    expect(items[0]).toHaveFocus();
    await m.user.keyboard('{End}');
    expect(items[items.length - 1]).toHaveFocus();
  });

  it('opens from the keyboard with ArrowDown on the button', async () => {
    const m = await mountApp('demo', { role: 'astronaut' });
    trigger().focus();
    await m.user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('shows the active name and role, other profiles, and Manage profiles only to a CMO', async () => {
    const m = await mountApp('demo', { role: 'cmo' });
    const menu = await openMenu(m.user);
    expect(menu.getAllByText('Crew Medical Officer').length).toBeGreaterThan(0);
    await waitFor(() => expect(menu.getByRole('menuitem', { name: /demo astronaut(?! \d)/i })).toBeInTheDocument());
    expect(menu.getByRole('menuitem', { name: /manage profiles/i })).toBeInTheDocument();
    await m.user.click(menu.getByRole('menuitem', { name: /demo astronaut(?! \d)/i }));
    expect(m.switches.count).toBe(1); // the PIN prompt, if any, is the gate's job after the reload
    expect(screen.queryByRole('menu')).toBeNull();
    await goManage(m.user);
    expect(await screen.findByRole('heading', { name: 'Profiles' })).toBeInTheDocument();
  });

  it('hides Manage profiles from an astronaut', async () => {
    await mountApp('demo', { role: 'astronaut' });
    expect(await hasManage(userEvent.setup())).toBe(false);
  });

  it('carries the DEMO group and the mode switch, and LIVE has neither Demo actions nor mission day', async () => {
    const demo = await mountApp('demo');
    let menu = await openMenu(demo.user);
    expect(menu.getByRole('group', { name: 'Demo' })).toBeInTheDocument();
    expect(menu.getByRole('menuitem', { name: 'Switch to LIVE' })).toHaveAttribute('href', '?mode=live');
    expect(within(screen.getByRole('banner')).queryByText(/Day \d+ of/)).toBeNull();
    demo.unmount();
    const live = await mountApp('live');
    menu = await openMenu(live.user);
    expect(menu.queryByRole('group', { name: 'Demo' })).toBeNull();
    expect(menu.getByRole('menuitem', { name: 'Switch to DEMO' })).toBeInTheDocument();
  });

  it('keeps the header to badges, the account button and Check-in', async () => {
    await mountApp('demo');
    const header = within(screen.getByRole('banner'));
    expect(header.queryByRole('button', { name: 'Advance one day' })).toBeNull();
    expect(header.queryByRole('link', { name: /switch to/i })).toBeNull();
    expect(header.getByRole('button', { name: 'Check-in' })).toBeInTheDocument();
  });
});

describe('role gating in the UI', () => {
  it('astronaut: check-in and Accept/Dismiss yes; CMO panel and Profiles no', async () => {
    const m = await mountApp('demo', { role: 'astronaut' });
    expect(screen.getByRole('button', { name: /^check-in$/i })).toBeInTheDocument();
    expect(await hasManage(userEvent.setup())).toBe(false);
    const more = screen.queryByRole('button', { name: /view details/i });
    if (more) await m.user.click(more);
    expect((await screen.findAllByRole('button', { name: 'Accept' })).length).toBeGreaterThan(0);
    await m.user.click(navButton(/^comms/i)!);
    expect(screen.queryByRole('region', { name: /crew medical officer/i })).toBeNull();
  });

  it('cmo: CMO panel and Profiles yes; check-in and Accept/Dismiss no', async () => {
    const m = await mountApp('demo', { role: 'cmo' });
    expect(screen.queryByRole('button', { name: /^check-in$/i })).toBeNull();
    expect(await hasManage(userEvent.setup())).toBe(true);
    // The CMO reviews the crew instead of the body model, so there is no zone panel to act on.
    expect(await screen.findByRole('region', { name: /^crew$/i })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /^body zones$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
    expect(screen.queryByText(/update .* readings/i)).toBeNull(); // no zone-level check-in form either
    await m.user.click(navButton(/^comms/i)!);
    expect(screen.getByRole('region', { name: /crew medical officer/i })).toBeInTheDocument();
  });

  it('flight surgeon: CMO panel yes, Profiles no, check-in no', async () => {
    const m = await mountApp('demo', { role: 'flightSurgeon' });
    expect(screen.queryByRole('button', { name: /^check-in$/i })).toBeNull();
    expect(await hasManage(userEvent.setup())).toBe(false);
    await m.user.click(navButton(/^comms/i)!);
    expect(screen.getByRole('region', { name: /crew medical officer/i })).toBeInTheDocument();
  });

  it('follows a role change of the signed-in profile without a reload', async () => {
    const m = await mountApp('demo', { role: 'astronaut' });
    expect(screen.getByRole('button', { name: /^check-in$/i })).toBeInTheDocument();
    await act(async () => m.actAs('cmo'));
    await waitFor(() => expect(screen.queryByRole('button', { name: /^check-in$/i })).toBeNull());
    expect(await hasManage(userEvent.setup())).toBe(true);
  });
});

describe('profile management (cmo)', () => {
  async function openProfiles() {
    const m = await mountApp('live', { role: 'cmo' });
    await goManage(m.user);
    await screen.findByRole('heading', { name: 'Profiles' });
    return m;
  }
  const row = (name: string) => screen.getByText(name, { selector: 'strong' }).closest('li')!;

  it('lists the profiles, and the signed-in one cannot be deleted', async () => {
    await openProfiles();
    const mine = await waitFor(() => row('Test cmo (you)'));
    expect(within(mine).getByRole('button', { name: /^delete/i })).toBeDisabled();
  });

  it('creates a profile with a role and a PIN', async () => {
    const m = await openProfiles();
    const form = screen.getByRole('form', { name: 'New profile' });
    await m.user.type(within(form).getByLabelText('Name'), 'Bo');
    await m.user.selectOptions(within(form).getByLabelText('Role'), 'flightSurgeon');
    await m.user.type(within(form).getByLabelText(/^PIN/), '4321');
    await m.user.click(within(form).getByRole('button', { name: 'Add profile' }));
    const created = await waitFor(() => row('Bo'));
    expect(within(created).getByText('PIN set')).toBeInTheDocument();
    const stored = (await m.services.profiles.list()).find((p) => p.name === 'Bo');
    expect(stored).toMatchObject({ role: 'flightSurgeon' });
    expect(stored?.pin?.hash).toEqual(expect.any(String));
  });

  it('renames, changes role, removes a PIN and soft deletes', async () => {
    const m = await openProfiles();
    await m.services.create({ profileId: 'test-cmo', name: 'Test cmo', role: 'cmo' }, { name: 'Bo', role: 'astronaut', pin: '1234' });
    await m.user.click(navButton(/^dashboard/i)!); // re-open to reload the list
    await goManage(m.user);
    const bo = await waitFor(() => row('Bo'));

    await m.user.clear(within(bo).getByLabelText('Name'));
    await m.user.type(within(bo).getByLabelText('Name'), 'Bo B.');
    await m.user.click(within(bo).getByRole('button', { name: 'Save name' }));
    await waitFor(() => row('Bo B.'));

    await m.user.selectOptions(within(row('Bo B.')).getByLabelText('Role'), 'cmo');
    await waitFor(async () => expect((await m.services.profiles.list()).find((p) => p.name === 'Bo B.')?.role).toBe('cmo'));

    await m.user.click(within(row('Bo B.')).getByRole('button', { name: 'Remove PIN' }));
    await waitFor(() => expect(within(row('Bo B.')).getByText('No PIN')).toBeInTheDocument());

    await m.user.click(within(row('Bo B.')).getByRole('button', { name: /^delete/i }));
    await waitFor(() => expect(screen.queryByText('Bo B.', { selector: 'strong' })).toBeNull());
    const all = await m.services.profiles.list({ includeDeleted: true });
    expect(all.find((p) => p.name === 'Bo B.')).toMatchObject({ deleted: true });
  });

  it('keeps at least one CMO and says why', async () => {
    const m = await openProfiles();
    await m.user.selectOptions(within(await waitFor(() => row('Test cmo (you)'))).getByLabelText('Role'), 'astronaut');
    expect(await screen.findByRole('alert')).toHaveTextContent(/keep at least one cmo/i);
    expect(m.state().actor.role).toBe('cmo');
  });

  it('renaming the signed-in profile updates the header and later records', async () => {
    const m = await openProfiles();
    const mine = await waitFor(() => row('Test cmo (you)'));
    await m.user.clear(within(mine).getByLabelText('Name'));
    await m.user.type(within(mine).getByLabelText('Name'), 'Dr. Ada');
    await m.user.click(within(mine).getByRole('button', { name: 'Save name' }));
    await waitFor(() => expect(m.state().actor.name).toBe('Dr. Ada'));
    expect(within(screen.getByRole('banner')).getByRole('button', { name: /^profile menu, dr\. ada$/i })).toBeInTheDocument();
  });
});
