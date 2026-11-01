import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export const CUSTOMER_SEARCH_LIMIT = 8;

export type CustomerHit = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  vat: string | null;
  tax_office: string | null;
  address: string | null;
  bookings_count: number;
  last_booking_at: string | null;
};

/** Staff only. Name, e-mail or phone contains the text; top 8 by number of bookings. */
export async function searchCustomerRows(
  supabase: SupabaseClient<Database>,
  staff: { userId: string } | undefined,
  rawQuery: string,
): Promise<CustomerHit[]> {
  if (!staff) throw new Error('unauthorized');
  // Commas, parentheses and wildcards would break the PostgREST `or` filter.
  const q = rawQuery.replace(/[%*,()\\"']/g, ' ').trim();
  if (q.length < 2) return [];
  const pattern = `*${q}*`;
  const { data, error } = await supabase
    .from('customers')
    .select(
      'id, name, email, phone, company, vat_number, tax_office, address, bookings_count, last_booking_at',
    )
    .or(`name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`)
    .order('bookings_count', { ascending: false })
    .limit(CUSTOMER_SEARCH_LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []).slice(0, CUSTOMER_SEARCH_LIMIT).map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    company: c.company,
    vat: c.vat_number,
    tax_office: c.tax_office,
    address: c.address,
    bookings_count: c.bookings_count,
    last_booking_at: c.last_booking_at,
  }));
}
