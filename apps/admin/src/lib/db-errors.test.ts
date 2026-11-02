import { describe, expect, it } from 'vitest';
import { mapDbError } from './db-errors';

describe('mapDbError', () => {
  it('strips in_use: and has_future_bookings: prefixes', () => {
    expect(mapDbError({ message: 'in_use: this class has vehicles or bookings; switch it offline instead' })).toBe(
      'this class has vehicles or bookings; switch it offline instead',
    );
    expect(
      mapDbError({ message: 'has_future_bookings: SEDAN-1 has 3 future booking(s); move them to another vehicle first' }),
    ).toBe('SEDAN-1 has 3 future booking(s); move them to another vehicle first');
  });

  it('maps 23505 on vehicles_label_key', () => {
    expect(
      mapDbError({
        code: '23505',
        message: 'duplicate key value violates unique constraint "vehicles_label_key"',
        constraint: 'vehicles_label_key',
      }),
    ).toBe('That label is already used');
  });

  it('maps drivers email unique and missing drivers / columns', () => {
    expect(
      mapDbError({
        code: '23505',
        message: 'duplicate key value violates unique constraint "drivers_email_key"',
        constraint: 'drivers_email_key',
      }),
    ).toBe('A driver with that e-mail already exists.');
    expect(
      mapDbError({
        message: 'Could not find the table \'public.drivers\' in the schema cache',
      }),
    ).toMatch(/migration 0019/i);
    expect(
      mapDbError({
        message: 'column vehicles.note does not exist',
      }),
    ).toMatch(/migrations/i);
  });

  it('maps 23514 to the field validation text', () => {
    expect(
      mapDbError(
        { code: '23514', message: 'new row for relation "vehicle_classes" violates check constraint' },
        'Lower-case letters, numbers and hyphens.',
      ),
    ).toBe('Lower-case letters, numbers and hyphens.');
  });

  it('never returns raw SQL for unknown errors', () => {
    const msg = mapDbError({
      code: 'XX000',
      message: 'ERROR: relation "vehicles" does not exist at character 15',
    });
    expect(msg).not.toMatch(/relation|character|ERROR:/i);
    expect(msg.length).toBeGreaterThan(10);
  });

  it('shows the text after driver rule codes', () => {
    expect(mapDbError({ message: 'driver_inactive: this driver is not active' })).toBe(
      'this driver is not active',
    );
    expect(mapDbError({ message: 'already_on_shift: end your current day first' })).toBe(
      'end your current day first',
    );
    expect(mapDbError({ message: 'vehicle_in_use: another driver has this vehicle' })).toBe(
      'another driver has this vehicle',
    );
    expect(mapDbError({ message: 'vehicle_unavailable: this vehicle is not in service' })).toBe(
      'this vehicle is not in service',
    );
    expect(mapDbError({ message: 'no_shift: start your day with a vehicle first' })).toBe(
      'start your day with a vehicle first',
    );
    expect(mapDbError({ message: 'invalid_transition: scheduled to completed' })).toBe(
      'scheduled to completed',
    );
    expect(mapDbError({ message: 'statement_locked: this statement is approved and cannot be recalculated' })).toBe(
      'this statement is approved and cannot be recalculated',
    );
    expect(mapDbError({ message: 'forbidden: not your booking' })).toBe('not your booking');
  });

  it('maps 23P01 driver overlaps to plain sentences', () => {
    expect(
      mapDbError({
        code: '23P01',
        message: 'conflicting key value violates exclusion constraint "bookings_no_driver_overlap"',
        constraint: 'bookings_no_driver_overlap',
      }),
    ).toBe('That driver is on another booking at that time');

    expect(
      mapDbError(
        {
          code: '23P01',
          message: 'conflicting key value violates exclusion constraint "bookings_no_driver_overlap"',
          constraint: 'bookings_no_driver_overlap',
        },
        { driverName: 'Alex Driver' },
      ),
    ).toBe('Alex Driver is on another booking at that time');

    expect(
      mapDbError(
        {
          code: '23P01',
          message: 'conflicting key value violates exclusion constraint "bookings_no_driver_overlap"',
          constraint: 'bookings_no_driver_overlap',
        },
        { driverName: 'Alex Driver', clashReference: 'ELP-AAAAAA' },
      ),
    ).toBe('Alex Driver is on ELP-AAAAAA at that time');

    expect(
      mapDbError({
        code: '23P01',
        constraint: 'driver_shifts_driver_overlap',
        message: 'exclusion',
      }),
    ).toBe('This driver already has a shift that overlaps that time.');

    expect(
      mapDbError({
        code: '23P01',
        constraint: 'driver_shifts_vehicle_overlap',
        message: 'exclusion',
      }),
    ).toBe('That vehicle is already on a shift that overlaps that time.');

    expect(
      mapDbError({
        code: '23P01',
        constraint: 'driver_pay_plans_no_overlap',
        message: 'exclusion',
      }),
    ).toBe('This pay plan overlaps another plan for the same driver.');

    expect(
      mapDbError({
        code: '23P01',
        constraint: 'driver_statements_no_overlap',
        message: 'exclusion',
      }),
    ).toBe('This statement period overlaps another statement for the same driver.');
  });
});
