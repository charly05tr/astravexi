import { describe, expect, it } from 'vitest';
import type { Reading } from '../../core/health/model';
import { evaluate } from '../../core/health/rule-engine/evaluate';
import type { CrewMember } from '../../core/use-cases/crew';
import { DEMO_DAY, generate } from '../../adapters/seeded-history';
import { knowledge } from '../../knowledge';
import { endOfDay, reading, steady } from '../../test-support/builders';
import { buildCrewDetail, buildCrewOverview, worstStatus } from './crew-model';

const DAY = 20;
const label = (t: string) => t[0]!.toUpperCase() + t.slice(1);

function member(name: string, readings: Reading[], day = DAY, role: CrewMember['role'] = 'astronaut'): CrewMember {
  return {
    profileId: `id-${name}`,
    name,
    role,
    readings,
    acks: [],
    evaluation: evaluate({ readings, acks: [] }, knowledge, endOfDay(day)),
    lastReadingT: readings.length ? Math.max(...readings.map((r) => r.t)) : null,
  };
}

const quiet = (name: string) => member(name, [...steady('heartRate', 62, 1, DAY), ...steady('temperature', 37.7, 1, DAY)]);
const warning = (name: string) =>
  member(name, [reading('bpSystolic', 185, DAY, { groupId: 'g' }), reading('bpDiastolic', 125, DAY, { groupId: 'g' })]);
/** One finding at Caution: glucose 200 or above. */
const oneCaution = (name: string) => member(name, [reading('glucose', 200, DAY)]);
/** Two findings at Caution: high glucose and a symptomatic fever. */
const twoCautions = (name: string) =>
  member(name, [reading('glucose', 200, DAY), reading('temperature', 38.2, DAY, { symptomatic: true })]);
/** The demo persona on day 150: mood, sleep and heart rate drift, and the brain is raised to Caution. */
const drifting = (name: string) => member(name, generate(20260, DEMO_DAY), DEMO_DAY);

describe('worstStatus', () => {
  it('ranks Warning above Caution above everything else', () => {
    expect(worstStatus(['none', 'caution', 'warning', 'notice'])).toBe('warning');
    expect(worstStatus(['none', 'noData', 'caution'])).toBe('caution');
  });

  it('prefers No data over Not monitored, and has a floor for an empty list', () => {
    expect(worstStatus(['unmonitored', 'noData', 'unmonitored'])).toBe('noData');
    expect(worstStatus([])).toBe('unmonitored');
  });
});

describe('crew overview', () => {
  it('sorts the worst status first, then by concerns, then by name', () => {
    const cards = buildCrewOverview(
      [quiet('Zed'), oneCaution('Bo'), warning('Cy'), oneCaution('Al'), member('Di', [])],
      knowledge,
      label,
    );
    expect(cards.map((c) => c.name)).toEqual(['Cy', 'Al', 'Bo', 'Zed', 'Di']);
    expect(cards[0]!.status).toBe('warning');
    expect(cards[1]!.status).toBe('caution');
    expect(cards[4]!.status).toBe('noData');
  });

  it('puts the member with more Caution-and-above findings first among equal statuses', () => {
    const cards = buildCrewOverview([oneCaution('Aa'), twoCautions('Bb')], knowledge, label);
    expect(cards.map((c) => [c.name, c.status, c.concernCount])).toEqual([
      ['Bb', 'caution', 2],
      ['Aa', 'caution', 1],
    ]);
  });

  it('counts only Caution and above, names at most two findings, the most severe first', () => {
    const [card] = buildCrewOverview([warning('Cy')], knowledge, label);
    expect(card!.concernCount).toBe(card!.topFindings.length);
    expect(card!.topFindings.length).toBeLessThanOrEqual(2);
    expect(card!.topFindings[0]).toMatchObject({ tier: 'warning' });
    const [calm] = buildCrewOverview([quiet('Zed')], knowledge, label);
    expect(calm).toMatchObject({ concernCount: 0, topFindings: [], status: 'none' });
  });

  it('shows a zone raised to Caution by corroboration, with no value and no mood score', () => {
    const [card] = buildCrewOverview([drifting('Bo')], knowledge, label);
    expect(card).toMatchObject({ status: 'caution', concernCount: 1 });
    expect(card!.topFindings).toEqual([{ key: 'corroboration:brain', indicatorLabel: 'Brain (corroborated)', tier: 'caution' }]);
    expect(JSON.stringify(card)).not.toMatch(/phq|points/i);
  });

  it('never puts a value on a card, even for a shareable indicator', () => {
    const [card] = buildCrewOverview([twoCautions('Bb')], knowledge, label);
    expect(card!.topFindings.every((f) => Object.keys(f).sort().join() === 'indicatorLabel,key,tier')).toBe(true);
  });

  it('reads the last check-in as mission time, or says there is none', () => {
    const [card, none] = buildCrewOverview([warning('Cy'), member('Di', [])], knowledge, label);
    expect(card!.lastCheckInText).toMatch(/^Day 20, \d\d:\d\d$/);
    expect(none!.lastCheckInText).toBe('No check-in yet');
  });

  it('is empty for an empty crew', () => {
    expect(buildCrewOverview([], knowledge, label)).toEqual([]);
  });
});

describe('crew member detail', () => {
  it('lists every zone with its status', () => {
    const detail = buildCrewDetail(warning('Cy'), knowledge, label);
    expect(detail.zones.map((z) => z.zoneId)).toEqual(knowledge.zones.map((z) => z.id));
    expect(detail.zones.find((z) => z.zoneId === 'heart')!.status).toBe('warning');
    expect(detail.zones.find((z) => z.zoneId === 'eyes')!.status).toBe('unmonitored');
  });

  it('shows mood as a tier only, in the items and in the trends', () => {
    const detail = buildCrewDetail(drifting('Bo'), knowledge, label);
    const mood = detail.cmoZones.flatMap((z) => z.items).filter((i) => i.indicatorLabel.startsWith('Mood'));
    expect(mood.length).toBeGreaterThan(0);
    for (const item of mood) {
      expect(item.valueText).toBeNull();
      expect(item.tierOnlyText).toBe('Mood: Notice');
    }
    expect(detail.trends.map((t) => t.id)).toContain('heartRate');
    expect(JSON.stringify(detail.cmoZones)).not.toMatch(/points/i);
    expect(detail.trends.map((t) => t.id)).not.toContain('phq2');
  });

  it('keeps the shareable value of a non-mood finding', () => {
    const detail = buildCrewDetail(warning('Cy'), knowledge, label);
    const items = detail.cmoZones.flatMap((z) => z.items);
    expect(items.some((i) => i.valueText !== null)).toBe(true);
  });

  it('has no trend for an indicator without readings', () => {
    const detail = buildCrewDetail(member('Di', []), knowledge, label);
    expect(detail.trends).toEqual([]);
  });
});
