import { describe, expect, it } from 'vitest';
import { BookingError } from './types';
import { formatEuro, quoteHourly, quoteTransfer, totalWithExtras } from './pricing';
import { rejectMoneyFields } from './validation';

describe('AC-01 pricing', () => {
  it('AC-01: transfer price returned as given', () => {
    expect(quoteTransfer({ zonePriceCents: 7000 })).toBe(7000);
  });

  it('AC-01: hourly 4 × 6000 = 24000', () => {
    expect(quoteHourly({ rateCents: 6000, minHours: 3, maxHours: 12, hours: 4 })).toBe(24000);
  });

  it('AC-01: extras add up; duplicate string codes counted once', () => {
    const result = totalWithExtras(7000, ['vip-security', 'night-surcharge', 'vip-security'], [
      { code: 'vip-security', priceCents: 15000, active: true },
      { code: 'night-surcharge', priceCents: 2000, active: true },
    ]);
    expect(result.totalCents).toBe(24000);
    expect(result.lines).toEqual([
      { code: 'vip-security', quantity: 1, cents: 15000 },
      { code: 'night-surcharge', quantity: 1, cents: 2000 },
    ]);
  });

  it('extras filtered by booking type; child seat qty 2 → 2× price; qty 4 rejected', () => {
    const catalog = [
      {
        code: 'child-seat',
        priceCents: 1000,
        active: true,
        maxQuantity: 3,
        appliesTo: ['transfer'],
      },
      {
        code: 'vip-security',
        priceCents: 15000,
        active: true,
        maxQuantity: 1,
        appliesTo: ['transfer', 'hourly'],
      },
    ];
    const ok = totalWithExtras(7000, [{ code: 'child-seat', quantity: 2 }], catalog, 'transfer');
    expect(ok.totalCents).toBe(9000);
    expect(ok.lines[0]).toEqual({ code: 'child-seat', quantity: 2, cents: 2000 });

    expect(() =>
      totalWithExtras(7000, [{ code: 'child-seat', quantity: 4 }], catalog, 'transfer'),
    ).toThrow(BookingError);

    expect(() =>
      totalWithExtras(7000, [{ code: 'child-seat', quantity: 1 }], catalog, 'hourly'),
    ).toThrow(BookingError);
  });

  it('AC-01: inactive vip-security is rejected', () => {
    expect(() =>
      totalWithExtras(7000, ['vip-security'], [
        { code: 'vip-security', priceCents: 15000, active: false },
      ]),
    ).toThrow(BookingError);
    try {
      totalWithExtras(7000, ['vip-security'], [
        { code: 'vip-security', priceCents: 15000, active: false },
      ]);
    } catch (err) {
      expect((err as BookingError).code).toBe('invalid_request');
      expect((err as BookingError).field).toBe('extras');
    }
  });

  it('AC-01: rejectMoneyFields({ customer: { amount: 1 } }) throws', () => {
    expect(() => rejectMoneyFields({ customer: { amount: 1 } })).toThrow(BookingError);
  });

  it("AC-01: formatEuro(22000) === '€ 220.00'", () => {
    expect(formatEuro(22000)).toBe('€ 220.00');
  });
});

describe('AC-03 hourly hours limits', () => {
  const rate = { rateCents: 6000, minHours: 3, maxHours: 12 };

  it('AC-03: hours 2 and 13 rejected with min 3 / max 12', () => {
    for (const hours of [2, 13]) {
      try {
        quoteHourly({ ...rate, hours });
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(BookingError);
        expect((err as BookingError).code).toBe('invalid_request');
        expect((err as BookingError).stringKey).toBe('error.hours_range');
        expect((err as BookingError).vars).toEqual({ min: 3, max: 12 });
      }
    }
  });

  it('AC-03: hours 3 and 12 accepted', () => {
    expect(quoteHourly({ ...rate, hours: 3 })).toBe(18000);
    expect(quoteHourly({ ...rate, hours: 12 })).toBe(72000);
  });

  it('AC-03: hours 3.5, 0, -1 rejected', () => {
    for (const hours of [3.5, 0, -1]) {
      expect(() => quoteHourly({ ...rate, hours })).toThrow(BookingError);
    }
  });
});

describe('no_price', () => {
  it('quoteTransfer({ zonePriceCents: null }) throws no_price', () => {
    try {
      quoteTransfer({ zonePriceCents: null });
      expect.unreachable();
    } catch (err) {
      expect((err as BookingError).code).toBe('no_price');
    }
  });

  it('quoteHourly with null rate throws no_price', () => {
    try {
      quoteHourly({ rateCents: null, minHours: 3, maxHours: 12, hours: 4 });
      expect.unreachable();
    } catch (err) {
      expect((err as BookingError).code).toBe('no_price');
    }
  });
});
