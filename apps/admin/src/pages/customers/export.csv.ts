import type { APIRoute } from 'astro';
import {
  buildCustomerSearchOr,
  customerSortColumn,
  customersToCsv,
  parseCustomerSort,
  type CustomerSummaryRow,
} from '../../lib/customer-list';
import { createSupabaseServerClient } from '../../lib/supabase';

export const prerender = false;

/** Staff-only CSV of the current customers filter. Never includes notes. */
export const GET: APIRoute = async ({ locals, cookies, url }) => {
  if (!locals.staff) {
    return new Response('Unauthorized', { status: 401 });
  }
  const supabase = createSupabaseServerClient(cookies);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const sort = parseCustomerSort(url.searchParams.get('sort'));
  const vipOnly = url.searchParams.get('vip') === '1';
  const { column, ascending } = customerSortColumn(sort);

  let query = supabase
    .from('customer_summaries')
    .select(
      'id, name, email, phone, company, bookings_count, last_pickup_at, has_vip_security, paid_cents',
    );
  const orFilter = buildCustomerSearchOr(q);
  if (orFilter) query = query.or(orFilter);
  if (vipOnly) query = query.eq('has_vip_security', true);
  query = query.order(column, { ascending, nullsFirst: false }).limit(5000);

  const { data, error } = await query;
  if (error) {
    return new Response('Export failed', { status: 500 });
  }

  const rows: CustomerSummaryRow[] = (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    company: c.company,
    bookings_count: c.bookings_count ?? 0,
    last_pickup_at: c.last_pickup_at,
    has_vip_security: c.has_vip_security ?? false,
    paid_cents: c.paid_cents ?? 0,
  }));

  const body = customersToCsv(rows);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="customers.csv"',
      'Cache-Control': 'no-store',
    },
  });
};
