import type { APIContext } from 'astro';
import { Temporal } from '@js-temporal/polyfill';
import { ATHENS } from '../time';
import { requireDriverAuth, earningsVisible, type DriverClient } from './auth';
import { corsHeaders, mergeCors, preflight } from './cors';
import { jsonError, mapDbErrorToResponse, notADriver, rateLimited } from './errors';
import { mapEarningLine, mapJob, mapShift, mapVehicle } from './map';

async function assertRateLimit(client: DriverClient, userId: string): Promise<Response | null> {
  const { data, error } = await client.rpc('hit_rate_limit', {
    p_key: `driver:${userId}`,
    p_window_seconds: 60,
    p_max: 60,
  });
  if (error) return mapDbErrorToResponse(error);
  if (data === false) return rateLimited();
  return null;
}

async function ensureDriver(client: DriverClient): Promise<Response | Record<string, unknown> | null> {
  const { data, error } = await client.rpc('driver_me');
  if (error) return mapDbErrorToResponse(error);
  if (data == null) return notADriver();
  return data as Record<string, unknown>;
}

function athensToday(): string {
  return Temporal.Now.zonedDateTimeISO(ATHENS).toPlainDate().toString();
}

function jsonOk(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

type Authed = { client: DriverClient; userId: string; cors: Headers };

async function begin(request: Request): Promise<{ ok: true; ctx: Authed } | { ok: false; response: Response }> {
  if (request.method === 'OPTIONS') {
    return { ok: false, response: preflight(request) };
  }
  const auth = await requireDriverAuth(request);
  const cors = corsHeaders(request);
  if (!auth.ok) {
    return { ok: false, response: mergeCors(auth.response, request) };
  }
  const limited = await assertRateLimit(auth.client, auth.user.id);
  if (limited) return { ok: false, response: mergeCors(limited, request) };
  return { ok: true, ctx: { client: auth.client, userId: auth.user.id, cors } };
}

function finish(response: Response, request: Request): Response {
  return mergeCors(response, request);
}

export async function handleMe(ctx: APIContext): Promise<Response> {
  const started = await begin(ctx.request);
  if (!started.ok) return started.response;
  const me = await ensureDriver(started.ctx.client);
  if (me instanceof Response) return finish(me, ctx.request);
  return finish(jsonOk(me), ctx.request);
}

export async function handleVehicles(ctx: APIContext): Promise<Response> {
  const started = await begin(ctx.request);
  if (!started.ok) return started.response;
  const me = await ensureDriver(started.ctx.client);
  if (me instanceof Response) return finish(me, ctx.request);
  const { data, error } = await started.ctx.client.rpc('driver_vehicles');
  if (error) return finish(mapDbErrorToResponse(error), ctx.request);
  return finish(jsonOk((data ?? []).map(mapVehicle)), ctx.request);
}

export async function handleShiftStart(ctx: APIContext): Promise<Response> {
  const started = await begin(ctx.request);
  if (!started.ok) return started.response;
  const me = await ensureDriver(started.ctx.client);
  if (me instanceof Response) return finish(me, ctx.request);
  let body: { vehicleId?: string; odometer?: number };
  try {
    body = (await ctx.request.json()) as typeof body;
  } catch {
    return finish(jsonError(400, 'invalid_request', 'Send JSON with vehicleId.'), ctx.request);
  }
  if (!body.vehicleId) {
    return finish(jsonError(400, 'invalid_request', 'vehicleId is required.'), ctx.request);
  }
  const { data, error } = await started.ctx.client.rpc('driver_start_shift', {
    p_vehicle_id: body.vehicleId,
    ...(typeof body.odometer === 'number' ? { p_odometer: body.odometer } : {}),
  });
  if (error) return finish(mapDbErrorToResponse(error), ctx.request);
  return finish(jsonOk(mapShift(data!), 201), ctx.request);
}

export async function handleShiftEnd(ctx: APIContext): Promise<Response> {
  const started = await begin(ctx.request);
  if (!started.ok) return started.response;
  let odometer: number | undefined;
  if (ctx.request.headers.get('content-type')?.includes('application/json')) {
    try {
      const body = (await ctx.request.json()) as { odometer?: number };
      if (typeof body.odometer === 'number') odometer = body.odometer;
    } catch {
      /* empty body ok */
    }
  }
  const { data, error } = await started.ctx.client.rpc('driver_end_shift', {
    ...(odometer !== undefined ? { p_odometer: odometer } : {}),
  });
  if (error) return finish(mapDbErrorToResponse(error), ctx.request);
  return finish(jsonOk(mapShift(data!)), ctx.request);
}

export async function handleJobs(ctx: APIContext): Promise<Response> {
  const started = await begin(ctx.request);
  if (!started.ok) return started.response;
  const me = await ensureDriver(started.ctx.client);
  if (me instanceof Response) return finish(me, ctx.request);
  const today = athensToday();
  const from = ctx.url.searchParams.get('from') || today;
  const to = ctx.url.searchParams.get('to') || from;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return finish(jsonError(400, 'invalid_request', 'Use ISO dates (YYYY-MM-DD).'), ctx.request);
  }
  const { data, error } = await started.ctx.client.rpc('driver_jobs', { p_from: from, p_to: to });
  if (error) return finish(mapDbErrorToResponse(error), ctx.request);
  return finish(jsonOk((data ?? []).map(mapJob)), ctx.request);
}

export async function handleJobByReference(ctx: APIContext): Promise<Response> {
  const started = await begin(ctx.request);
  if (!started.ok) return started.response;
  const me = await ensureDriver(started.ctx.client);
  if (me instanceof Response) return finish(me, ctx.request);
  const reference = ctx.params.reference;
  if (!reference) {
    return finish(jsonError(404, 'not_found', 'Job not found.'), ctx.request);
  }
  // Window around today (−7 … +24): driver_jobs allows at most 31 days between from and to.
  const today = Temporal.PlainDate.from(athensToday());
  const from = today.subtract({ days: 7 }).toString();
  const to = today.add({ days: 24 }).toString();
  const { data, error } = await started.ctx.client.rpc('driver_jobs', { p_from: from, p_to: to });
  if (error) return finish(mapDbErrorToResponse(error), ctx.request);
  const row = (data ?? []).find((j) => j.reference === reference);
  if (!row) return finish(jsonError(404, 'not_found', 'Job not found.'), ctx.request);
  return finish(jsonOk(mapJob(row)), ctx.request);
}

export async function handleJobStatus(ctx: APIContext): Promise<Response> {
  const started = await begin(ctx.request);
  if (!started.ok) return started.response;
  const me = await ensureDriver(started.ctx.client);
  if (me instanceof Response) return finish(me, ctx.request);
  const reference = ctx.params.reference;
  if (!reference) {
    return finish(jsonError(404, 'not_found', 'Job not found.'), ctx.request);
  }
  let body: { status?: string; note?: string };
  try {
    body = (await ctx.request.json()) as typeof body;
  } catch {
    return finish(jsonError(400, 'invalid_request', 'Send JSON with status.'), ctx.request);
  }
  const allowed = new Set(['on_way', 'arrived', 'on_board', 'completed', 'no_show']);
  if (!body.status || !allowed.has(body.status)) {
    return finish(jsonError(400, 'invalid_request', 'status must be a forward trip status.'), ctx.request);
  }
  const note = body.note?.trim();
  const { data, error } = await started.ctx.client.rpc('set_trip_status', {
    p_reference: reference,
    p_status: body.status,
    ...(note ? { p_note: note } : {}),
  });
  if (error) return finish(mapDbErrorToResponse(error), ctx.request);
  return finish(jsonOk({ reference, tripStatus: data }), ctx.request);
}

export async function handleEarnings(ctx: APIContext): Promise<Response> {
  const started = await begin(ctx.request);
  if (!started.ok) return started.response;
  if (!earningsVisible()) {
    return finish(
      jsonError(403, 'forbidden', 'Earnings are not shown in the drivers’ app.'),
      ctx.request,
    );
  }
  const me = await ensureDriver(started.ctx.client);
  if (me instanceof Response) return finish(me, ctx.request);
  const from = ctx.url.searchParams.get('from');
  const to = ctx.url.searchParams.get('to');
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return finish(jsonError(400, 'invalid_request', 'from and to dates are required.'), ctx.request);
  }
  const driverId = String((me as { id: string }).id);
  const { data, error } = await started.ctx.client.rpc('driver_earnings', {
    p_driver_id: driverId,
    p_from: from,
    p_to: to,
  });
  if (error) return finish(mapDbErrorToResponse(error), ctx.request);
  const lines = (data ?? []).map(mapEarningLine);
  const totalCents = lines.reduce((s, l) => s + l.amountCents, 0);
  return finish(jsonOk({ totalCents, lines }), ctx.request);
}

