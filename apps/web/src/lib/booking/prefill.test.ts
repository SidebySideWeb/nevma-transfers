import { describe, expect, it } from 'vitest';
import { parseBookingPrefill, quoteRequestBody } from './prefill';

const options = {
  zones: [
    { code: 'demo-airport' },
    { code: 'demo-port' },
    { code: 'demo-centre' },
  ],
  classes: [{ key: 'demo-e-class' }, { key: 'demo-v-class' }],
};

describe('parseBookingPrefill', () => {
  it('fills known from/to/class/type', () => {
    const r = parseBookingPrefill(
      {
        from: 'demo-airport',
        to: 'demo-port',
        class: 'demo-e-class',
        type: 'hourly',
      },
      options,
    );
    expect(r.search).toEqual({
      fromZone: 'demo-airport',
      toZone: 'demo-port',
      type: 'hourly',
    });
    expect(r.classKey).toBe('demo-e-class');
  });

  it('ignores unknown zones and classes silently', () => {
    const r = parseBookingPrefill(
      {
        from: 'not-a-zone',
        to: 'demo-port',
        class: 'nope',
        type: 'transfer',
      },
      options,
    );
    expect(r.search.fromZone).toBeUndefined();
    expect(r.search.toZone).toBe('demo-port');
    expect(r.search.type).toBe('transfer');
    expect(r.classKey).toBeNull();
  });

  it('ignores malformed type and non-numeric hours', () => {
    const r = parseBookingPrefill(
      { type: 'limo', hours: 'abc', passengers: '-1' },
      options,
    );
    expect(r.search.type).toBeUndefined();
    expect(r.search.hours).toBeUndefined();
    expect(r.search.passengers).toBeUndefined();
  });

  it('strips seconds from prefilled time', () => {
    const r = parseBookingPrefill(
      { date: '2026-11-05', time: '10:00:00', from: 'demo-airport' },
      options,
    );
    expect(r.search.pickupLocal).toBe('2026-11-05T10:00');
  });

  it('never copies price / amount / total query fields into search', () => {
    const r = parseBookingPrefill(
      {
        from: 'demo-airport',
        to: 'demo-port',
        price: '75',
        amount: '7500',
        total: '90',
        baseCents: '7000',
      },
      options,
    );
    expect(r.search).toEqual({
      fromZone: 'demo-airport',
      toZone: 'demo-port',
    });
    expect(JSON.stringify(r)).not.toMatch(/price|amount|total|baseCents/i);
  });
});

describe('quoteRequestBody', () => {
  it('builds transfer/hourly bodies without money fields', () => {
    const transfer = quoteRequestBody({
      type: 'transfer',
      fromZone: 'demo-airport',
      toZone: 'demo-port',
      hours: 3,
      pickupLocal: '2026-12-01T10:00',
      passengers: 2,
      luggage: 2,
    });
    expect(transfer).toEqual({
      type: 'transfer',
      fromZone: 'demo-airport',
      toZone: 'demo-port',
      pickupLocal: '2026-12-01T10:00',
      passengers: 2,
      luggage: 2,
    });
    expect(Object.keys(transfer)).not.toEqual(
      expect.arrayContaining(['price', 'amount', 'total', 'baseCents']),
    );

    const hourly = quoteRequestBody(
      {
        type: 'hourly',
        fromZone: 'demo-airport',
        toZone: '',
        hours: 4,
        pickupLocal: '2026-12-01T10:00',
        passengers: 2,
        luggage: 1,
      },
      'demo-e-class',
    );
    expect(hourly).toMatchObject({
      type: 'hourly',
      fromZone: 'demo-airport',
      hours: 4,
      classKey: 'demo-e-class',
    });
    expect(JSON.stringify(hourly)).not.toMatch(/"price"|"amount"|"total"/);
  });
});
