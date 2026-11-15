// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MINUTES_PER_DAY, missionTimeLabel } from '../core/playback/timeline';
import { createFakeScheduler } from '../test-support/fake-scheduler';
import { mountApp } from '../test-support/mount';
import { loadDemoScenario } from './demo/demo-scenario';
import { SHOWCASE_ID } from './demo/showcase';
import { DEFAULT_DEMO_URL, EXITED_FLAG, setExitNavigator } from '../features/playback/exit-playback';
import { PLAYER_HIDDEN_KEY, setPlayerHidden } from '../features/playback/player-visibility';
import { createTestWorld, testProfile } from '../test-support/compose';
import { composeAdapters } from './composition-root';

async function mountShowcase(role: 'cmo' | 'astronaut' = 'cmo') {
  const fake = createFakeScheduler();
  const scenario = loadDemoScenario(SHOWCASE_ID)!;
  const app = await mountApp('demo', { role, scenario, playback: { scheduler: fake.scheduler } });
  const adapters = app.app.adapters;
  if (adapters.mode !== 'demo' || !adapters.playback) throw new Error('playback expected');
  const playback = adapters.playback;
  const time = () => screen.getByTestId('mission-time');
  const seek = (t: number) => act(async () => void (await playback.seek(t)));
  const run = (ms: number) => act(async () => void (await fake.run(ms)));
  return { ...app, fake, scenario, playback, time, seek, run };
}

const day = (d: number, h = 0, m = 0) => (d - 1) * MINUTES_PER_DAY + h * 60 + m;

describe('playback bar', () => {
  it('appears only when a scenario is loaded: not in the default demo, not in LIVE', async () => {
    const withScenario = await mountShowcase();
    expect(await screen.findByRole('region', { name: /mission playback/i })).toBeInTheDocument();
    withScenario.unmount();

    const plain = await mountApp('demo', { role: 'cmo' });
    await screen.findByRole('navigation', { name: /views/i });
    expect(screen.queryByRole('region', { name: /mission playback/i })).toBeNull();
    expect(screen.queryByRole('slider', { name: /mission time/i })).toBeNull();
    plain.unmount();

    await mountApp('live', { role: 'cmo' });
    await screen.findByRole('navigation', { name: /views/i });
    expect(screen.queryByRole('region', { name: /mission playback/i })).toBeNull();
  });

  it('shows the mission time, a slider over the scenario span and an accessible play toggle', async () => {
    const { time, scenario } = await mountShowcase();
    const slider = await screen.findByRole('slider', { name: /mission time/i });
    expect(slider).toHaveAttribute('aria-valuetext', 'Day 149, 08:00');
    expect(slider).toHaveAttribute('aria-valuemin', String(scenario.playback.startT));
    expect(slider).toHaveAttribute('aria-valuemax', String(scenario.playback.endT));
    expect(time()).toHaveTextContent('Day 149, 08:00');
    expect(screen.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('group', { name: 'Speed' })).toBeInTheDocument();
  });

  it('plays, pauses and changes speed: the displayed time advances only while playing', async () => {
    const { user, time, run } = await mountShowcase();
    const play = await screen.findByRole('button', { name: 'Play' });
    await user.click(screen.getByRole('button', { name: '10 min/s' }));
    expect(screen.getByRole('button', { name: '10 min/s' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(play);
    expect(play).toHaveAttribute('aria-pressed', 'true');
    await run(6_000); // 6 s at 10 min/s = 60 min: 08:00 -> 09:00
    expect(time()).toHaveTextContent('Day 149, 09:00');
    await user.click(play);
    expect(play).toHaveAttribute('aria-pressed', 'false');
    await run(3_000);
    expect(time()).toHaveTextContent('Day 149, 09:00');
  });

  it('steps by reading and by an hour, seeks with the slider keys, and restarts', async () => {
    const { user, time, scenario } = await mountShowcase();
    await screen.findByRole('slider', { name: /mission time/i });
    const next = scenario.playback.readingTimes.find((t) => t > day(149, 8))!;
    await user.click(screen.getByRole('button', { name: 'Next reading' }));
    expect(time()).toHaveTextContent(missionTimeLabel(next));
    await user.click(screen.getByRole('button', { name: 'Back 1 hour' }));
    expect(time()).toHaveTextContent(missionTimeLabel(next - 60));
    await user.click(screen.getByRole('button', { name: 'Forward 1 hour' }));
    await user.click(screen.getByRole('button', { name: 'Forward 1 hour' }));
    expect(time()).toHaveTextContent(missionTimeLabel(next + 60));
    await user.click(screen.getByRole('button', { name: 'Restart' }));
    expect(time()).toHaveTextContent('Day 149, 08:00');
  });

  it('answers the keyboard: Space, arrows, Shift+arrows, Home and End', async () => {
    const { user, time, run } = await mountShowcase();
    await screen.findByRole('slider', { name: /mission time/i });
    await user.keyboard('{End}');
    expect(time()).toHaveTextContent('Day 169, 23:59');
    await user.keyboard('{Home}');
    expect(time()).toHaveTextContent('Day 149, 00:00');
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(time()).toHaveTextContent('Day 150, 00:00');
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}');
    expect(time()).toHaveTextContent('Day 149, 00:00');
    await user.keyboard('{ArrowRight}');
    expect(time()).not.toHaveTextContent('Day 149, 00:00');
    await user.keyboard('{ArrowLeft}');
    expect(time()).toHaveTextContent('Day 149, 00:00');
    await user.keyboard(' ');
    expect(screen.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-pressed', 'true');
    await run(2_000);
    await user.keyboard(' ');
    expect(screen.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('leaves the keys alone while typing in an input or a select', async () => {
    const { user, time } = await mountShowcase();
    await screen.findByRole('slider', { name: /mission time/i });
    const field = document.createElement('input');
    document.body.appendChild(field);
    await user.click(field);
    await user.keyboard('{Home}{End} ');
    expect(time()).toHaveTextContent('Day 149, 08:00');
    expect(screen.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-pressed', 'false');
    field.remove();
  });

  it('shows the scripted events only when "Show script" is on', async () => {
    const { user, scenario } = await mountShowcase();
    await screen.findByRole('slider', { name: /mission time/i });
    expect(screen.queryByRole('button', { name: /^scripted event:/i })).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: /show script/i }));
    const markers = screen.getAllByRole('button', { name: /^scripted event:/i });
    expect(markers).toHaveLength(scenario.playback.events.length);
    expect(markers[0]).toHaveAccessibleName(/scripted event: cabin heat, whole crew/i);
    await user.click(markers[1]!);
    expect(screen.getByTestId('mission-time')).toHaveTextContent(missionTimeLabel(scenario.playback.events[1]!.startT));
    expect(screen.getByText(/^Scripted event: Fever, one crew member/)).toBeInTheDocument();
  });

  it('keeps room for the bar below the content', async () => {
    await mountShowcase();
    await screen.findByRole('region', { name: /mission playback/i });
    expect(document.querySelector('.app')).toHaveClass('app--playback');
  });
});

describe('the app follows the playback', () => {
  it('updates the Cabin now tile and the attention list at known times, without a loading state in between', async () => {
    const { user, seek } = await mountShowcase();
    await user.click(await screen.findByRole('button', { name: /^cabin & crew$/i }));
    const region = within(await screen.findByRole('region', { name: /^cabin & crew analysis$/i }));
    const row = within(await region.findByRole('region', { name: /^key indicators$/i }));
    const cabinNow = () => within(row.getByRole('group', { name: /^cabin now$/i }));

    await seek(day(163, 5)); // the CO2 excursion is on
    expect(await cabinNow().findByText('Caution')).toBeInTheDocument();
    expect(cabinNow().queryByText('Within NASA limits')).toBeNull();
    expect(cabinNow().getByText(/CO2/)).toBeInTheDocument();

    await seek(day(165, 12)); // a normal day
    expect(await cabinNow().findByText('Within NASA limits')).toBeInTheDocument();
    expect(screen.queryByText(/loading cabin and crew analysis/i)).toBeNull();

    await seek(day(153, 5)); // the heat event
    expect(await cabinNow().findByText('Caution')).toBeInTheDocument();
    expect(cabinNow().getByText(/Cabin temperature/i)).toBeInTheDocument();
    expect(screen.queryByText(/loading cabin and crew analysis/i)).toBeNull();
  });

  it('keeps the previous view on screen while the next one is computed', async () => {
    const { user, seek } = await mountShowcase();
    await user.click(await screen.findByRole('button', { name: /^cabin & crew$/i }));
    await screen.findByRole('region', { name: /^key indicators$/i });
    let sawLoading = false;
    const observer = new MutationObserver(() => {
      if (screen.queryByText(/loading cabin and crew analysis/i) || !screen.queryByRole('region', { name: /^key indicators$/i })) sawLoading = true;
    });
    observer.observe(document.body, { childList: true, subtree: true });
    for (const t of [day(152, 7), day(157, 7), day(162, 7), day(168, 7)]) await seek(t);
    observer.disconnect();
    expect(sawLoading).toBe(false);
  });

  it('updates the crew overview of the CMO dashboard as time passes', async () => {
    const { seek } = await mountShowcase();
    await seek(day(150, 12));
    await screen.findByRole('heading', { name: /crew/i, level: 2 });
    const before = document.body.textContent;
    await seek(day(163, 12));
    expect(document.body.textContent).not.toBe(before);
  });

  it('updates the astronaut body view from the same playback', async () => {
    const { seek, store } = await mountShowcase('astronaut');
    await screen.findByRole('region', { name: /mission playback/i });
    await seek(day(157, 12));
    const withReading = store.getState().session!.synthetic.length;
    await seek(day(150, 12));
    expect(store.getState().session!.synthetic.length).toBeLessThan(withReading);
  });
});

describe('hiding the player', () => {
  beforeEach(() => {
    localStorage.clear();
    setPlayerHidden(false);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    setPlayerHidden(false);
  });

  const hideIt = async (user: Awaited<ReturnType<typeof mountShowcase>>['user']) =>
    user.click(await screen.findByRole('button', { name: 'Hide player' }));

  it('replaces the bar with a pill that shows the time, and frees the reserved space', async () => {
    const { user, playback } = await mountShowcase();
    expect(document.querySelector('.app')).toHaveClass('app--playback');
    await hideIt(user);
    expect(screen.queryByRole('region', { name: /^mission playback$/i })).toBeNull();
    expect(screen.queryByRole('slider', { name: /mission time/i })).toBeNull();
    expect(document.querySelector('.app')).not.toHaveClass('app--playback');
    expect(document.documentElement.style.getPropertyValue('--playback-h')).toBe('');
    expect(screen.getByTestId('mission-time')).toHaveTextContent(missionTimeLabel(playback.store.getState().t));
    await user.click(screen.getByRole('button', { name: 'Show player' }));
    expect(screen.getByRole('region', { name: /^mission playback$/i })).toBeInTheDocument();
    expect(document.querySelector('.app')).toHaveClass('app--playback');
  });

  it('keeps playing while hidden, and the pill time keeps updating', async () => {
    const { user, run, time } = await mountShowcase();
    await user.click(screen.getByRole('button', { name: '10 min/s' }));
    await user.click(screen.getByRole('button', { name: 'Play' }));
    await hideIt(user);
    await run(6_000);
    expect(time()).toHaveTextContent('Day 149, 09:00');
    await user.click(screen.getByRole('button', { name: 'Show player' }));
    expect(screen.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the keyboard shortcuts working while hidden', async () => {
    const { user, playback, time } = await mountShowcase();
    await hideIt(user);
    (document.activeElement as HTMLElement).blur(); // focus sits on Show player, where Space would press that button
    await user.keyboard(' ');
    expect(playback.store.getState().playing).toBe(true);
    await user.keyboard(' ');
    expect(playback.store.getState().playing).toBe(false);
    await user.keyboard('{End}');
    expect(time()).toHaveTextContent('Day 169, 23:59');
  });

  it('moves focus to Show player after hiding and to Hide player after showing', async () => {
    const { user } = await mountShowcase();
    await hideIt(user);
    expect(screen.getByRole('button', { name: 'Show player' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Show player' }));
    expect(screen.getByRole('button', { name: 'Hide player' })).toHaveFocus();
  });

  it('remembers the choice per browser, and a failing storage does not break it', async () => {
    const first = await mountShowcase();
    await hideIt(first.user);
    expect(localStorage.getItem(PLAYER_HIDDEN_KEY)).toBe('1');
    first.unmount();
    await mountShowcase(); // a reload or a scenario switch
    expect(await screen.findByRole('button', { name: 'Show player' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /^mission playback$/i })).toBeNull();
  });

  it('works when localStorage throws on every read and write', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { user } = await mountShowcase();
    expect(await screen.findByRole('button', { name: 'Hide player' })).toBeInTheDocument(); // default shown
    await hideIt(user);
    expect(screen.getByRole('button', { name: 'Show player' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show player' }));
    expect(screen.getByRole('button', { name: 'Hide player' })).toBeInTheDocument();
  });

  it('shows neither bar nor pill without a scenario', async () => {
    await mountApp('demo', { role: 'cmo' });
    await screen.findByRole('navigation', { name: /views/i });
    expect(screen.queryByRole('button', { name: 'Hide player' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show player' })).toBeNull();
  });
});

describe('exiting the playback', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setPlayerHidden(false);
  });
  afterEach(() => {
    setExitNavigator(null);
    localStorage.clear();
    sessionStorage.clear();
    setPlayerHidden(false);
  });

  it.each(['bar', 'pill'])('leaves the scenario from the %s: stops the timer and loads the default demo URL', async (where) => {
    const urls: string[] = [];
    setExitNavigator((u) => urls.push(u));
    const { user, playback, fake, run } = await mountShowcase();
    await user.click(screen.getByRole('button', { name: '10 min/s' }));
    await user.click(screen.getByRole('button', { name: 'Play' }));
    if (where === 'pill') await user.click(screen.getByRole('button', { name: 'Hide player' }));
    await run(1_000);
    await user.click(screen.getByRole('button', { name: 'Exit playback' }));
    expect(urls).toEqual([DEFAULT_DEMO_URL]);
    expect(DEFAULT_DEMO_URL).toBe('?mode=demo'); // no scenario or seed parameters left behind
    expect(playback.store.getState().playing).toBe(false);
    const at = playback.store.getState().t;
    await run(3_000);
    expect(playback.store.getState().t).toBe(at); // no timer keeps running
    expect(fake.now()).toBeGreaterThan(0);
    // exiting does not change the hidden/shown preference
    expect(localStorage.getItem(PLAYER_HIDDEN_KEY)).toBe(where === 'pill' ? '1' : '0');
  });

  it('the default demo has no scenario notice, bar or pill, and focus goes to the main content after the exit reload', async () => {
    sessionStorage.setItem(EXITED_FLAG, '1');
    const plain = await mountApp('demo', { role: 'cmo' });
    await screen.findByRole('navigation', { name: /views/i });
    expect(sessionStorage.getItem(EXITED_FLAG)).toBeNull();
    expect(document.getElementById('main')).toHaveFocus();
    await plain.user.click(await screen.findByRole('button', { name: /^cabin & crew$/i }));
    await screen.findByRole('region', { name: /^key indicators$/i });
    expect(screen.queryByText(/^Scenario:/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Exit playback' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show player' })).toBeNull();
  });

  it('a scenario runs on in-memory stores, so exiting leaves the persisted default demo data alone', async () => {
    const world = createTestWorld();
    const scenario = loadDemoScenario(SHOWCASE_ID)!;
    // No injected `open`: this is the production path (Dexie for the default demo, memory for a scenario).
    const bare = { ...world.options };
    delete bare.open;
    const adapters = await composeAdapters('demo', testProfile('cmo'), { ...bare, scenario });
    expect(adapters.deps.store.persistent).toBe(false);
  });

  it('is not offered in LIVE', async () => {
    await mountApp('live', { role: 'cmo' });
    await screen.findByRole('navigation', { name: /views/i });
    expect(screen.queryByRole('button', { name: 'Exit playback' })).toBeNull();
  });
});
