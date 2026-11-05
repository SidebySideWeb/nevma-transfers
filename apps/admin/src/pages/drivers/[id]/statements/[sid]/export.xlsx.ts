import type { APIRoute } from 'astro';
import { isDriversEnabled } from '../../../../../lib/features';
import { statementExcel } from '../../../../../lib/report-export';
import { createSupabaseServerClient } from '../../../../../lib/supabase';

export const prerender = false;

export const GET: APIRoute = async ({ locals, cookies, params }) => {
  if (!isDriversEnabled()) {
    return new Response(null, { status: 404, statusText: 'Not Found' });
  }
  if (!locals.staff) {
    return new Response('Unauthorized', { status: 401 });
  }
  const driverId = params.id!;
  const sid = params.sid!;
  const supabase = createSupabaseServerClient(cookies);
  const [{ data: st }, { data: driver }, { data: lines }] = await Promise.all([
    supabase.from('driver_statements').select('*').eq('id', sid).eq('driver_id', driverId).maybeSingle(),
    supabase.from('drivers').select('full_name').eq('id', driverId).maybeSingle(),
    supabase
      .from('driver_statement_lines')
      .select('kind, on_date, reference, description, quantity, rate_cents, amount_cents')
      .eq('statement_id', sid)
      .order('on_date')
      .order('kind'),
  ]);
  if (!st || !driver) return new Response('Not found', { status: 404 });
  const buf = await statementExcel(lines ?? [], driver.full_name, st.period_from, st.period_to);
  const name = `statement_${driver.full_name.replace(/\s+/g, '-')}_${st.period_from}_${st.period_to}.xlsx`;
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
};
