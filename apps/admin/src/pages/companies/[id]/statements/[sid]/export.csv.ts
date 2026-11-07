import type { APIRoute } from 'astro';
import { corporateDb, corporateNotFound, statementToCsv, type StatementLine } from '../../../../../lib/corporate';
import { createSupabaseServerClient } from '../../../../../lib/supabase';
import { athensLocalToInstant } from '../../../../../lib/time';

export const prerender = false;

const nextDay = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** Staff-only CSV of one company statement: its on-account bookings in the period. */
export const GET: APIRoute = async ({ locals, cookies, params }) => {
  const denied = corporateNotFound();
  if (denied) return denied;
  if (!locals.staff) return new Response('Unauthorized', { status: 401 });

  const companyId = params.id!;
  const sid = params.sid!;
  const supabase = corporateDb(createSupabaseServerClient(cookies));
  const { data: st } = await supabase
    .from('company_statements')
    .select('id, period_from, period_to, total_cents, status')
    .eq('id', sid)
    .eq('company_id', companyId)
    .maybeSingle();
  if (!st) return new Response('Not found', { status: 404 });

  const { data, error } = await supabase
    .from('bookings')
    .select('reference, pickup_at, guest_name, cost_center, price_cents')
    .eq('company_id', companyId)
    .eq('payment_method', 'on_account')
    .not('status', 'in', '(cancelled,expired)')
    .gte('pickup_at', athensLocalToInstant(`${st.period_from}T00:00`).toISOString())
    .lt('pickup_at', athensLocalToInstant(`${nextDay(st.period_to)}T00:00`).toISOString())
    .order('pickup_at');
  if (error) return new Response('Export failed', { status: 500 });

  const lines = (data ?? []) as StatementLine[];
  const total =
    st.status === 'draft' ? lines.reduce((sum, l) => sum + l.price_cents, 0) : (st.total_cents as number);
  return new Response(statementToCsv(lines, total), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="statement_${st.period_from}_${st.period_to}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
};
