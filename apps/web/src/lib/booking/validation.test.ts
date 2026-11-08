import { describe, expect, it } from 'vitest';
import { BookingError } from './types';
import {
  BookingRequest,
  CancelRequest,
  HoldRequest,
  QuoteRequest,
  QuoteRequestDistance,
  rejectMoneyFields,
} from './validation';

describe('zod request schemas', () => {
  it('parses a transfer quote and rejects unknown keys', () => {
    const parsed = QuoteRequest.parse({
      type: 'transfer',
      fromZone: 'demo-airport',
      toZone: 'demo-centre',
      pickupLocal: '2026-12-01T10:00',
      passengers: 2,
      luggage: 2,
    });
    expect(parsed.type).toBe('transfer');
    expect(() =>
      QuoteRequest.parse({
        type: 'transfer',
        fromZone: 'demo-airport',
        toZone: 'demo-centre',
        pickupLocal: '2026-12-01T10:00',
        passengers: 2,
        luggage: 2,
        surprise: true,
      }),
    ).toThrow();
  });

  it('accepts Places on a transfer quote (B4b widget)', () => {
    const parsed = QuoteRequest.parse({
      type: 'transfer',
      fromZone: 'demo-airport',
      toZone: 'demo-centre',
      pickupLocal: '2026-12-01T10:00',
      passengers: 2,
      luggage: 2,
      pickupPlace: { placeId: 'ChIJabcdefghij', lat: 37.93, lng: 23.94 },
      dropoffPlace: { placeId: 'ChIJklmnopqrst', lat: 37.97, lng: 23.73 },
      return: { pickupLocal: '2026-12-08T19:30' },
    });
    expect(parsed.type).toBe('transfer');
    if (parsed.type === 'transfer') {
      expect(parsed.pickupPlace?.placeId).toBe('ChIJabcdefghij');
      expect(parsed.return?.pickupLocal).toBe('2026-12-08T19:30');
    }
  });

  it('FIX-2 distance quote: zones are optional, places are required, placeId is optional', () => {
    const base = {
      type: 'transfer' as const,
      pickupLocal: '2026-12-01T10:00',
      passengers: 2,
      luggage: 1,
    };
    const ok = QuoteRequestDistance.parse({
      ...base,
      pickupPlace: { lat: 37.95, lng: 23.71, address: 'Hilton Garden Inn' },
      dropoffPlace: { placeId: 'ChIJklmnopqrst', lat: 37.69, lng: 24.05 },
    });
    expect(ok.type).toBe('transfer');
    // no places → rejected by the distance schema, accepted by the zones schema
    expect(() => QuoteRequestDistance.parse(base)).toThrow();
    expect(QuoteRequest.parse({ ...base, fromZone: 'a', toZone: 'b' }).type).toBe('transfer');
    // hourly needs only the pick-up place
    expect(
      QuoteRequestDistance.parse({
        type: 'hourly',
        hours: 4,
        pickupLocal: '2026-12-01T10:00',
        passengers: 2,
        luggage: 0,
        pickupPlace: { lat: 37.95, lng: 23.71 },
      }).type,
    ).toBe('hourly');
    // a place without coordinates is invalid
    expect(() =>
      QuoteRequestDistance.parse({
        ...base,
        pickupPlace: { placeId: 'ChIJabcdefghij' },
        dropoffPlace: { lat: 37.69, lng: 24.05 },
      }),
    ).toThrow();
  });

  it('parses an hourly hold request', () => {
    const parsed = HoldRequest.parse({
      type: 'hourly',
      fromZone: 'demo-centre',
      hours: 4,
      pickupLocal: '2026-12-01T10:00',
      passengers: 2,
      luggage: 2,
      classKey: 'demo-e-class',
      turnstileToken: 'tok',
    });
    expect(parsed.type).toBe('hourly');
  });

  it('parses booking and cancel bodies', () => {
    expect(
      BookingRequest.parse({
        holdId: '00000000-0000-4000-8000-000000000001',
        pickupAddress: 'Street 1, Athens',
        dropoffAddress: 'Street 2, Athens',
        passengers: 2,
        luggage: 2,
        extras: ['vip-security'],
        customer: { name: 'Full Name', email: 'name@example.com', phone: '+30 690 000 0000' },
        consent: true,
        turnstileToken: 'tok',
      }).consent,
    ).toBe(true);

    expect(
      CancelRequest.parse({ token: 'abc', turnstileToken: 'tok' }).token,
    ).toBe('abc');
  });
});

describe('AC-01 rejectMoneyFields', () => {
  it('rejects nested price/amount/total and *Cents keys', () => {
    expect(() => rejectMoneyFields({ price: 1 })).toThrow(BookingError);
    expect(() => rejectMoneyFields({ total: 1 })).toThrow(BookingError);
    expect(() => rejectMoneyFields({ baseCents: 1 })).toThrow(BookingError);
    expect(() => rejectMoneyFields({ ok: true })).not.toThrow();
  });
});
