import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CUSTOMER_SEARCH_LIMIT, searchCustomerRows } from './customer-search';
import type { Database } from './database.types';

/** Minimal chainable stand-in for the PostgREST builder; records what was asked. */
function fakeClient(rows: unknown[]) {
  const calls: Record<string, unknown> = {};
  const builder = {
    select: () => builder,
    or: (f: string) => ((calls.or = f), builder),
    order: () => builder,
    limit: (n: number) => ((calls.limit = n), builder),
    then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
  };
  const client = { from: () => builder } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

const row = (i: number) => ({
  id: `id-${i}`,
  name: `Customer ${i}`,
  email: `c${i}@example.com`,
  phone: null,
  company: null,
  vat_number: null,
  tax_office: null,
  address: null,
  bookings_count: i,
  last_booking_at: null,
});

describe('searchCustomers', () => {
  it('requires a staff session', async () => {
    const { client } = fakeClient([row(1)]);
    await expect(searchCustomerRows(client, undefined, 'anna')).rejects.toThrow('unauthorized');
  });

  it('returns at most 8 matches and asks the database for 8', async () => {
    const { client, calls } = fakeClient(Array.from({ length: 20 }, (_, i) => row(i)));
    const hits = await searchCustomerRows(client, { userId: 'u' }, 'cust');
    expect(hits.length).toBeLessThanOrEqual(CUSTOMER_SEARCH_LIMIT);
    expect(calls.limit).toBe(8);
    expect(hits[0]).toMatchObject({ id: 'id-0', vat: null, bookings_count: 0 });
  });

  it('ignores one-letter queries and strips characters that break the filter', async () => {
    const { client, calls } = fakeClient([row(1)]);
    expect(await searchCustomerRows(client, { userId: 'u' }, ' a ')).toEqual([]);
    await searchCustomerRows(client, { userId: 'u' }, 'an,na(x)');
    expect(calls.or).toBe('name.ilike.*an na x*,email.ilike.*an na x*,phone.ilike.*an na x*');
  });
});
