import { describe, expect, it } from 'vitest';
import { daysBetween, expiryStatus, sortByUrgency, stockLevel, summarizeStock, validateMedication } from './model';
import type { Medication, MedicationInput } from './model';

const med = (over: Partial<Medication> = {}): Medication => ({
  id: 'm1',
  name: 'Ibuprofen',
  form: 'tablet',
  strength: '200 mg',
  category: 'analgesic',
  quantity: 50,
  unit: 'tablets',
  minStock: 20,
  expiresOn: '2027-12-31',
  updatedAt: '2026-06-01T00:00:00.000Z',
  ...over,
});

const TODAY = '2026-06-15';

describe('stockLevel', () => {
  it('is ok above the minimum, low at or below it, out at zero', () => {
    expect(stockLevel({ quantity: 21, minStock: 20 })).toBe('ok');
    expect(stockLevel({ quantity: 20, minStock: 20 })).toBe('low');
    expect(stockLevel({ quantity: 1, minStock: 20 })).toBe('low');
    expect(stockLevel({ quantity: 0, minStock: 20 })).toBe('out');
    expect(stockLevel({ quantity: 0, minStock: 0 })).toBe('out');
  });
});

describe('expiryStatus', () => {
  it('is expired only the day after the expiry date', () => {
    expect(expiryStatus({ expiresOn: '2026-06-14' }, TODAY)).toBe('expired');
    expect(expiryStatus({ expiresOn: '2026-06-15' }, TODAY)).toBe('soon');
  });

  it('warns up to 90 days ahead, inclusive', () => {
    expect(expiryStatus({ expiresOn: '2026-09-13' }, TODAY)).toBe('soon'); // exactly 90 days
    expect(expiryStatus({ expiresOn: '2026-09-14' }, TODAY)).toBe('ok');
  });

  it('treats an unreadable date as expired rather than safe', () => {
    expect(expiryStatus({ expiresOn: 'soon' }, TODAY)).toBe('expired');
  });
});

describe('daysBetween', () => {
  it('counts calendar days and rejects impossible dates', () => {
    expect(daysBetween('2026-02-27', '2026-03-01')).toBe(2);
    expect(daysBetween('2026-02-30', '2026-03-01')).toBeNull();
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2); // leap year
    expect(daysBetween('2100-02-28', '2100-03-01')).toBe(1); // 2100 is not a leap year
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });
});

describe('summarizeStock', () => {
  it('counts totals, low stock (out included), expiring soon and expired', () => {
    const kit = [
      med({ id: 'a' }),
      med({ id: 'b', quantity: 3 }),
      med({ id: 'c', quantity: 0 }),
      med({ id: 'd', expiresOn: '2026-07-01' }),
      med({ id: 'e', expiresOn: '2026-01-01', quantity: 2 }),
    ];
    expect(summarizeStock(kit, TODAY)).toEqual({ total: 5, lowStock: 3, outOfStock: 1, expiringSoon: 1, expired: 1 });
  });

  it('is all zeros for an empty kit', () => {
    expect(summarizeStock([], TODAY)).toEqual({ total: 0, lowStock: 0, outOfStock: 0, expiringSoon: 0, expired: 0 });
  });
});

describe('sortByUrgency', () => {
  it('puts expired first, then out, low, expiring soon, then the rest by name', () => {
    const kit = [
      med({ id: 'ok-b', name: 'B ok' }),
      med({ id: 'soon', name: 'Soon', expiresOn: '2026-07-01' }),
      med({ id: 'low', name: 'Low', quantity: 5 }),
      med({ id: 'out', name: 'Out', quantity: 0 }),
      med({ id: 'exp', name: 'Expired', expiresOn: '2026-01-01' }),
      med({ id: 'ok-a', name: 'A ok' }),
    ];
    expect(sortByUrgency(kit, TODAY).map((m) => m.id)).toEqual(['exp', 'out', 'low', 'soon', 'ok-a', 'ok-b']);
  });
});

describe('validateMedication', () => {
  const input = (over: Partial<MedicationInput> = {}): MedicationInput => {
    const { id, updatedAt, ...rest } = med();
    void id;
    void updatedAt;
    return { ...rest, ...over };
  };

  it('accepts a complete medication', () => {
    expect(validateMedication(input())).toEqual({});
  });

  it('requires a name, form and unit, but not a strength', () => {
    const errors = validateMedication(input({ name: ' ', form: '', unit: '', strength: '' }));
    expect(Object.keys(errors).sort()).toEqual(['form', 'name', 'unit']);
  });

  it('rejects negative, fractional and non-numeric quantities', () => {
    expect(validateMedication(input({ quantity: -1 })).quantity).toBeDefined();
    expect(validateMedication(input({ minStock: 1.5 })).minStock).toBeDefined();
    expect(validateMedication(input({ quantity: Number.NaN })).quantity).toBeDefined();
    expect(validateMedication(input({ quantity: 0, minStock: 0 }))).toEqual({});
  });

  it('rejects a bad date and an unknown category', () => {
    expect(validateMedication(input({ expiresOn: '2026-13-01' })).expiresOn).toBeDefined();
    expect(validateMedication(input({ expiresOn: '' })).expiresOn).toBeDefined();
    expect(validateMedication(input({ category: 'magic' as never })).category).toBeDefined();
  });
});
