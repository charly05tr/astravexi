import { describe, expect, it } from 'vitest';
import { generate } from '../adapters/seeded-history';
import { buildWarningMessages } from '../core/escalation/outbox-message';
import type { Evaluation, Reading, ZoneId } from '../core/health/model';
import { evaluate } from '../core/health/rule-engine/evaluate';
import { knowledge } from '../knowledge';
import { ack, reading } from '../test-support/builders';

/** Demo clock start: day 150, 08:00. */
const ASOF = { day: 150, t: 149 * 1440 + 480 };
const SEED = 20260;
const seeded = generate(SEED, 150);

const run = (extra: Reading[] = [], acks: ReturnType<typeof ack>[] = [], seed: Reading[] = seeded) =>
  evaluate({ readings: [...seed, ...extra], acks }, knowledge, ASOF);
const statuses = (e: Evaluation) =>
  Object.fromEntries(Object.values(e.zones).map((z) => [z.zoneId, z.status])) as Record<ZoneId, string>;
const manual = (id: Parameters<typeof reading>[0], v: number, opts: Parameters<typeof reading>[3] = {}) =>
  reading(id, v, 150, { minute: 480, ...opts });

describe('golden persona at demo day 150', () => {
  it('seed: brain Caution (corroborated), heart Notice, immune and metabolism none, eyes and bone unmonitored', () => {
    expect(statuses(run())).toEqual({
      brain: 'caution',
      heart: 'notice',
      immune: 'none',
      metabolism: 'none',
      eyes: 'unmonitored',
      bone: 'unmonitored',
    });
    const brain = run().zones.brain;
    expect(brain.corroborated).toBe(true);
    const rules = brain.findings.map((f) => f.ruleId);
    expect(rules).toContain('sleep-mean-low');
    expect(rules).toContain('mood-mean-above-baseline');
    expect(rules).not.toContain('sleep-short-run');
  });

  it('seed: the rising PHQ-2 and the HR drift both fire against drift-free lagged baselines', () => {
    const e = run();
    expect(e.zones.heart.findings.map((f) => f.ruleId)).toEqual(['hr-above-baseline']);
    const hr = e.zones.heart.findings[0]!;
    expect(hr.baseline?.median).toBeLessThanOrEqual(630);
    expect(hr.persistence!.hits).toBeGreaterThanOrEqual(3);
    expect(e.zones.brain.findings.every((f) => f.source === 'SYNTHETIC')).toBe(true);
    expect(e.audiences).toEqual(expect.arrayContaining(['astronaut', 'cmo']));
    expect(e.audiences).not.toContain('flightSurgeon');
  });

  it('seed: the same seed gives the same tiers', () => {
    expect(run()).toEqual(run([], [], generate(SEED, 150)));
  });

  it('resting 38.1 C stays Information (shift explained), not fever', () => {
    const e = run([manual('temperature', 38.1)]);
    expect(e.zones.immune.status).toBe('information');
    expect(e.zones.immune.findings[0]!.shiftExplained).toBe(true);
    expect(e.zones.immune.findings[0]!.source).toBe('MANUAL');
  });

  it('38.4 C at rest is Notice', () => {
    expect(run([manual('temperature', 38.4)]).zones.immune.status).toBe('notice');
  });

  it('BP 185/125 gives Warning and exactly one outbox message; re-evaluating adds none', () => {
    const rs = [manual('bpSystolic', 185, { groupId: 'checkin-1' }), manual('bpDiastolic', 125, { groupId: 'checkin-1' })];
    const e = run(rs);
    expect(e.zones.heart.status).toBe('warning');
    const link = { oneWayDelayMin: 12, blackout: false };
    const opts = {
      profileId: 'p-demo',
      now: ASOF.t,
      link,
      newId: () => crypto.randomUUID(),
      updatedAt: '2026-06-01T00:00:00.000Z',
    };
    const first = buildWarningMessages(e, knowledge.indicators, [], opts);
    expect(first).toHaveLength(1);
    expect(first[0]!.payload.source).toBe('MANUAL');
    expect(buildWarningMessages(run(rs), knowledge.indicators, first, opts)).toHaveLength(0);
  });

  it('a normal 130/80 re-measure keeps heart Warning (latched) until the CMO acknowledges', () => {
    const rs = [
      manual('bpSystolic', 185, { groupId: 'checkin-1', minute: 470 }),
      manual('bpDiastolic', 125, { groupId: 'checkin-1', minute: 470 }),
      reading('bpSystolic', 130, 150, { minute: 478, groupId: 'checkin-2' }),
      reading('bpDiastolic', 80, 150, { minute: 478, groupId: 'checkin-2' }),
    ];
    const e = run(rs);
    expect(e.zones.heart.status).toBe('warning');
    expect(e.zones.heart.findings.find((f) => f.ruleId === 'bp-crisis-systolic')!.latestObserved).toBe(1300);
    const acked = run(rs, [ack('heart', 'checkin-1')]);
    expect(acked.zones.heart.status).toBe('notice'); // back to its data-derived status
  });

  it('40.5 C after exercise is not a Warning', () => {
    const e = run([manual('temperature', 40.5, { context: 'exercise' })]);
    expect(e.zones.immune.status).toBe('none');
  });

  it('a MANUAL HR reading wins the day-150 daily value but the SYNTHETIC reading stays listed', () => {
    const e = run([manual('heartRate', 90)]);
    expect(e.zones.heart.findings[0]!.ruleId).toBe('hr-above-baseline');
    const listed = [...seeded, manual('heartRate', 90)].filter((r) => r.indicatorId === 'heartRate' && r.day === 150);
    expect(listed.map((r) => r.source).sort()).toEqual(['MANUAL', 'SYNTHETIC']);
  });

  it('advance one day: identical day-151 statuses across runs, MANUAL entries kept', () => {
    const day151 = (seedReadings: Reading[]) =>
      evaluate(
        { readings: [...seedReadings, manual('glucose', 92)], acks: [] },
        knowledge,
        { day: 151, t: 150 * 1440 + 480 },
      );
    const a = day151(generate(SEED, 151));
    const b = day151(generate(SEED, 151));
    expect(statuses(a)).toEqual(statuses(b));
    expect(a).toEqual(b);
    expect(a.zones.brain.status).toBe('caution');
  });
});
