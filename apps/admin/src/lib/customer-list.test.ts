import { describe, expect, it } from 'vitest';
import {
  buildCustomerSearchOr,
  csvHasNotesColumn,
  customersToCsv,
  escapeIlike,
} from './customer-list';

describe('customer list search filter', () => {
  it('escapes ILIKE wildcards so % and _ are literal', () => {
    expect(escapeIlike('100%_off')).toBe('100\\%\\_off');
    const or = buildCustomerSearchOr('acme%_co');
    expect(or).toContain('acme\\%\\_co');
    expect(or).not.toMatch(/ilike\.\*%\*/);
  });

  it('strips PostgREST-breaking characters and returns null when too short', () => {
    expect(buildCustomerSearchOr('a')).toBeNull();
    expect(buildCustomerSearchOr('  x  ')).toBeNull();
    const or = buildCustomerSearchOr('ann, (vip)');
    expect(or).toMatch(/^name\.ilike\.\*ann vip\*/);
    expect(or).not.toContain('(');
  });

  it('never embeds raw user SQL operators', () => {
    const evil = "'; drop table customers; --";
    const or = buildCustomerSearchOr(evil)!;
    expect(or.startsWith('name.ilike.')).toBe(true);
    expect(or).not.toContain(';');
    // Every clause is an ilike filter — no free-standing SQL statements.
    expect(or.split(',').every((part) => part.includes('.ilike.'))).toBe(true);
  });
});

describe('customers CSV', () => {
  it('has no notes column', () => {
    const csv = customersToCsv([
      {
        id: '1',
        name: 'Ada',
        email: 'ada@example.com',
        phone: '+30',
        company: null,
        bookings_count: 2,
        last_pickup_at: '2026-12-01T10:00:00+02:00',
        has_vip_security: true,
        paid_cents: 52000,
      },
    ]);
    expect(csvHasNotesColumn(csv)).toBe(false);
    expect(csv.split('\n')[0]).toBe(
      'name,email,phone,company,bookings_count,last_pickup_at,paid_cents,has_vip_security',
    );
    expect(csv).toContain('Ada');
    expect(csv).not.toMatch(/notes/i);
  });
});
