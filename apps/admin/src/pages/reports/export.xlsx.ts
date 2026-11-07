import type { APIRoute } from 'astro';
import { features } from '@tem/features';
import {
  bookingsDayExcel,
  driverPayExcel,
  reportFileBase,
  vehicleUsageExcel,
  type BookingsDayRow,
  type DriverPayRow,
  type ReportTab,
  type VehicleUsageRow,
} from '../../lib/report-export';
import { resolvePeriod, type PeriodKind } from '../../lib/report-period';
import { createSupabaseServerClient } from '../../lib/supabase';

export const prerender = false;

export const GET: APIRoute = async ({ locals, cookies, url }) => {
  if (!features().drivers) {
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
  let buf: Buffer;
  if (tab === 'pay') {
    const { data, error } = await supabase.rpc('report_driver_pay', { p_from: from, p_to: to });
    if (error) return new Response('Export failed', { status: 500 });
    buf = await driverPayExcel((data ?? []) as DriverPayRow[], from, to);
  } else if (tab === 'vehicles') {
    const { data, error } = await supabase.rpc('report_vehicle_usage', { p_from: from, p_to: to });
    if (error) return new Response('Export failed', { status: 500 });
    buf = await vehicleUsageExcel((data ?? []) as VehicleUsageRow[], from, to);
  } else {
    const { data, error } = await supabase.rpc('report_bookings_per_day', { p_from: from, p_to: to });
    if (error) return new Response('Export failed', { status: 500 });
    buf = await bookingsDayExcel((data ?? []) as BookingsDayRow[], from, to);
  }
  const name = `${reportFileBase(tab, from, to)}.xlsx`;
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
};
