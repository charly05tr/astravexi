import { describe, expect, it } from 'vitest';
import { DEMO_CLOCK_START, DemoClock, dayStartMinute } from './demo-clock';
import { WallClock, defaultMissionConfig, localDateString } from './wall-clock';

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();

describe('WallClock', () => {
  const config = { launchDate: '2026-06-01', transitDays: 210, destination: 'Mars' };

  it('launch day is Day 1; ten days later is Day 11 (local calendar-date difference)', () => {
    expect(new WallClock(config, () => at(2026, 6, 1, 9)).today()).toBe(1);
    expect(new WallClock(config, () => at(2026, 6, 11, 9)).today()).toBe(11);
  });

  it('changes day at local midnight, not after 24 hours', () => {
    expect(new WallClock(config, () => at(2026, 6, 1, 23, 59)).today()).toBe(1);
    expect(new WallClock(config, () => at(2026, 6, 2, 0, 0)).today()).toBe(2);
  });

  it('clamps to Day 1 when the launch date is in the future', () => {
    expect(new WallClock(config, () => at(2026, 5, 20, 12)).today()).toBe(1);
  });

  it('now() lies inside today(): minutes since launch, counted from local midnight of the day', () => {
    const clock = new WallClock(config, () => at(2026, 6, 3, 8, 30));
    expect(clock.today()).toBe(3);
    expect(clock.now()).toBe(2 * 1440 + 8 * 60 + 30);
  });

  it('default mission config launches today with 210 days to Mars', () => {
    const ms = at(2026, 6, 15, 7);
    expect(defaultMissionConfig(ms)).toEqual({ launchDate: localDateString(ms), transitDays: 210, destination: 'Mars' });
    expect(new WallClock(defaultMissionConfig(ms), () => ms).today()).toBe(1);
  });

  it('follows a new config', () => {
    const clock = new WallClock(config, () => at(2026, 6, 11, 9));
    clock.configure({ ...config, launchDate: '2026-06-10' });
    expect(clock.today()).toBe(2);
  });
});

describe('DemoClock', () => {
  it('starts at day 150, 08:00', () => {
    const clock = new DemoClock(undefined, () => 0);
    expect(clock.today()).toBe(150);
    expect(clock.now()).toBe(149 * 1440 + 480);
  });

  it('link time runs at 1 real second = 1 mission minute', () => {
    let ms = 1_000;
    const clock = new DemoClock(undefined, () => ms);
    ms += 24_000;
    expect(clock.now()).toBe(DEMO_CLOCK_START.minute + 24); // a 12-min trip replies after 24 s
    ms += 999;
    expect(clock.now()).toBe(DEMO_CLOCK_START.minute + 24); // whole seconds only
  });

  it('the frozen day never crosses midnight, however long the tab stays open', () => {
    let ms = 0;
    const clock = new DemoClock(undefined, () => ms);
    ms += 3 * 24 * 3600 * 1000; // three real days: link minutes pass many midnights
    expect(clock.today()).toBe(150);
    expect(clock.now()).toBeGreaterThan(150 * 1440);
  });

  it('re-anchors on hydrate: no time passes while the tab is closed', () => {
    let ms = 0;
    const first = new DemoClock(undefined, () => ms);
    ms += 90_000;
    const saved = first.position(); // persisted at close
    ms += 6 * 3600 * 1000; // tab closed for six hours
    const reopened = new DemoClock(saved, () => ms);
    expect(reopened.now()).toBe(saved.minute);
    expect(reopened.today()).toBe(150);
    ms += 5_000;
    expect(reopened.now()).toBe(saved.minute + 5);
  });

  it('advanceDay moves only the day and never moves link time backwards', () => {
    let ms = 0;
    const clock = new DemoClock(undefined, () => ms);
    ms += 30_000;
    const before = clock.now();
    clock.advanceDay();
    expect(clock.today()).toBe(151);
    expect(clock.now()).toBe(Math.max(before, dayStartMinute(151)));
    expect(clock.now()).toBeGreaterThanOrEqual(before);
  });

  it('advanceDay keeps the link time when it is already past the new day start', () => {
    const clock = new DemoClock({ day: 150, minute: 151 * 1440 }, () => 0);
    clock.advanceDay();
    expect(clock.now()).toBe(151 * 1440);
  });

  it('reset returns to day 150, 08:00', () => {
    let ms = 0;
    const clock = new DemoClock(undefined, () => ms);
    clock.advanceDay();
    ms += 50_000;
    clock.reset();
    expect(clock.position()).toEqual(DEMO_CLOCK_START);
  });
});
