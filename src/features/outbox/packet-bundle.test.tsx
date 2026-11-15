// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { OutboxMessage } from '../../core/health/model';
import { mountApp } from '../../test-support/mount';
import { createDefaultEnvironmentConfig } from '../environment/environment-model';
import {
  buildDtnContextEnvelope,
  buildGroundValidationPacket,
  computeDtnBandwidthMetrics,
} from './packet-bundle';

const BASE_MSG: OutboxMessage = {
  id: 'msg:heart:g1',
  dedupeKey: 'heart:g1',
  zoneId: 'heart',
  groupId: 'g1',
  createdAt: 150 * 1440,
  to: 'flightSurgeon',
  payload: {
    crewMember: 'Crew',
    source: 'MANUAL',
    trigger: [{ ruleId: 'bp-sys-warning', indicatorId: 'bpSystolic', value: 185, tier: 'warning', source: 'MANUAL' }],
    zoneTiers: {
      brain: 'caution',
      eyes: 'unmonitored',
      heart: 'warning',
      bone: 'unmonitored',
      metabolism: 'none',
      immune: 'none',
    },
  },
  state: 'queued',
};

describe('packet-bundle DTN Store-and-Forward & Ground Validation', () => {
  it('builds a lightweight DTN context envelope with >99% bandwidth savings and zero private score leakage', () => {
    const env = createDefaultEnvironmentConfig('rover');
    const dtn = buildDtnContextEnvelope({
      zoneId: 'heart',
      environment: env,
      symptomReport: { zoneId: 'heart', discomfort: 6, tags: ['chest-tightness'] },
      triageLevel: 'urgent',
      loggedSuppliesCount: 1,
      allergyConflictsCount: 1,
    });

    expect(dtn.protocol).toBe('DTN-Bundle-v1');
    expect(dtn.habitatContext.habitat).toBe('Rover');
    expect(dtn.localizedSymptoms.active).toBe(true);
    expect(dtn.localTriageLevel).toBe('urgent');

    const json = JSON.stringify({ ...BASE_MSG.payload, dtnContext: dtn }, null, 2);
    expect(json).not.toMatch(/\b(phq|phq2|mood|points)\b/i);

    const metrics = computeDtnBandwidthMetrics(json);
    expect(metrics.packetBytes).toBeLessThan(2048);
    expect(metrics.savingsPercent).toBeGreaterThan(99.9);
    expect(metrics.compactLabel).toMatch(/DTN bundle .* KB · 99\.\d+% less than continuous stream/);
  });

  it('produces MCC-H ground validation only once the message state reaches replyPossible (2 × delay)', () => {
    expect(buildGroundValidationPacket(BASE_MSG)).toBeNull();
    expect(
      buildGroundValidationPacket({
        ...BASE_MSG,
        state: 'sent',
        sentAt: 1000,
        oneWayDelayMin: 10,
        replyPossibleAt: 1020,
      }),
    ).toBeNull();

    const validated = buildGroundValidationPacket({
      ...BASE_MSG,
      state: 'replyPossible',
      sentAt: 1000,
      oneWayDelayMin: 10,
      replyPossibleAt: 1020,
    });
    expect(validated).not.toBeNull();
    expect(validated!.authority).toMatch(/MCC-H Flight Surgeon/i);
    expect(validated!.calibrationSummary).toMatch(/MCC-H concurs/i);
  });
});

describe('Outbox DTN & Deferred Ground Validation UI integration', () => {
  it('bundles habitat/triage context into the outbox packet and renders MCC-H validation when replyPossible arrives', async () => {
    const m = await mountApp('demo');

    // Trigger a Heart warning (BP 185/125) to enqueue an outbox packet
    await m.user.click(screen.getByRole('button', { name: /^heart\b/i }));
    await m.user.click(screen.getByRole('button', { name: /view details/i }));
    const dialog = screen.getByRole('dialog');
    const summary = within(dialog).getByText(/update heart readings/i);
    await m.user.click(summary);
    const form = within(within(dialog).getByRole('form', { name: /update heart readings/i }));
    await m.user.type(form.getByLabelText(/systolic/i), '185');
    await m.user.type(form.getByLabelText(/diastolic/i), '125');
    await m.user.click(form.getByRole('button', { name: /save readings/i }));
    await m.user.click(within(dialog).getByRole('button', { name: /close details/i }));

    // Open Comms and verify the DTN Store-and-Forward summary strip
    await m.user.click(screen.getByRole('button', { name: /^comms/i }));
    const dtnStrip = await screen.findByTestId('dtn-packet-summary');
    expect(dtnStrip).toHaveTextContent(/DTN bundle .* KB · 99\.\d+% less than continuous stream/i);
    expect(dtnStrip).toHaveTextContent(/Env: Transit/i);

    // Send with 1 min delay, advance simulated time past 2x delay, and verify Ground Validation arrives
    fireEvent.change(screen.getByLabelText(/one-way delay/i), { target: { value: '1' } });
    await m.user.click(screen.getByRole('button', { name: /send now/i }));
    await waitFor(() => expect(screen.getByTestId('outbox-message')).toHaveAttribute('data-state', 'sent'));

    m.world.wait(150);
    await m.state().tick();

    const validationCard = await screen.findByTestId('ground-validation');
    expect(validationCard).toHaveTextContent(/MCC-H Flight Surgeon Desk/i);
    expect(validationCard).toHaveTextContent(/MCC-H concurs with local cardiac hold/i);

    const calibrateBtn = within(validationCard).getByRole('button', { name: /apply ground calibration/i });
    await m.user.click(calibrateBtn);
    expect(within(validationCard).getByRole('button', { name: /calibration applied/i })).toBeDisabled();
  }, 15000);
});
