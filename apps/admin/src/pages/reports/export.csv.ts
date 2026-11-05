import type { APIRoute } from 'astro';
import { isDriversEnabled } from '../../lib/features';
import {
  bookingsDayCsv,
  driverPayCsv,
  reportFileBase,
  vehicleUsageCsv,
  type BookingsDayRow,
  type DriverPayRow,
  type ReportTab,
  type VehicleUsageRow,
} from '../../lib/report-export';
import { resolvePeriod, type PeriodKind } from '../../lib/report-period';
import { createSupabaseServerClient } from '../../lib/supabase';

export const prerender = false;

export const GET: APIRoute = async ({ locals, cookies, url }) => {
  if (!isDriversEnabled()) {
    return new Response(null, { status: 404, statusText: 'Not Found' });
  }
  if (!locals.staff) {
    return new Response('Unauthorized', { status: 401 });
  }
  const tab = (url.searchParams.get('tab') ?? 'pay') as ReportTab;
  const kind = (url.searchParams.get('period') ?? 'month') as PeriodKind;
  let from: string;
  let to: string;
  try {
    ({ from, to } = resolvePeriod(
      kind,
      url.searchParams.get('from'),
      url.searchParams.get('to'),
    ));
  } catch {
    return new Response('Invalid period', { status: 400 });
  }
  const supabase = createSupabaseServerClient(cookies);
  let body = '';
  if (tab === 'pay') {
    const { data, error } = await supabase.rpc('report_driver_pay', { p_from: from, p_to: to });
    if (error) return new Response('Export failed', { status: 500 });
    body = driverPayCsv((data ?? []) as DriverPayRow[]);
  } else if (tab === 'vehicles') {
    const { data, error } = await supabase.rpc('report_vehicle_usage', { p_from: from, p_to: to });
    if (error) return new Response('Export failed', { status: 500 });
    body = vehicleUsageCsv((data ?? []) as VehicleUsageRow[]);
  } else {
    const { data, error } = await supabase.rpc('report_bookings_per_day', { p_from: from, p_to: to });
    if (error) return new Response('Export failed', { status: 500 });
    body = bookingsDayCsv((data ?? []) as BookingsDayRow[]);
  }
  const name = `${reportFileBase(tab, from, to)}.csv`;
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
};
