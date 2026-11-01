import { describe, expect, it } from 'vitest';
import {
  applyBookingsTab,
  parseBookingsTab,
  resolveListLoad,
  type BookingsTab,
} from './bookings-list';

function fakeQuery() {
  const calls: string[] = [];
  const q = {
    calls,
    eq(col: string, val: unknown) {
      calls.push(`eq:${col}:${String(val)}`);
      return q;
    },
    in(col: string, vals: string[]) {
      calls.push(`in:${col}:${vals.join('|')}`);
      return q;
    },
    is(col: string, val: null) {
      calls.push(`is:${col}:${val}`);
      return q;
    },
    gte(col: string, val: string) {
      calls.push(`gte:${col}:${val}`);
      return q;
    },
    lt(col: string, val: string) {
      calls.push(`lt:${col}:${val}`);
      return q;
    },
    gt(col: string, val: string) {
      calls.push(`gt:${col}:${val}`);
      return q;
    },
    or(filter: string) {
      calls.push(`or:${filter}`);
      return q;
    },
  };
  return q;
}

describe('parseBookingsTab', () => {
  it('defaults to upcoming', () => {
    expect(parseBookingsTab(new URLSearchParams())).toBe('upcoming');
  });

  it('reads tab= and legacy needs_vehicle / status', () => {
    expect(parseBookingsTab(new URLSearchParams('tab=all'))).toBe('all');
    expect(parseBookingsTab(new URLSearchParams('needs_vehicle=1'))).toBe('need_vehicle');
    expect(parseBookingsTab(new URLSearchParams('status=pending'))).toBe('pending');
    expect(parseBookingsTab(new URLSearchParams('status=completed'))).toBe('past');
    expect(parseBookingsTab(new URLSearchParams('status=active'))).toBe('upcoming');
  });
});

describe('applyBookingsTab', () => {
  const now = '2026-11-01T12:00:00.000Z';

  const cases: { tab: BookingsTab; expect: string[]; ascending: boolean }[] = [
    {
      tab: 'upcoming',
      expect: ['in:status:confirmed|assigned', `gte:pickup_at:${now}`],
      ascending: true,
    },
    {
      tab: 'need_vehicle',
      expect: ['eq:status:confirmed', 'is:vehicle_id:null'],
      ascending: true,
    },
    {
      tab: 'pending',
      expect: ['eq:status:pending', `gt:hold_expires_at:${now}`],
      ascending: true,
    },
    {
      tab: 'past',
      expect: [`or:pickup_at.lt."${now}",status.eq.expired`],
      ascending: false,
    },
    { tab: 'cancelled', expect: ['eq:status:cancelled'], ascending: false },
    { tab: 'all', expect: [], ascending: false },
  ];

  for (const c of cases) {
    it(`filters ${c.tab}`, () => {
      const q = fakeQuery();
      const out = applyBookingsTab(q, c.tab, now);
      expect(out.ascending).toBe(c.ascending);
      expect(q.calls).toEqual(c.expect);
    });
  }
});

describe('resolveListLoad (bookings loader)', () => {
  it('returns an error result instead of an empty list', () => {
    const result = resolveListLoad('bookings', null, {
      message: 'column bookings.source does not exist',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(
        'Could not load bookings: column bookings.source does not exist',
      );
    }
  });

  it('returns rows when there is no error', () => {
    const result = resolveListLoad('bookings', [{ id: '1' }], null);
    expect(result).toEqual({ ok: true, rows: [{ id: '1' }] });
  });

  it('treats null data with no error as empty rows', () => {
    expect(resolveListLoad('bookings', null, null)).toEqual({ ok: true, rows: [] });
  });
});
