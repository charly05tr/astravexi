// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createAiSettingsStore } from '../adapters/llm-suggestions/settings-store';
import type { FollowUpSuggestion } from '../core/follow-up/blocks';
import type { FollowUpSuggestionProvider } from '../core/ports';
import { mountApp } from '../test-support/mount';

type Mounted = Awaited<ReturnType<typeof mountApp>>;

const SUGGESTION: FollowUpSuggestion = {
  title: 'Build on your new routine',
  blocks: [
    { type: 'rationale', text: 'A steady evening helps your recovery.' },
    { type: 'new_habit', name: 'Evening wind-down', frequency: 'Daily', timeOfDay: 'Before sleep', durationMinutes: 15 },
    { type: 'routine_change', what: 'Screen time', from: 'Phone in bed', to: 'Read a paper book', when: '3 times a week' },
    { type: 'metric_target', metric: 'Sleep', target: 7.5, unit: 'h' },
  ],
};

const provider = (): FollowUpSuggestionProvider => ({
  id: 'fake',
  isConfigured: () => true,
  subscribe: () => () => undefined,
  suggest: vi.fn(() => Promise.resolve(SUGGESTION)),
});

async function mount(role: 'astronaut' | 'cmo' = 'astronaut') {
  const aiSettings = createAiSettingsStore({ session: null, local: null });
  aiSettings.set({ apiKey: 'k', model: 'test-model', baseUrl: 'https://example.test/v1/', remember: false });
  return mountApp('demo', { role, followUps: provider(), aiSettings });
}

/** Accepts the first recommendation and opens the AI result modal. */
async function acceptAndOpen(m: Mounted) {
  await m.user.click((await screen.findAllByRole('button', { name: 'Accept' }))[0]!);
  return screen.findByRole('dialog', { name: 'Build on your new routine' });
}

async function saveFromModal(m: Mounted, ...labels: string[]) {
  const dialog = await acceptAndOpen(m);
  for (const label of labels) await m.user.click(within(dialog).getByRole('checkbox', { name: label }));
  await m.user.click(within(dialog).getByRole('button', { name: 'Save selected habits' }));
  return dialog;
}

const goToHabits = (m: Mounted) =>
  m.user.click(within(screen.getByRole('navigation', { name: 'Views' })).getByRole('button', { name: 'My habits' }));

describe('select and save AI habits', () => {
  it('offers a checkbox on habit blocks only, and keeps Save disabled until something is ticked', async () => {
    const m = await mount();
    const dialog = await acceptAndOpen(m);
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(2);
    expect(within(dialog).getByRole('checkbox', { name: 'Select habit: Evening wind-down' })).not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Select routine change: Read a paper book' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save selected habits' })).toBeDisabled();
  });

  it('saves the ticked blocks with provenance, toasts, and marks them saved (idempotent)', async () => {
    const m = await mount();
    const dialog = await saveFromModal(m, 'Select habit: Evening wind-down', 'Select routine change: Read a paper book');

    expect(await screen.findByText('Saved 2 habits to My habits.')).toBeInTheDocument();
    const { habits } = m.state().habitData;
    expect(habits.map((h) => h.name).sort()).toEqual(['Evening wind-down', 'Read a paper book']);
    expect(habits.find((h) => h.name === 'Read a paper book')?.frequency).toEqual({ kind: 'weekly', times: 3 });
    expect(habits[0]!.origin).toMatchObject({ model: 'test-model', recommendationId: expect.any(String) });
    expect(habits[0]!.origin.createdAt).toEqual(expect.any(String));
    expect(await within(dialog).findAllByText('Saved to My habits')).toHaveLength(2);
    expect(within(dialog).getByRole('checkbox', { name: 'Select habit: Evening wind-down' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Save selected habits' })).toBeDisabled();

    // The same blocks saved again through the store change nothing.
    const recommendationId = habits[0]!.origin.recommendationId;
    const again = await m.state().saveHabits({
      recommendationId,
      model: 'test-model',
      blocks: [SUGGESTION.blocks[1] as never],
    });
    expect(again).toMatchObject({ saved: 0, skipped: 1 });
    expect(m.state().habitData.habits).toHaveLength(2);
  });

  it('"View habits" opens My habits with the saved habit', async () => {
    const m = await mount();
    await saveFromModal(m, 'Select habit: Evening wind-down');
    await m.user.click(await screen.findByRole('button', { name: 'View habits' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const list = await screen.findByRole('list', { name: 'Active habits' });
    expect(within(list).getByText('Evening wind-down')).toBeInTheDocument();
    expect(within(list).getByText(/every day/i)).toBeInTheDocument();
  });
});

describe('tracking and gamification', () => {
  async function withHabit() {
    const m = await mount();
    const dialog = await saveFromModal(m, 'Select habit: Evening wind-down');
    await m.user.click(within(dialog).getByRole('button', { name: 'Close AI suggestion' }));
    await goToHabits(m);
    return m;
  }
  const check = (m: Mounted) => m.user.click(screen.getByRole('button', { name: 'Done today: Evening wind-down' }));
  const points = () => screen.getByTestId('habit-points').textContent;

  it('checks off, awards points and badges with toasts, and undoes on the same day', async () => {
    const m = await withHabit();
    expect(screen.getByRole('button', { name: 'Done today: Evening wind-down' })).toHaveAttribute('aria-pressed', 'false');
    expect(points()).toBe('0');

    await check(m);
    expect(points()).toBe('10');
    expect(screen.getByRole('button', { name: 'Done today: Evening wind-down' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/1 day streak/)).toBeInTheDocument();
    expect(await screen.findByText(/Badge unlocked: First habit/)).toBeInTheDocument();
    expect(await screen.findByText(/Badge unlocked: First check-off/)).toBeInTheDocument();

    await check(m);
    expect(points()).toBe('0');
    expect(screen.getByText(/No streak yet/)).toBeInTheDocument();
    await check(m); // checking again does not unlock the badge a second time
    expect(m.state().habitData.badges.map((b) => b.id).sort()).toEqual(['first_completion', 'first_habit']);
  });

  it('follows the demo clock: the streak survives a day not yet done and breaks after a missed one', async () => {
    const m = await withHabit();
    await check(m);
    expect(screen.getByText(/1 day streak/)).toBeInTheDocument();

    await act(async () => m.state().advanceDay()); // day 151, not done yet: still alive
    await waitFor(() => expect(screen.getByRole('list', { name: 'Active habits' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Done today: Evening wind-down' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/1 day streak/)).toBeInTheDocument();

    await check(m);
    expect(screen.getByText(/2 days streak/)).toBeInTheDocument();

    await act(async () => m.state().advanceDay()); // 152, not done
    await act(async () => m.state().advanceDay()); // 153: 152 was missed
    await waitFor(() => expect(screen.getByText(/No streak yet/)).toBeInTheDocument());
    expect(screen.getByText(/Best: 2 days/)).toBeInTheDocument();
  });

  it('raises a level-up toast and moves the progress bar', async () => {
    const m = await withHabit();
    for (let i = 0; i < 5; i += 1) {
      await check(m);
      if (i < 4) await act(async () => m.state().advanceDay());
    }
    expect(points()).toBe('50');
    expect(screen.getByTestId('habit-level')).toHaveTextContent('2');
    expect(await screen.findByText('Level up! You reached level 2.')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progress to the next level' })).toHaveAttribute('aria-valuenow', '0');
  });

  it('archives and restores a habit, and deletes it after confirming', async () => {
    const m = await withHabit();
    await m.user.click(screen.getByRole('button', { name: 'Archive Evening wind-down' }));
    expect(screen.queryByRole('list', { name: 'Active habits' })).toBeNull();
    expect(screen.getByText('Archived habits (1)')).toBeInTheDocument();
    await m.user.click(screen.getByRole('button', { name: 'Restore Evening wind-down' }));
    expect(await screen.findByRole('list', { name: 'Active habits' })).toBeInTheDocument();

    await m.user.click(screen.getByRole('button', { name: 'Delete Evening wind-down' }));
    await m.user.click(screen.getByRole('button', { name: 'Confirm delete' }));
    expect(m.state().habitData.habits).toEqual([]);
    expect(screen.getByText(/no habits yet/i)).toBeInTheDocument();
  });

  it('Reset demo clears the habits and the progress', async () => {
    const m = await withHabit();
    await check(m);
    await act(async () => m.state().resetDemo());
    expect(m.state().habitData).toEqual({ habits: [], completions: [], badges: [] });
    expect(await m.app.adapters.deps.store.loadHabits()).toEqual({ habits: [], completions: [], badges: [] });
    expect(points()).toBe('0');
  });
});

describe('roles', () => {
  it('shows the My habits tab to the astronaut and not to the CMO', async () => {
    await mount('cmo');
    expect(within(screen.getByRole('navigation', { name: 'Views' })).queryByRole('button', { name: 'My habits' })).toBeNull();
  });

  it('lets the CMO read the astronaut habits and progress in the crew detail, without check-off controls', async () => {
    const m = await mount();
    const dialog = await saveFromModal(m, 'Select habit: Evening wind-down');
    await m.user.click(within(dialog).getByRole('button', { name: 'Close AI suggestion' }));
    await goToHabits(m);
    await m.user.click(screen.getByRole('button', { name: 'Done today: Evening wind-down' }));
    expect(screen.getByTestId('habit-points')).toHaveTextContent('10');

    await act(async () => m.actAs('cmo'));
    await m.user.click(within(screen.getByRole('navigation', { name: 'Views' })).getByRole('button', { name: 'Dashboard' }));
    const crew = await screen.findByRole('list', { name: /^crew members$/i });
    const card = await waitFor(() => {
      const c = within(crew).getAllByRole('button').find((b) => b.querySelector('strong')?.textContent === 'Demo astronaut');
      expect(c).toBeDefined();
      return c!;
    });
    await m.user.click(card);

    const panel = await screen.findByRole('region', { name: 'Habits' });
    expect(within(panel).getByText('Evening wind-down')).toBeInTheDocument();
    expect(within(panel).getByTestId('habit-points')).toHaveTextContent('10');
    expect(within(panel).queryByRole('button')).toBeNull();
  });

  it('refuses habit writes from a CMO in the use-case, not only in the UI', async () => {
    const m = await mount('cmo');
    await expect(m.state().toggleHabit('whatever')).rejects.toThrow(/cannot perform/i);
    await expect(
      m.state().saveHabits({ recommendationId: 'r', model: 'm', blocks: [SUGGESTION.blocks[1] as never] }),
    ).rejects.toThrow(/cannot perform/i);
  });
});
