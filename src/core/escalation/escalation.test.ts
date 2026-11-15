import { describe, expect, it } from 'vitest';
import { knowledge } from '../../knowledge';
import { endOfDay, reading, steady } from '../../test-support/builders';
import type { Evaluation, OutboxMessage, Reading } from '../health/model';
import { evaluate } from '../health/rule-engine/evaluate';
import { advance, earliestReplyOffsetMin, replyEstimate, sendNow } from './link';
import type { LinkState } from './link';
import { buildWarningMessages } from './outbox-message';
import { project } from './privacy';
import { crossesEarthLink, routeTier } from './routing';

const OPEN: LinkState = { oneWayDelayMin: 12, blackout: false };
const DOWN: LinkState = { oneWayDelayMin: 12, blackout: true };

function run(readings: Reading[], day = 20): Evaluation {
  return evaluate({ readings, acks: [] }, knowledge, endOfDay(day));
}
const crisis = (groupId = 'g1') => [
  reading('bpSystolic', 185, 20, { groupId }),
  reading('bpDiastolic', 125, 20, { groupId }),
];
/** Ids msg-1, msg-2, ... per emit call, so a test can name the message it just built. */
const counter = () => {
  let n = 0;
  return () => `msg-${(n += 1)}`;
};
function emit(e: Evaluation, link = OPEN, existing: OutboxMessage[] = []) {
  return buildWarningMessages(e, knowledge.indicators, existing, {
    profileId: 'p-1',
    now: 100,
    link,
    newId: counter(),
    updatedAt: '2026-06-01T00:00:00.000Z',
  });
}

describe('routing', () => {
  it('routes by tier and only Warning crosses the Earth link', () => {
    expect(routeTier('notice')).toEqual(['astronaut']);
    expect(routeTier('caution')).toEqual(['astronaut', 'cmo']);
    expect(routeTier('warning')).toEqual(['cmo', 'flightSurgeon']);
    expect(crossesEarthLink('caution')).toBe(false);
    expect(crossesEarthLink('warning')).toBe(true);
  });
});

describe('outbox aggregation', () => {
  it('BP 185/125 trips two rules and yields exactly ONE message', () => {
    const e = run(crisis());
    expect(e.zones.heart.findings).toHaveLength(2);
    const msgs = emit(e);
    expect(msgs).toHaveLength(1);
    const m = msgs[0]!;
    expect(m.dedupeKey).toBe('heart:g1');
    expect(m.state).toBe('queued');
    expect(m.payload.trigger.map((t) => t.ruleId).sort()).toEqual(['bp-crisis-diastolic', 'bp-crisis-systolic']);
    expect(m.payload.source).toBe('MANUAL');
    expect(m.payload.trigger.every((t) => t.source === 'MANUAL')).toBe(true);
    expect(m.payload.trigger.find((t) => t.ruleId === 'bp-crisis-systolic')?.value).toBe(185);
  });

  it('is idempotent: re-evaluation never creates a duplicate', () => {
    const e = run(crisis());
    const first = emit(e);
    expect(emit(e, OPEN, first)).toEqual([]);
  });

  it('one message per (zone, group): a second check-in group gets its own message', () => {
    const e = run([...crisis('g1'), reading('bpSystolic', 190, 20, { groupId: 'g2', minute: 900 })]);
    expect(emit(e).map((m) => m.dedupeKey).sort()).toEqual(['heart:g1', 'heart:g2']);
  });

  it('a Warning in two zones from one group gives one message per zone', () => {
    const e = run([...crisis('g1'), reading('glucose', 50, 20, { groupId: 'g1' })]);
    expect(emit(e).map((m) => m.dedupeKey).sort()).toEqual(['heart:g1', 'metabolism:g1']);
  });

  it('a Caution never enters the Earth queue', () => {
    const e = run([reading('glucose', 60, 20)]);
    expect(e.zones.metabolism.status).toBe('caution');
    expect(emit(e)).toEqual([]);
  });

  it('a new Warning during a blackout starts held', () => {
    expect(emit(run(crisis()), DOWN)[0]!.state).toBe('held');
  });

  it('the payload carries zone tiers and never a mood value', () => {
    const e = run([...crisis(), reading('phq2', 3, 20, { groupId: 'g1' })]);
    const m = emit(e)[0]!;
    expect(m.payload.zoneTiers.brain).toBe('notice');
    expect(JSON.stringify(m.payload)).not.toContain('phq2');
  });
});

describe('link state machine', () => {
  const queued = (): OutboxMessage => emit(run(crisis()))[0]!;

  it('shows earliest reply T+2xD while queued and tracks a delay change', () => {
    const m = queued();
    expect(earliestReplyOffsetMin(12)).toBe(24);
    expect(replyEstimate(m, { ...OPEN, oneWayDelayMin: 12 })).toEqual({ kind: 'estimate', offsetMin: 24 });
    expect(replyEstimate(m, { ...OPEN, oneWayDelayMin: 20 })).toEqual({ kind: 'estimate', offsetMin: 40 });
    expect(replyEstimate(m, { ...OPEN, oneWayDelayMin: 0 })).toEqual({ kind: 'estimate', offsetMin: 0 });
  });

  it('S-6.2: delay is read at send, then frozen', () => {
    const sent = sendNow([queued()], 'msg-1', { ...OPEN, oneWayDelayMin: 20 }, 200);
    const m = sent[0]!;
    expect(m.state).toBe('sent');
    expect(m.oneWayDelayMin).toBe(20);
    expect(m.sentAt).toBe(200);
    expect(m.replyPossibleAt).toBe(240);
    // a later delay change does not touch the sent message
    const later = advance(sent, { ...OPEN, oneWayDelayMin: 5 }, 210);
    expect(later).toBe(sent);
    expect(replyEstimate(later[0]!, OPEN)).toEqual({ kind: 'fixed', replyPossibleAt: 240, sentAt: 200 });
  });

  it('sent becomes replyPossible once now reaches sentAt + 2D', () => {
    const sent = sendNow([queued()], 'msg-1', OPEN, 200);
    expect(advance(sent, OPEN, 223)[0]!.state).toBe('sent');
    expect(advance(sent, OPEN, 224)[0]!.state).toBe('replyPossible');
  });

  it('delay 0: reads T+0 and becomes replyPossible on the NEXT tick', () => {
    const link = { oneWayDelayMin: 0, blackout: false };
    const sent = sendNow([queued()], 'msg-1', link, 300);
    expect(sent[0]!.state).toBe('sent');
    expect(sent[0]!.replyPossibleAt).toBe(300);
    expect(advance(sent, link, 300)[0]!.state).toBe('replyPossible');
  });

  it('blackout moves queued to held, disables sending and shows no reply time', () => {
    const held = advance([queued()], DOWN, 150);
    expect(held[0]!.state).toBe('held');
    expect(replyEstimate(held[0]!, DOWN)).toEqual({ kind: 'none' });
    expect(sendNow(held, 'msg-1', DOWN, 150)).toBe(held);
  });

  it('blackout off sends held messages at that moment, with the delay at that moment', () => {
    const held = advance([queued()], DOWN, 150);
    const sent = advance(held, { oneWayDelayMin: 8, blackout: false }, 400);
    expect(sent[0]!.state).toBe('sent');
    expect(sent[0]!.sentAt).toBe(400);
    expect(sent[0]!.oneWayDelayMin).toBe(8);
    expect(sent[0]!.replyPossibleAt).toBe(416);
  });

  it('a blackout never recalls a sent message', () => {
    const sent = sendNow([queued()], 'msg-1', OPEN, 200);
    expect(advance(sent, DOWN, 205)).toBe(sent);
  });

  it('returns the same array reference when nothing changed', () => {
    const msgs = [queued()];
    expect(advance(msgs, OPEN, 150)).toBe(msgs);
  });

  it('an explicit send is required: a queued message does not auto-send', () => {
    const msgs = [queued()];
    expect(advance(msgs, OPEN, 10_000)[0]!.state).toBe('queued');
  });
});

describe('privacy projection', () => {
  const rs = [
    ...steady('sleepHours', 6.5, 1, 33),
    ...steady('sleepHours', 5.5, 34, 40),
    ...steady('phq2', 1, 1, 33),
    ...steady('phq2', 2, 34, 40),
  ];
  const e = run(rs, 40);

  it('hides mood values from the CMO and the flight surgeon but not from the astronaut', () => {
    const mood = (aud: 'astronaut' | 'cmo' | 'flightSurgeon') =>
      project(e, aud, knowledge.indicators).filter((i) => i.indicatorId === 'phq2');
    expect(project(e, 'astronaut', knowledge.indicators).some((i) => i.indicatorId === 'phq2' && i.value !== undefined)).toBe(true);
    expect(mood('cmo').every((i) => i.value === undefined && i.unit === undefined)).toBe(true);
    expect(mood('flightSurgeon')).toEqual([]);
  });

  it('shows shareable values to the CMO from Caution up', () => {
    const items = project(run(crisis()), 'cmo', knowledge.indicators);
    expect(items.map((i) => i.value).sort()).toEqual([125, 185]);
    expect(items.every((i) => i.source === 'MANUAL')).toBe(true);
  });

  it('keeps the CMO list to Caution and above', () => {
    const items = project(e, 'cmo', knowledge.indicators);
    expect(items.every((i) => i.tier === 'caution' || i.tier === 'warning')).toBe(true);
  });
});
