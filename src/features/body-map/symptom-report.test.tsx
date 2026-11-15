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

    // Summary line displays cleanly on the ZonePanel without clutter, button switches to Edit symptom
    expect(screen.getByText('Near-vision blur · discomfort 5/10')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit symptom/i })).toBeInTheDocument();

    // Switch to monitored Brain zone and report a symptom there too
    await m.user.click(railRow('brain'));
    expect(screen.getByRole('heading', { level: 2, name: 'Brain' })).toBeInTheDocument();
    await m.user.click(screen.getByRole('button', { name: /report symptom/i }));

    const brainDialog = screen.getByRole('dialog', { name: /brain symptoms/i });
    await m.user.click(within(brainDialog).getByRole('button', { name: /headache \/ pressure/i }));
    await m.user.click(within(brainDialog).getByRole('button', { name: /done/i }));
    expect(screen.getByText('Headache / pressure')).toBeInTheDocument();

    // Reopen Brain symptom modal and clear
    await m.user.click(screen.getByRole('button', { name: /edit symptom/i }));
    const reopenDialog = screen.getByRole('dialog', { name: /brain symptoms/i });
    await m.user.click(within(reopenDialog).getByRole('button', { name: /clear/i }));
    await m.user.click(within(reopenDialog).getByRole('button', { name: /done/i }));

    expect(screen.queryByText('Headache / pressure')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /report symptom/i })).toBeInTheDocument();
  });
});
