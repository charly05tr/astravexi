import { describe, expect, it } from 'vitest';
import { loadKnowledge, knowledge } from '../../../knowledge';
import { ack, daily, endOfDay, reading, steady } from '../../../test-support/builders';
import type { Evaluation, Reading, ZoneId } from '../model';
import { evaluate } from './evaluate';

function run(readings: Reading[], day = 20, acks = [] as ReturnType<typeof ack>[]): Evaluation {
  return evaluate({ readings, acks }, knowledge, endOfDay(day));
}
const ids = (e: Evaluation, zone: ZoneId) => e.zones[zone].findings.map((f) => f.ruleId).sort();

/** Stable resting temperature 37.7 on days 1-19; the day-20 reading is the one under test. */
const tempBase = steady('temperature', 37.7, 1, 19);
const hrBase = steady('heartRate', 62, 1, 19);

describe('layer (a) absolute thresholds: boundaries at one stored step either side', () => {
  it.each([
    // [label, readings, zone, expected status, expected rule ids]
    ['temp 40.0 at rest', [reading('temperature', 40.0, 20)], 'immune', 'warning', 'temp-hyperthermia'],
    ['temp 39.9 at rest is not a red flag', [reading('temperature', 39.9, 20)], 'immune', 'notice', 'temp-above-baseline'],
    ['temp 34.9 at rest', [reading('temperature', 34.9, 20)], 'immune', 'warning', 'temp-hypothermia'],
    ['temp 35.0 at rest is not hypothermia', [reading('temperature', 35.0, 20)], 'immune', 'none', undefined],
    ['BP 185/125', [reading('bpSystolic', 185, 20, { groupId: 'a' }), reading('bpDiastolic', 125, 20, { groupId: 'a' })], 'heart', 'warning', 'bp-crisis-systolic'],
    ['BP 181/80 (systolic only)', [reading('bpSystolic', 181, 20), reading('bpDiastolic', 80, 20)], 'heart', 'warning', 'bp-crisis-systolic'],
    ['BP 120/121 (diastolic only)', [reading('bpSystolic', 120, 20), reading('bpDiastolic', 121, 20)], 'heart', 'warning', 'bp-crisis-diastolic'],
    ['BP 180/120 exactly is not a crisis', [reading('bpSystolic', 180, 20), reading('bpDiastolic', 120, 20)], 'heart', 'none', undefined],
    ['glucose 53', [reading('glucose', 53, 20)], 'metabolism', 'warning', 'glucose-hypo-l2'],
    ['glucose 54', [reading('glucose', 54, 20)], 'metabolism', 'caution', 'glucose-low'],
    ['glucose 69', [reading('glucose', 69, 20)], 'metabolism', 'caution', 'glucose-low'],
    ['glucose 70', [reading('glucose', 70, 20)], 'metabolism', 'none', undefined],
    ['glucose 199', [reading('glucose', 199, 20)], 'metabolism', 'none', undefined],
    ['glucose 200', [reading('glucose', 200, 20)], 'metabolism', 'caution', 'glucose-high'],
    ['PHQ-2 latest 3', [reading('phq2', 3, 20)], 'brain', 'notice', 'mood-phq2-positive'],
    ['PHQ-2 latest 2', [reading('phq2', 2, 20)], 'brain', 'none', undefined],
    ['HR 101 with symptoms', [reading('heartRate', 101, 20, { symptomatic: true })], 'heart', 'warning', 'hr-tachy-symptomatic'],
    ['HR 100 with symptoms', [reading('heartRate', 100, 20, { symptomatic: true })], 'heart', 'none', undefined],
    ['HR 49 with symptoms', [reading('heartRate', 49, 20, { symptomatic: true })], 'heart', 'warning', 'hr-brady-symptomatic'],
    ['HR 50 with symptoms', [reading('heartRate', 50, 20, { symptomatic: true })], 'heart', 'none', undefined],
    ['HR 120 without symptoms', [reading('heartRate', 120, 20)], 'heart', 'none', undefined],
  ] as const)('%s', (_label, rs, zone, status, ruleId) => {
    const e = run([...tempBase, ...hrBase, ...rs]);
    expect(e.zones[zone as ZoneId].status).toBe(status);
    if (ruleId) expect(ids(e, zone as ZoneId)).toContain(ruleId);
  });

  it('38.0 with the symptom flag is Caution; 37.9 with the flag is not', () => {
    const hot = run([...tempBase, reading('temperature', 38.0, 20, { symptomatic: true })]);
    expect(hot.zones.immune.status).toBe('caution');
    expect(ids(hot, 'immune')).toContain('temp-fever-symptomatic');
    const cool = run([...tempBase, reading('temperature', 37.9, 20, { symptomatic: true })]);
    expect(cool.zones.immune.status).toBe('none');
  });

  it('38.0 without symptoms and explained by the shift is not Caution', () => {
    const e = run([...tempBase, reading('temperature', 38.0, 20)]);
    expect(e.zones.immune.status).toBe('information');
  });

  it('sleep: 7-day mean 5.9 is Notice, 6.0 is not', () => {
    expect(run(steady('sleepHours', 5.9, 14, 20)).zones.brain.status).toBe('notice');
    expect(run(steady('sleepHours', 6.0, 14, 20)).zones.brain.status).toBe('none');
  });

  it('sleep: three nights at or below 5.0 h is Caution, at 5.1 h it is not', () => {
    const base = steady('sleepHours', 7.0, 14, 17);
    const caution = run([...base, ...steady('sleepHours', 5.0, 18, 20)]);
    expect(ids(caution, 'brain')).toContain('sleep-short-run');
    expect(caution.zones.brain.status).toBe('caution');
    const notCaution = run([...base, ...steady('sleepHours', 5.1, 18, 20)]);
    expect(ids(notCaution, 'brain')).not.toContain('sleep-short-run');
  });

  it('BP stage 2 on 2 consecutive days is Caution, on 1 day it is not', () => {
    const two = run([reading('bpSystolic', 140, 19), reading('bpSystolic', 140, 20)]);
    expect(two.zones.heart.status).toBe('caution');
    const one = run([reading('bpSystolic', 139, 19), reading('bpSystolic', 140, 20)]);
    expect(one.zones.heart.status).toBe('none');
  });

  it('fasting glucose at 100 or more on 3 days needs a rising trend', () => {
    const rising = run(daily('glucose', [100, 101, 103], 18));
    expect(ids(rising, 'metabolism')).toContain('glucose-fasting-rising');
    const flat = run(daily('glucose', [103, 101, 100], 18));
    expect(ids(flat, 'metabolism')).not.toContain('glucose-fasting-rising');
    const low = run(daily('glucose', [99, 101, 103], 18));
    expect(ids(low, 'metabolism')).not.toContain('glucose-fasting-rising');
  });
});

describe('layer (b) in-flight shift on a single reading', () => {
  it('38.1 C at rest against a 37.7 baseline is Information, not fever', () => {
    const e = run([...tempBase, reading('temperature', 38.1, 20)]);
    expect(e.zones.immune.status).toBe('information');
    const f = e.zones.immune.findings[0]!;
    expect(f.ruleId).toBe('temp-shift-explained');
    expect(f.shiftExplained).toBe(true);
  });

  it('+0.4 gives no Notice and +0.5 exactly gives Notice, without floating-point drift', () => {
    expect(run([...tempBase, reading('temperature', 38.1, 20)]).zones.immune.status).toBe('information');
    const notice = run([...tempBase, reading('temperature', 38.2, 20)]);
    expect(notice.zones.immune.status).toBe('notice');
    expect(ids(notice, 'immune')).toEqual(['temp-above-baseline']);
  });

  it('38.4 C (+0.7) is Notice', () => {
    expect(run([...tempBase, reading('temperature', 38.4, 20)]).zones.immune.status).toBe('notice');
  });

  it('a reading below 38.0 and under +0.5 gives no finding', () => {
    expect(run([...tempBase, reading('temperature', 37.9, 20)]).zones.immune.status).toBe('none');
  });

  it('does not move the red-flag threshold: 40.0 stays Warning whatever the baseline', () => {
    const hotBase = steady('temperature', 39.0, 1, 19);
    const e = run([...hotBase, reading('temperature', 40.0, 20)]);
    expect(e.zones.immune.status).toBe('warning');
  });
});

describe('layer (c) lagged baseline and persistence', () => {
  it('detects an HR drift on 4 of the last 5 days against a baseline that excludes them', () => {
    // Days 1-15 steady at 62, days 16-20 = 73 73 62 73 73 (4 hits of 5).
    const readings = [...steady('heartRate', 62, 1, 15), ...daily('heartRate', [73, 73, 62, 73, 73], 16)];
    const e = run(readings);
    const f = e.zones.heart.findings.find((x) => x.ruleId === 'hr-above-baseline');
    expect(f).toBeDefined();
    expect(f?.persistence).toEqual({ hits: 4, ofDays: 5 });
    expect(f?.baseline?.median).toBe(620);
    expect(e.zones.heart.status).toBe('notice');
  });

  it('HR threshold sits at +15%: 72 bpm over a 62 baseline hits, 71 does not', () => {
    const hit = run([...steady('heartRate', 62, 1, 17), ...steady('heartRate', 72, 18, 20)]);
    expect(ids(hit, 'heart')).toContain('hr-above-baseline');
    const miss = run([...steady('heartRate', 62, 1, 17), ...steady('heartRate', 71, 18, 20)]);
    expect(ids(miss, 'heart')).not.toContain('hr-above-baseline');
  });

  it('needs persistence: a single deviating day is not a layer (c) finding', () => {
    const e = run([...steady('heartRate', 62, 1, 19), reading('heartRate', 80, 20)]);
    expect(ids(e, 'heart')).not.toContain('hr-above-baseline');
  });

  it('sustained temperature +1.0 over baseline on 3 of 5 days is Caution (maxTier caution)', () => {
    const e = run([...steady('temperature', 37.7, 1, 15), ...daily('temperature', [38.7, 37.7, 38.7, 37.7, 38.7], 16)]);
    expect(ids(e, 'immune')).toContain('temp-sustained-high');
    expect(e.zones.immune.status).toBe('caution');
  });

  it('the HR drift alone never goes past Notice (no corroboration, no Warning)', () => {
    const e = run([...steady('heartRate', 62, 1, 15), ...steady('heartRate', 90, 16, 20)]);
    expect(e.zones.heart.status).toBe('notice');
    expect(e.highest).toBe('notice');
  });
});

describe('mood (PHQ-2: higher is worse)', () => {
  const cycle = [0, 1, 1, 2, 1, 1, 1]; // baseline mean 1.0, SD about 0.58
  const base = daily('phq2', Array.from({ length: 33 }, (_, i) => cycle[i % cycle.length]!), 1);

  it('fires when the 7-day mean rises', () => {
    const e = run([...base, ...daily('phq2', [2, 2, 2, 3, 3, 3, 3], 34)], 40);
    expect(ids(e, 'brain')).toContain('mood-mean-above-baseline');
  });

  it('does not fire when the mean falls', () => {
    const e = run([...base, ...steady('phq2', 0, 34, 40)], 40);
    expect(ids(e, 'brain')).not.toContain('mood-mean-above-baseline');
  });

  it('needs an absolute rise of 1.0 as well as the floored SD (spread floor 0.5)', () => {
    const flat = steady('phq2', 1, 1, 33);
    const small = run([...flat, ...daily('phq2', [1, 1, 1, 2, 2, 2, 2], 34)], 40);
    expect(ids(small, 'brain')).not.toContain('mood-mean-above-baseline');
    const exact = run([...flat, ...steady('phq2', 2, 34, 40)], 40);
    expect(ids(exact, 'brain')).toContain('mood-mean-above-baseline');
  });

  it('S-3.16: baseline 1.0 with SD under the floor, 7-day mean 2.3 fires and 0.3 does not', () => {
    const flat = steady('phq2', 1, 1, 33);
    // 2.3 is not an integer mean over 7 days; use 5 values summing to 11.5 -> approximated by 2,2,2,3,3,2,2 = 2.29
    const rise = run([...flat, ...daily('phq2', [2, 2, 2, 3, 3, 2, 2], 34)], 40);
    expect(ids(rise, 'brain')).toContain('mood-mean-above-baseline');
    const fall = run([...flat, ...daily('phq2', [0, 0, 1, 0, 0, 0, 0], 34)], 40);
    expect(ids(fall, 'brain')).not.toContain('mood-mean-above-baseline');
  });
});

describe('per-zone corroboration', () => {
  const flat = steady('phq2', 1, 1, 33);

  it('sleep notice alone stays Notice and is not corroborated', () => {
    const e = run([...steady('sleepHours', 6.5, 1, 33), ...steady('sleepHours', 5.5, 34, 40), ...flat], 40);
    // mood is flat here, so only sleep is sustained
    expect(e.zones.brain.status).toBe('notice');
    expect(e.zones.brain.corroborated).toBe(false);
  });

  it('sleep notice plus a sustained mood finding is Caution by corroboration', () => {
    const e = run(
      [...steady('sleepHours', 6.5, 1, 33), ...steady('sleepHours', 5.5, 34, 40), ...flat, ...steady('phq2', 2, 34, 40)],
      40,
    );
    expect(e.zones.brain.status).toBe('caution');
    expect(e.zones.brain.corroborated).toBe(true);
  });

  it('corroboration never produces Warning', () => {
    const e = run(
      [...steady('sleepHours', 6.5, 1, 33), ...steady('sleepHours', 5.5, 34, 40), ...flat, ...steady('phq2', 2, 34, 40)],
      40,
    );
    expect(e.highest).toBe('caution');
  });

  it('two signals in different zones do not corroborate each other', () => {
    const e = run([...steady('sleepHours', 5.5, 14, 20), ...steady('heartRate', 62, 1, 15), ...steady('heartRate', 90, 16, 20)]);
    expect(e.zones.brain.status).toBe('notice');
    expect(e.zones.heart.status).toBe('notice');
    expect(e.zones.brain.corroborated).toBe(false);
    expect(e.zones.heart.corroborated).toBe(false);
  });
});

describe('red flags are latched', () => {
  const crisis = [
    reading('bpSystolic', 185, 20, { groupId: 'crisis', minute: 400 }),
    reading('bpDiastolic', 125, 20, { groupId: 'crisis', minute: 400 }),
  ];
  const remeasure = [
    reading('bpSystolic', 130, 20, { groupId: 'normal', minute: 700 }),
    reading('bpDiastolic', 80, 20, { groupId: 'normal', minute: 700 }),
  ];

  it('stays Warning after a normal re-measure, with the latest re-measure attached', () => {
    const e = run([...crisis, ...remeasure]);
    expect(e.zones.heart.status).toBe('warning');
    const sys = e.zones.heart.findings.find((f) => f.ruleId === 'bp-crisis-systolic')!;
    expect(sys.latched).toBe(true);
    expect(sys.latestObserved).toBe(1300);
  });

  it('stays active on later days, even when the reading is stale', () => {
    const e = run([...crisis, ...remeasure], 30);
    expect(e.zones.heart.status).toBe('warning');
  });

  it('is released only by a CMO acknowledgement of that (zone, group)', () => {
    const e = run([...crisis, ...remeasure], 20, [ack('heart', 'crisis')]);
    expect(e.zones.heart.status).toBe('none');
    const other = run([...crisis, ...remeasure], 20, [ack('heart', 'normal')]);
    expect(other.zones.heart.status).toBe('warning');
    const wrongZone = run([...crisis, ...remeasure], 20, [ack('immune', 'crisis')]);
    expect(wrongZone.zones.heart.status).toBe('warning');
  });

  it('a new crossing reading latches again after an acknowledgement', () => {
    const again = [
      reading('bpSystolic', 190, 21, { groupId: 'again', minute: 400 }),
      reading('bpDiastolic', 100, 21, { groupId: 'again', minute: 400 }),
    ];
    const e = run([...crisis, ...remeasure, ...again], 21, [ack('heart', 'crisis')]);
    expect(e.zones.heart.status).toBe('warning');
  });

  it('is not lowered by a baseline, a shift or a dismissal-like state: raw comparison only', () => {
    const e = run([...steady('temperature', 39.5, 1, 19), reading('temperature', 40.0, 20)]);
    expect(e.zones.immune.status).toBe('warning');
  });

  it('a red-flag finding keeps the same key while latched', () => {
    const a = run([...crisis, ...remeasure], 20).zones.heart.findings.map((f) => f.key).sort();
    const b = run([...crisis, ...remeasure], 25).zones.heart.findings.map((f) => f.key).sort();
    expect(b).toEqual(a);
  });
});

describe('resting vs exercise readings', () => {
  it('40.5 C after exercise is not a Warning and triggers no temperature rule', () => {
    const e = run([...tempBase, reading('temperature', 40.5, 20, { context: 'exercise' })]);
    expect(e.zones.immune.status).toBe('none');
    expect(e.zones.immune.findings).toEqual([]);
  });

  it('HR 120 after exercise fires nothing and stays out of the series and baseline', () => {
    const e = run([...hrBase, reading('heartRate', 120, 20, { context: 'exercise' })]);
    expect(e.zones.heart.findings).toEqual([]);
    expect(e.indicatorStatus.heartRate.lastReadingDay).toBe(19);
  });

  it('an exercise BP reading still trips the crisis red flag', () => {
    const e = run([reading('bpSystolic', 185, 20, { context: 'exercise' })]);
    expect(e.zones.heart.status).toBe('warning');
  });

  it('a symptomatic exercise HR reading evaluates (round 2: symptom rules see any reading)', () => {
    const e = run([...hrBase, reading('heartRate', 120, 20, { context: 'exercise', symptomatic: true })]);
    expect(e.zones.heart.status).toBe('warning');
  });

  it('a MANUAL reading wins the daily value over SYNTHETIC but both stay listed', () => {
    const synth = steady('heartRate', 62, 1, 20, { source: 'SYNTHETIC', minute: 300 });
    const manual = reading('heartRate', 73, 20, { source: 'MANUAL', minute: 100 });
    const e = run([...synth, manual]);
    expect(e.indicatorStatus.heartRate.lastReadingT).toBe(19 * 1440 + 100);
  });
});

describe('missing data', () => {
  it('building baseline: layers (b) and (c) stay silent, absolute rules still fire', () => {
    const e = run([...steady('temperature', 37.7, 1, 4), ...steady('heartRate', 62, 1, 4), ...bpCrisisToday()], 5);
    expect(e.indicatorStatus.temperature.baseline).toBe('building');
    expect(e.indicatorStatus.temperature.baselineDays).toBe(0);
    expect(e.zones.heart.status).toBe('warning');
    expect(ids(e, 'immune')).toEqual([]);
  });

  it('38.0 or higher at rest with no baseline is Notice flagged unverified', () => {
    const e = run([reading('temperature', 38.3, 3)], 3);
    expect(e.zones.immune.status).toBe('notice');
    const f = e.zones.immune.findings[0]!;
    expect(f.ruleId).toBe('temp-fever-no-baseline');
    expect(f.unverified).toBe(true);
    expect(f.confidence).toBe('low');
  });

  it('S-3.9: five days of history give no (b) or (c) finding', () => {
    const e = run([...steady('temperature', 38.5, 1, 5).slice(0, 4), ...steady('heartRate', 90, 1, 5)], 5);
    expect(ids(e, 'immune')).not.toContain('temp-above-baseline');
    expect(ids(e, 'heart')).not.toContain('hr-above-baseline');
  });

  it('stale: a 3-day-old reading fires no single-reading rule and is flagged stale', () => {
    const e = run([...steady('temperature', 37.7, 1, 16), reading('temperature', 38.4, 17)], 20);
    expect(e.indicatorStatus.temperature.stale).toBe(true);
    expect(e.zones.immune.findings).toEqual([]);
    expect(e.zones.immune.status).toBe('noData');
  });

  it('2 days old is stale, 1 day old is not', () => {
    const one = run([...steady('temperature', 37.7, 1, 19)], 20);
    expect(one.indicatorStatus.temperature.stale).toBe(false);
    const two = run([...steady('temperature', 37.7, 1, 18)], 20);
    expect(two.indicatorStatus.temperature.stale).toBe(true);
  });

  it('zone status distinguishes none, noData and unmonitored', () => {
    const empty = run([], 1);
    expect(empty.zones.brain.status).toBe('noData');
    expect(empty.zones.eyes.status).toBe('unmonitored');
    expect(empty.zones.bone.status).toBe('unmonitored');
    const withData = run([reading('glucose', 90, 1)], 1);
    expect(withData.zones.metabolism.status).toBe('none');
    expect(withData.zones.brain.status).toBe('noData');
  });

  it('the glucose flag off makes metabolism unmonitored', () => {
    const k = loadKnowledge({ glucose: false });
    const e = evaluate({ readings: [reading('glucose', 53, 1)], acks: [] }, k, endOfDay(1));
    expect(e.zones.metabolism.status).toBe('unmonitored');
    expect(e.zones.metabolism.findings).toEqual([]);
  });
});

function bpCrisisToday() {
  return [reading('bpSystolic', 185, 5, { groupId: 'x' }), reading('bpDiastolic', 125, 5, { groupId: 'x' })];
}

describe('determinism and keys', () => {
  it('the same input and as-of day give the same output, whatever the input order', () => {
    const rs = [...tempBase, ...hrBase, reading('temperature', 38.4, 20), reading('heartRate', 73, 20)];
    const a = run(rs);
    const b = run([...rs].reverse());
    expect(b).toEqual(a);
    expect(run(rs)).toEqual(a);
  });

  it('keys a sustained finding by episode: same key across consecutive days', () => {
    const rs = [...steady('heartRate', 62, 1, 23), ...steady('heartRate', 73, 24, 30)];
    const key = (day: number) =>
      run(rs, day).zones.heart.findings.find((f) => f.ruleId === 'hr-above-baseline')?.key;
    expect(key(26)).toBe('hr-above-baseline:26');
    expect(key(27)).toBe('hr-above-baseline:26');
    expect(key(28)).toBe('hr-above-baseline:26');
  });

  it('exposes audiences by tier: Warning reaches CMO and flight surgeon, Notice only the astronaut', () => {
    const warn = run([reading('glucose', 50, 20)]);
    expect(warn.audiences).toEqual(expect.arrayContaining(['cmo', 'flightSurgeon']));
    const notice = run([reading('phq2', 3, 20)]);
    expect(notice.audiences).toEqual(['astronaut']);
  });
});
