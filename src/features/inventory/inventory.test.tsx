// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AsOf, Reading, ZoneId } from '../../core/health/model';
import { knowledge } from '../../knowledge';
import { mountApp } from '../../test-support/mount';
import {
  HMS_INVENTORY_CATALOG,
  HMS_SAFEGUARD_TEXT,
  XHER_ALLERGY_CATALOG,
  detectRedundantMeasurements,
  evaluateInventoryAndAllergies,
} from './inventory-model';

const BASE_AS_OF: AsOf = { day: 150, t: 150 * 24 * 60 };

function makeReading(partial: Partial<Reading>): Reading {
  return {
    id: 'r-1',
    indicatorId: 'glucose',
    value: 92,
    day: 150,
    t: BASE_AS_OF.t - 15,
    source: 'MANUAL',
    context: 'rest',
    symptomatic: false,
    groupId: 'g-1',
    ...partial,
  };
}

describe('inventory-model stock, xEHR allergy, and <60 min redundancy rules', () => {
  it('covers all 6 anatomical zones and enforces non-prescriptive safeguard copy', () => {
    const zones: ZoneId[] = ['brain', 'eyes', 'heart', 'metabolism', 'bone', 'immune'];
    const bannedDosage = /\b(\d+\s*mg|\d+\s*tablets|every\s+\d+\s*hours|take twice daily|prescrib(e|ed|ing))\b/i;

    for (const zone of zones) {
      expect(HMS_INVENTORY_CATALOG.some((item) => item.zoneIds.includes(zone)), zone).toBe(true);
    }
    for (const item of HMS_INVENTORY_CATALOG) {
      expect(`${item.name} ${item.usageNote}`).not.toMatch(bannedDosage);
    }
    for (const allergy of XHER_ALLERGY_CATALOG) {
      expect(`${allergy.label} ${allergy.precaution}`).not.toMatch(bannedDosage);
    }
    expect(HMS_SAFEGUARD_TEXT).toMatch(/never prescribes medications/i);
  });

  it('detects redundant consumable-backed readings within 60 minutes and ignores older ones', () => {
    const recentGlucose = makeReading({ id: 'g-15', indicatorId: 'glucose', value: 94, t: BASE_AS_OF.t - 15 });
    const oldTemp = makeReading({ id: 't-90', indicatorId: 'temperature', value: 371, t: BASE_AS_OF.t - 90 });
    const recentPhq = makeReading({ id: 'p-10', indicatorId: 'phq2', value: 4, t: BASE_AS_OF.t - 10 });

    const alerts = detectRedundantMeasurements({
      readings: [recentGlucose, oldTemp, recentPhq],
      asOf: BASE_AS_OF,
      indicators: knowledge.indicators,
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.indicatorId).toBe('glucose');
    expect(alerts[0]!.minutesAgo).toBe(15);
    expect(alerts[0]!.consumableName).toMatch(/glucose test strips/i);
    // PHQ-2 never enters consumable redundancy alerts and raw scores never leak
    expect(alerts.some((a) => a.indicatorId === 'phq2')).toBe(false);
    expect(alerts.map((a) => a.reason).join(' ')).not.toMatch(/\bphq\b|\b4\b/i);
  });

  it('flags xEHR allergy conflicts with safe alternatives and updates depleted stock tiers', () => {
    const ev = evaluateInventoryAndAllergies({
      zoneId: 'heart',
      indicators: knowledge.indicators,
      zoneIndicatorIds: ['heartRate', 'bpSystolic', 'bpDiastolic'],
      readings: [],
      asOf: BASE_AS_OF,
      allergies: ['medical-adhesives'],
      usedCounts: { 'hms-ecg-electrodes': 16 },
    });

    expect(ev.allergyConflictsCount).toBe(1);
    expect(ev.statusEquivalent).toBe('warning');
    const ecg = ev.items.find((i) => i.id === 'hms-ecg-electrodes')!;
    expect(ecg.remaining).toBe(0);
    expect(ecg.stockLevel).toBe('depleted');
    expect(ecg.safeAlternativeName).toBe('Silicone hypoallergenic sensor patches');
  });
});

describe('MedicalInventoryPanel UI integration', () => {
  it('opens HMS & xEHR dialog from the stage pill, toggles allergy conflict, logs consumption, and launches from triage', async () => {
    const m = await mountApp('demo');

    // Open HMS Kit modal from the bottom stage pill
    const trigger = screen.getByTestId('inventory-trigger');
    await m.user.click(trigger);

    const dialog = screen.getByTestId('inventory-dialog');
    expect(within(dialog).getByText(HMS_SAFEGUARD_TEXT)).toBeInTheDocument();

    // Switch to xEHR Allergies and toggle "Ophthalmic preservatives (BAK)"
    await m.user.click(within(dialog).getByRole('button', { name: /xehr allergies/i }));
    const bakCheckbox = within(dialog).getByLabelText(/ophthalmic preservatives/i);
    await m.user.click(bakCheckbox);

    // Switch back to HMS Stock and confirm conflict alert + safe alternative appear
    await m.user.click(within(dialog).getByRole('button', { name: /hms stock/i }));
    const conflictItem = dialog.querySelector<HTMLElement>('[data-supply-id="hms-preserved-tears"]')!;
    expect(within(conflictItem).getByText(/xehr conflict: ophthalmic preservatives/i)).toBeInTheDocument();
    expect(within(conflictItem).getByText(/preservative-free ocular vials/i)).toBeInTheDocument();

    // Log 1 unit used of Preservative-free ocular vials (starts at 18 vials -> 17 vials)
    const tearVials = dialog.querySelector<HTMLElement>('[data-supply-id="hms-preservative-free-tears"]')!;
    expect(within(tearVials).getByText(/18 vials/i)).toBeInTheDocument();
    await m.user.click(within(tearVials).getByRole('button', { name: /log 1 used of preservative-free ocular vials/i }));
    expect(within(tearVials).getByText(/17 vials/i)).toBeInTheDocument();

    // Close HMS modal cleanly
    await m.user.click(screen.getByRole('button', { name: /close hms inventory/i }));
    expect(screen.getByTestId('inventory-trigger')).toHaveTextContent(/1 allergy/i);

    // Open Guided Triage and verify HMS & xEHR integration launcher works
    await m.user.click(within(screen.getByTestId('guided-triage-action')).getByRole('button', { name: /guided triage/i }));
    const triageCheck = screen.getByTestId('triage-inventory-check');
    await m.user.click(within(triageCheck).getByRole('button', { name: /verify kit & xehr/i }));
    expect(screen.getByTestId('inventory-dialog')).toBeInTheDocument();
  }, 15000);
});
