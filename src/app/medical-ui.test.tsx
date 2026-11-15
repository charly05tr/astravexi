// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mountApp } from '../test-support/mount';
import { MEDICAL_DB_NAME } from './mode';

const stock = async () => screen.findByRole('region', { name: /^medication stock$/i });
const rowOf = (name: string) => within(screen.getByRole('table', { name: /^medications$/i })).getByText(name).closest('tr')!;

describe('medication stock (CMO crew dashboard)', () => {
  it('shows the summary and the kit below the crew list', async () => {
    await mountApp('demo', { role: 'cmo' });
    const panel = await stock();
    const crew = await screen.findByRole('list', { name: /^crew members$/i });
    expect(crew.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const summary = within(panel).getByRole('list', { name: /^stock summary$/i });
    expect(within(summary).getByText('Expired').closest('li')).toHaveTextContent('1');
    expect(rowOf('Lubricating eye drops')).toHaveTextContent(/expired/i);
    expect(rowOf('Promethazine')).toHaveTextContent(/out of stock/i);
    expect(rowOf('Acetaminophen')).toHaveTextContent(/low stock/i);
    expect(rowOf('Ibuprofen')).toHaveTextContent(/ok/i);
  });

  it('is not shown to an astronaut or a flight surgeon', async () => {
    const m = await mountApp('demo', { role: 'astronaut' });
    expect(screen.queryByRole('region', { name: /^medication stock$/i })).toBeNull();
    m.actAs('flightSurgeon');
    await screen.findByRole('region', { name: /^crew$/i });
    expect(screen.queryByRole('region', { name: /^medication stock$/i })).toBeNull();
  });

  it('adds, edits and deletes a medication with an in-app confirmation', async () => {
    const m = await mountApp('demo', { role: 'cmo' });
    await stock();
    const store = m.world.medicalStores.get(MEDICAL_DB_NAME.demo)!;

    await m.user.click(screen.getByRole('button', { name: /^add medication$/i }));
    const form = screen.getByRole('form', { name: /^add medication$/i });
    await m.user.click(within(form).getByRole('button', { name: /^add medication$/i }));
    expect(within(form).getAllByRole('alert').length).toBeGreaterThan(0); // required fields are reported

    await m.user.type(within(form).getByLabelText('Name'), 'Naproxen');
    await m.user.type(within(form).getByLabelText('Dosage form'), 'tablet');
    await m.user.type(within(form).getByLabelText('Strength'), '250 mg');
    await m.user.type(within(form).getByLabelText('Quantity'), '30');
    await m.user.type(within(form).getByLabelText('Unit'), 'tablets');
    await m.user.type(within(form).getByLabelText('Minimum stock'), '10');
    await m.user.type(within(form).getByLabelText('Expiration date'), '2030-01-31');
    await m.user.click(within(form).getByRole('button', { name: /^add medication$/i }));

    await waitFor(() => expect(rowOf('Naproxen')).toHaveTextContent('30 tablets'));
    expect((await store.listMedications()).some((x) => x.name === 'Naproxen')).toBe(true);

    await m.user.click(screen.getByRole('button', { name: /^edit naproxen$/i }));
    const edit = screen.getByRole('form', { name: /^edit medication$/i });
    const quantity = within(edit).getByLabelText('Quantity');
    await m.user.clear(quantity);
    await m.user.type(quantity, '4');
    await m.user.click(within(edit).getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(rowOf('Naproxen')).toHaveTextContent(/4 tablets.*low stock/i));

    // Declining the confirmation keeps the row.
    await m.user.click(screen.getByRole('button', { name: /^delete naproxen$/i }));
    const confirm = screen.getByRole('dialog', { name: /delete medication/i });
    await m.user.click(within(confirm).getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(rowOf('Naproxen')).toBeInTheDocument();

    await m.user.click(screen.getByRole('button', { name: /^delete naproxen$/i }));
    await m.user.click(within(screen.getByRole('dialog', { name: /delete medication/i })).getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(screen.queryByText('Naproxen')).toBeNull());
    expect((await store.listMedications()).some((x) => x.name === 'Naproxen')).toBe(false);
  });

  it('shows the allergies and administered medications in the astronaut detail', async () => {
    const m = await mountApp('demo', { role: 'cmo' });
    const crew = await screen.findByRole('list', { name: /^crew members$/i });
    await waitFor(() => expect(within(crew).getAllByRole('button').length).toBeGreaterThan(0));
    await m.user.click(within(crew).getAllByRole('button').find((b) => b.querySelector('strong')?.textContent === 'Demo astronaut')!);

    const allergies = await screen.findByRole('list', { name: /^allergies$/i });
    expect(within(allergies).getByText('Penicillin').closest('li')).toHaveTextContent(/severe.*anaphylaxis/i);
    const given = screen.getByRole('list', { name: /^administered medications$/i });
    expect(within(given).getByText('Zolpidem').closest('li')).toHaveTextContent(/5 mg oral.*by demo cmo/i);
  });
});
