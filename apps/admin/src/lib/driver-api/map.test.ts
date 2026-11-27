import { describe, expect, it } from 'vitest';
import { mapJob } from './map';

describe('driver-api map', () => {
  it('maps voucher_code onto voucherCode (null when blank)', () => {
    const base = {
      reference: 'EP-TEST01',
      booking_type: 'transfer',
      status: 'assigned',
      trip_status: 'scheduled',
      pickup_at: '2026-12-01T10:00:00+02:00',
      ends_at: '2026-12-01T10:45:00+02:00',
      from_zone: 'Airport',
      to_zone: 'Centre',
      pickup_address: 'Arrivals',
      dropoff_address: 'Hotel',
      hours: null,
      flight_number: null,
      passengers: 2,
      luggage: 2,
      customer_name: 'Pat',
      customer_phone: null,
      notes: null,
      class_name: 'E-Class',
      vehicle_label: 'E1',
      vip_security: false,
      extras: [] as string[],
    };

    expect(mapJob({ ...base, voucher_code: 'EMP-2026-TEST' }).voucherCode).toBe('EMP-2026-TEST');
    expect(mapJob({ ...base, voucher_code: '  ' }).voucherCode).toBeNull();
    expect(mapJob({ ...base, voucher_code: null }).voucherCode).toBeNull();
    expect(mapJob(base).voucherCode).toBeNull();
  });
});
