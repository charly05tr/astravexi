import { describe, expect, it } from 'vitest';
import { PermissionError } from '../core/profiles/policy';
import { createTestWorld } from '../test-support/compose';

const DAY = 1440;
const dayOf = (t: number) => Math.floor(t / DAY) + 1;

describe('cabin & crew analysis (DEMO scripted episodes)', () => {
  async function demoAs(role: 'cmo' | 'astronaut') {
    const { services, enter } = await createTestWorld().profileSession('demo');
    const profile = (await services.profiles.list()).find((p) => p.role === role)!;
    const store = await enter(profile);
    await store.getState().hydrate();
    return store;
  }
  async function analysis() {
    return (await demoAs('cmo')).getState().loadCabinAnalysis();
  }

  it('maps each scripted episode to its verdict', async () => {
    const { analysis: a } = await analysis().then((view) => ({ analysis: view.analysis }));
    const pick = (day: number, indicatorId: string) => a.findings.filter((f) => dayOf(f.t) === day && f.indicatorId === indicatorId);

    // Heat overnight into day 133 and a heart-rate rise across the whole crew: likely external.
    const heat = pick(133, 'heartRate');
    expect(heat).toHaveLength(3);
    expect(heat.every((f) => f.verdict === 'likely-external' && f.environment.status === 'linked-excursion')).toBe(true);

    // One crew member alone, cabin nominal: likely internal.
    expect(pick(135, 'heartRate').map((f) => [f.name, f.verdict])).toEqual([['Demo astronaut 3', 'likely-internal']]);

    // The whole crew sleeps less, nothing monitored explains it: possibly external, a shared cause.
    const shared = pick(130, 'sleepHours');
    expect(shared).toHaveLength(3);
    expect(shared.every((f) => f.verdict === 'possibly-external' && f.reason === 'crew-wide-no-monitored-excursion')).toBe(true);

    // High humidity overnight and one person sleeps much less: possibly external, individual susceptibility.
    expect(pick(128, 'sleepHours').map((f) => [f.name, f.verdict, f.reason])).toEqual([
      ['Demo astronaut 2', 'possibly-external', 'linked-excursion-individual-susceptibility'],
    ]);
  });

  it('keeps every nominal cabin variable inside its NASA operating limits and shows dose as context', async () => {
    const view = await analysis();
    expect(view.simulated).toBe(true);
    for (const v of view.variables) {
      expect(v.latest, v.def.id).not.toBeNull();
      expect(v.status, v.def.id).toBe(v.def.contextOnly ? 'information' : 'none');
    }
    const dose = view.variables.find((v) => v.def.id === 'radiationDose')!;
    expect(dose.latest!).toBeLessThan(dose.def.cumulativeLimit!);
  });

  it('shows no cabin data and invents nothing in LIVE', async () => {
    const app = await createTestWorld().app('live', { role: 'cmo' });
    const view = await app.state().loadCabinAnalysis();
    expect(view.simulated).toBe(false);
    expect(view.variables.every((v) => v.latest === null && v.status === 'noData' && v.trend.length === 0)).toBe(true);
    expect(view.analysis.findings.every((f) => f.environment.status !== 'linked-excursion')).toBe(true);
  });

  it('is refused to an astronaut and a flight surgeon', async () => {
    const astronaut = await demoAs('astronaut');
    await expect(astronaut.getState().loadCabinAnalysis()).rejects.toBeInstanceOf(PermissionError);
    const surgeon = await createTestWorld().app('live', { role: 'flightSurgeon' });
    await expect(surgeon.state().loadCabinAnalysis()).rejects.toBeInstanceOf(PermissionError);
  });
});
