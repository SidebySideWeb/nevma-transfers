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
});
