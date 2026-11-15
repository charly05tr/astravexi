// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mountApp } from '../../test-support/mount';
import {
  ZONE_SYMPTOMS,
  createInitialSymptomReports,
  formatSymptomSummary,
  hasAnySymptoms,
  hasZoneSymptoms,
} from './symptom-model';

describe('symptom-model', () => {
  it('defines symptom options for all 6 body zones', () => {
    const zones = Object.keys(ZONE_SYMPTOMS) as Array<keyof typeof ZONE_SYMPTOMS>;
    expect(zones).toEqual(['brain', 'eyes', 'heart', 'immune', 'metabolism', 'bone']);
    for (const zone of zones) {
      expect(ZONE_SYMPTOMS[zone].length).toBeGreaterThanOrEqual(3);
    }
  });

  it('starts empty and formats concise summaries when symptoms or discomfort exist', () => {
    const reports = createInitialSymptomReports();
    expect(hasAnySymptoms(reports)).toBe(false);
    expect(hasZoneSymptoms(reports.eyes)).toBe(false);
    expect(formatSymptomSummary(reports.eyes)).toBeNull();

    const updated = { zoneId: 'eyes' as const, discomfort: 4, tags: ['near-blur'] };
    expect(hasZoneSymptoms(updated)).toBe(true);
    expect(formatSymptomSummary(updated)).toBe('Near-vision blur · discomfort 4/10');
  });
});

describe('SymptomReportAction integration', () => {
  const rail = () => screen.getByRole('list', { name: /^body zones$/i });
  const railRow = (zone: string) => rail().querySelector<HTMLElement>(`[data-zone-id="${zone}"]`)!;

  it('allows reporting, editing, and clearing localized symptoms on unmonitored (Eyes) and monitored (Brain) zones', async () => {
    const m = await mountApp('demo');

    // Select unmonitored Eyes zone from the body zones rail
    await m.user.click(railRow('eyes'));
    expect(screen.getByRole('heading', { level: 2, name: 'Eyes' })).toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: /report symptom/i });
    await m.user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: /eyes symptoms/i });
    const blurChip = within(dialog).getByRole('button', { name: /near-vision blur/i });
    await m.user.click(blurChip);
    expect(blurChip).toHaveAttribute('aria-pressed', 'true');

    const slider = within(dialog).getByRole('slider', { name: /discomfort level/i });
    fireEvent.change(slider, { target: { value: '5' } });

    await m.user.click(within(dialog).getByRole('button', { name: /done/i }));

    // Readable symptom card renders above Recommended change (cause -> effect flow)
    const symptomCard = screen.getByRole('region', { name: /reported symptom/i });
    expect(within(symptomCard).getByText('Near-vision blur')).toBeInTheDocument();
    expect(within(symptomCard).getByText('5/10')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit symptom/i })).toBeInTheDocument();

    const eyesSuggestionHeading = screen.getByRole('heading', { name: /recommended change/i });
    expect(eyesSuggestionHeading).toBeInTheDocument();
    expect(
      symptomCard.compareDocumentPosition(eyesSuggestionHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const eyesSuggestionCard = eyesSuggestionHeading.closest('section')!;
    expect(within(eyesSuggestionCard).getByText(/reduce close-focus strain/i)).toBeInTheDocument();
    expect(within(eyesSuggestionCard).getByText(/reported symptom: near-vision blur/i)).toBeInTheDocument();
    expect(within(eyesSuggestionCard).getByText(/statistical baseline:/i)).toBeInTheDocument();
    expect(within(eyesSuggestionCard).getByText(/cabin environment:/i)).toBeInTheDocument();

    // Switch to monitored Brain zone and report a symptom there too
    await m.user.click(railRow('brain'));
    expect(screen.getByRole('heading', { level: 2, name: 'Brain' })).toBeInTheDocument();
    await m.user.click(screen.getByRole('button', { name: /report symptom/i }));

    const brainDialog = screen.getByRole('dialog', { name: /brain symptoms/i });
    await m.user.click(within(brainDialog).getByRole('button', { name: /headache \/ pressure/i }));
    await m.user.click(within(brainDialog).getByRole('button', { name: /done/i }));

    const brainSymptomCard = screen.getByRole('region', { name: /reported symptom/i });
    expect(within(brainSymptomCard).getByText('Headache / pressure')).toBeInTheDocument();

    // Recommended change appears directly below the reported symptom card (below the atypical chart)
    const brainSuggestionHeading = screen.getByRole('heading', { name: /recommended change/i });
    expect(
      brainSymptomCard.compareDocumentPosition(brainSuggestionHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const brainSection = brainSuggestionHeading.closest('section')!;
    expect(within(brainSection).getByText(/boost local airflow/i)).toBeInTheDocument();
    expect(within(brainSection).getByText(/sleep:/i)).toBeInTheDocument();
    expect(within(brainSection).getByText(/co2 \d+ ppm/i)).toBeInTheDocument();

    // Reopen Brain symptom modal and clear
    await m.user.click(screen.getByRole('button', { name: /edit symptom/i }));
    const reopenDialog = screen.getByRole('dialog', { name: /brain symptoms/i });
    await m.user.click(within(reopenDialog).getByRole('button', { name: /clear/i }));
    await m.user.click(within(reopenDialog).getByRole('button', { name: /done/i }));

    expect(screen.queryByRole('region', { name: /reported symptom/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /report symptom/i })).toBeInTheDocument();
  }, 15000);
});
