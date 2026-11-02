import { describe, expect, it } from 'vitest';
import { busyOverlap, classifyDriverOffer, expiresWithinDays, rangesOverlap } from './free-drivers';

const day = (h: number, m = 0) => Date.parse(`2027-06-15T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+03:00`);

describe('free-drivers', () => {
  it('detects overlap including buffer-style ranges', () => {
    expect(rangesOverlap({ startMs: day(9), endMs: day(11) }, { startMs: day(10, 30), endMs: day(12) })).toBe(true);
    expect(rangesOverlap({ startMs: day(9), endMs: day(10) }, { startMs: day(10), endMs: day(11) })).toBe(false);
  });

  it('marks a driver busy when another live booking overlaps', () => {
    const bookings = [
      {
        driverId: 'd1',
        reference: 'ELP-AAAAAA',
        status: 'confirmed',
        startMs: day(9),
        endMs: day(11),
      },
    ];
    const clash = busyOverlap({ startMs: day(10), endMs: day(12) }, bookings, 'd1');
    expect(clash?.reference).toBe('ELP-AAAAAA');

    const offer = classifyDriverOffer({
      driverId: 'd1',
      fullName: 'Alex',
      onShift: true,
      licenceExpiresOn: null,
      tripStartMs: day(10),
      tripEndMs: day(12),
      bookings,
    });
    expect(offer.disabled).toBe(true);
    expect(offer.meta).toMatch(/^busy /);
  });

  it('shows on shift · free when free', () => {
    const offer = classifyDriverOffer({
      driverId: 'd1',
      fullName: 'Alex',
      onShift: true,
      licenceExpiresOn: null,
      tripStartMs: day(14),
      tripEndMs: day(16),
      bookings: [],
    });
    expect(offer.disabled).toBe(false);
    expect(offer.meta).toBe('on shift · free');
  });

  it('adds licence warning but keeps selectable when expiry is after the trip day', () => {
    const offer = classifyDriverOffer({
      driverId: 'd1',
      fullName: 'Chris',
      onShift: false,
      licenceExpiresOn: '2027-06-20',
      tripStartMs: day(10),
      tripEndMs: day(12),
      bookings: [],
      nowMs: Date.parse('2027-06-01T12:00:00+03:00'),
    });
    expect(offer.disabled).toBe(false);
    expect(offer.meta).toMatch(/licence expires/);
  });

  it('expiresWithinDays flags documents in the window', () => {
    expect(expiresWithinDays('2027-06-10', 30, Date.parse('2027-06-01T12:00:00+03:00'))).toBe(true);
    expect(expiresWithinDays('2028-01-01', 30, Date.parse('2027-06-01T12:00:00+03:00'))).toBe(false);
  });
});
