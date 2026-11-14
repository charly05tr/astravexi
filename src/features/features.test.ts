import { describe, expect, it } from 'vitest';
import type { IndicatorId, OutboxMessage } from '../core/health/model';
import { knowledge } from '../knowledge';
import { buildEntry, emptyCheckInForm, parseNumber } from './check-in/check-in-model';
import { fillTemplate } from './insights/explanation';
import { buildOutboxView } from './outbox/outbox-model';
import { formatDelta, formatMissionTime, formatNumber } from './shared/format';
import { validateMissionSetup } from './onboarding/MissionSetup';

const all = new Set<IndicatorId>(knowledge.indicators.map((i) => i.id));

describe('check-in model', () => {
  it('parses plain numbers with a point or a comma and rejects anything else', () => {
    expect(parseNumber('37.2')).toBe(37.2);
    expect(parseNumber(' 37,2 ')).toBe(37.2);
    expect(parseNumber('abc')).toBeNaN();
    expect(parseNumber('1e3')).toBeNaN();
    expect(parseNumber('')).toBeNaN();
  });

  it('skips empty fields, sums PHQ-2 and carries context and symptoms', () => {
    const form = emptyCheckInForm();
    form.fields.temperature = '38.1';
    form.phq = [2, 3];
    form.context = 'exercise';
    form.symptomatic = true;
    const built = buildEntry(form, all);
    expect(built).toEqual({
      ok: true,
      entry: { values: { temperature: 38.1, phq2: 5 }, context: 'exercise', symptomatic: true },
    });
  });

  it('flags half a blood pressure pair on the missing field and half a PHQ-2', () => {
    const form = emptyCheckInForm();
    form.fields.bpSystolic = '120';
    form.phq = [1, null];
    const built = buildEntry(form, all);
    expect(built.ok).toBe(false);
    if (!built.ok) {
      expect(built.errors.bpDiastolic).toMatch(/both blood pressure/i);
      expect(built.errors.phq2).toMatch(/both questions/i);
    }
  });

  it('passes a non-number to the use case as NaN so it can reject it', () => {
    const form = emptyCheckInForm();
    form.fields.heartRate = 'fast';
    const built = buildEntry(form, all);
    expect(built.ok && Number.isNaN(built.entry.values.heartRate)).toBe(true);
  });

  it('ignores a field that is not monitored (glucose flag off)', () => {
    const form = emptyCheckInForm();
    form.fields.glucose = '90';
    form.fields.heartRate = '60';
    const monitored = new Set(all);
    monitored.delete('glucose');
    const built = buildEntry(form, monitored);
    expect(built.ok && built.entry.values).toEqual({ heartRate: 60 });
  });
});

describe('formatting', () => {
  it('uses tenths for temperature and sleep, whole numbers otherwise', () => {
    expect(formatNumber(38, { unitScale: 10 })).toBe('38.0');
    expect(formatNumber(62.4, { unitScale: 1 })).toBe('62');
    expect(formatDelta(0.4, { unitScale: 10, unit: 'C' })).toBe('+0.4 C');
    expect(formatDelta(-1, { unitScale: 1, unit: 'bpm' })).toBe('-1 bpm');
  });

  it('writes mission minutes as day and clock time', () => {
    expect(formatMissionTime(0)).toBe('Day 1, 00:00');
    expect(formatMissionTime(149 * 1440 + 485)).toBe('Day 150, 08:05');
  });

  it('fills known tokens and drops unknown ones', () => {
    expect(fillTemplate('Was {observed}, then {nope}.', { observed: '38.1 C' })).toBe('Was 38.1 C, then .');
  });
});

describe('outbox view', () => {
  const base: OutboxMessage = {
    id: 'msg:heart:g1',
    dedupeKey: 'heart:g1',
    zoneId: 'heart',
    groupId: 'g1',
    createdAt: 100,
    to: 'flightSurgeon',
    payload: { crewMember: 'Crew', source: 'MANUAL', trigger: [], zoneTiers: {} as never },
    state: 'queued',
  };
  const labels = new Map([['heart' as const, 'Heart']]);

  it('reads the earliest reply from the current delay while queued', () => {
    const [card] = buildOutboxView([base], { oneWayDelayMin: 12, blackout: false }, labels);
    expect(card!.replyText).toBe('Earliest reply T+24 min after sending');
    expect(card!.canSend).toBe(true);
    expect(buildOutboxView([base], { oneWayDelayMin: 0, blackout: false }, labels)[0]!.replyText).toContain('T+0 min');
  });

  it('shows no reply time and no Send while held', () => {
    const [card] = buildOutboxView([{ ...base, state: 'held' }], { oneWayDelayMin: 12, blackout: true }, labels);
    expect(card!.replyText).toMatch(/no reply time until the link returns/i);
    expect(card!.canSend).toBe(false);
  });

  it('freezes the reply time once sent', () => {
    const sent: OutboxMessage = { ...base, state: 'sent', sentAt: 200, oneWayDelayMin: 20, replyPossibleAt: 240 };
    const [card] = buildOutboxView([sent], { oneWayDelayMin: 3, blackout: false }, labels);
    expect(card!.replyText).toContain('T+40 min');
    expect(card!.canSend).toBe(false);
  });
});

describe('mission setup validation', () => {
  it('accepts the defaults and rejects a bad length, date or destination', () => {
    expect(validateMissionSetup({ launchDate: '2026-06-15', transitDays: '210', destination: 'Mars' })).toBeNull();
    expect(validateMissionSetup({ launchDate: '', transitDays: '210', destination: 'Mars' })?.launchDate).toBeDefined();
    expect(validateMissionSetup({ launchDate: '2026-06-15', transitDays: '0', destination: 'Mars' })?.transitDays).toBeDefined();
    expect(validateMissionSetup({ launchDate: '2026-06-15', transitDays: '2.5', destination: 'Mars' })?.transitDays).toBeDefined();
    expect(validateMissionSetup({ launchDate: '2026-06-15', transitDays: '210', destination: ' ' })?.destination).toBeDefined();
  });
});
