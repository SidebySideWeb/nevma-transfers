/**
 * DR-10 / DR-11 — Driver API v1 contract tests against local Supabase.
 * Requires: supabase start, migration 0019+0020 applied, FEATURE_DRIVERS.
 * Skipped when Auth is unreachable (CI check job has no Supabase stack).
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import type { APIContext } from 'astro';
import {
  handleEarnings,
  handleJobByReference,
  handleJobs,
  handleJobStatus,
  handleMe,
  handleShiftEnd,
  handleShiftStart,
  handleVehicles,
} from './handler';
import { validateError, validateSchema } from './openapi-validate';

const URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const EMAIL_A = 'api-driver-a@tem.local';
const EMAIL_B = 'api-driver-b@tem.local';
const PASS = 'DriverApiPass123!';

async function supabaseAuthUp(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${URL}/auth/v1/health`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

const supabaseUp = await supabaseAuthUp();

process.env.FEATURE_DRIVERS = 'true';
process.env.DRIVER_APP_ORIGIN = 'http://localhost:5173';
process.env.SUPABASE_URL = URL;
process.env.SUPABASE_ANON_KEY = ANON;

const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function ctx(req: Request, params: Record<string, string> = {}): APIContext {
  const href = typeof req.url === 'string' ? req.url : String(req.url);
  const url = new globalThis.URL(href);
  return {
    request: req,
    url,
    params,
    cookies: {} as APIContext['cookies'],
    locals: {} as APIContext['locals'],
    redirect: (() => {
      throw new Error('redirect');
    }) as APIContext['redirect'],
    rewrite: (() => {
      throw new Error('rewrite');
    }) as APIContext['rewrite'],
    site: undefined,
    generator: 'test',
    clientAddress: '127.0.0.1',
    getActionResult: undefined,
    callAction: undefined,
    session: undefined,
    preferredLocale: undefined,
    preferredLocaleList: undefined,
    currentLocale: undefined,
    isPrerendered: false,
    routePattern: '',
  } as unknown as APIContext;
}

function authReq(path: string, token: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return new Request(`http://127.0.0.1:4322/api/driver/v1${path}`, { ...init, headers });
}

async function json(res: Response): Promise<unknown> {
  return res.json();
}

function assertNoPriceKeys(body: unknown, allowAmount = false) {
  const s = JSON.stringify(body);
  expect(s).not.toMatch(/"price"/i);
  if (!allowAmount) expect(s).not.toMatch(/"amount"/i);
}

let tokenA = '';
let tokenB = '';
let vehicleId = '';
let refA = '';
let driverAId = '';
/** False when Auth is up but DEMO fleet seed is missing — suite body is skipped. */
let seedReady = false;

describe.skipIf(!supabaseUp)('DR-10 driver API contract', () => {
  beforeAll(async () => {
    const { data: existing } = await admin.from('drivers').select('id, user_id').in('email', [EMAIL_A, EMAIL_B]);
    for (const d of existing ?? []) {
      execSync(
        `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -c "delete from booking_events where booking_id in (select id from bookings where driver_id = '${d.id}'); delete from bookings where driver_id = '${d.id}'; delete from driver_shifts where driver_id = '${d.id}'; delete from drivers where id = '${d.id}';"`,
        { stdio: 'pipe' },
      );
      if (d.user_id) await admin.auth.admin.deleteUser(d.user_id);
    }

    for (const email of [EMAIL_A, EMAIL_B]) {
      const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const old = listed.data.users.find((u) => (u.email || '').toLowerCase() === email);
      if (old) await admin.auth.admin.deleteUser(old.id);
      const created = await admin.auth.admin.createUser({
        email,
        password: PASS,
        email_confirm: true,
      });
      expect(created.error).toBeNull();
    }

    const users = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const userA = users.data.users.find((u) => (u.email || '').toLowerCase() === EMAIL_A)!;
    const userB = users.data.users.find((u) => (u.email || '').toLowerCase() === EMAIL_B)!;

    const { data: dA, error: dAErr } = await admin
      .from('drivers')
      .insert({
        full_name: 'API Driver A',
        email: EMAIL_A,
        phone: '+306900009801',
        employment: 'employee',
        active: true,
        user_id: userA.id,
      })
      .select('id')
      .single();
    expect(dAErr).toBeNull();
    driverAId = dA!.id;
    await admin.from('drivers').insert({
      full_name: 'API Driver B',
      email: EMAIL_B,
      phone: '+306900009802',
      employment: 'employee',
      active: true,
      user_id: userB.id,
    });

    const { data: veh } = await admin
      .from('vehicles')
      .select('id, class_id')
      .eq('label', 'DEMO E-CLASS-1')
      .maybeSingle();
    if (!veh?.id) {
      console.warn('[driver-api contract] DEMO E-CLASS-1 missing; apply DEMO seed to run this suite');
      return;
    }
    vehicleId = veh.id;

    // Booking 48h out so customer phone is null (DR-11); blocked_range via SQL helper.
    execSync(
      `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -c "insert into public.bookings (booking_type, class_id, from_zone_id, to_zone_id, vehicle_id, driver_id, pickup_address, dropoff_address, pickup_at, duration_minutes, blocked_range, passengers, luggage, customer_name, customer_email, customer_phone, base_price_cents, price_cents, status, payment_status, trip_status) select 'transfer', c.id, za.id, zb.id, v.id, '${driverAId}'::uuid, 'Arrivals API', 'Hotel API', now() + interval '48 hours', 45, public.blocked_range_for(now() + interval '48 hours', 45, c.buffer_minutes), 2, 1, 'API Customer', 'api-customer@example.com', '+306900009899', 18000, 18000, 'assigned', 'paid', 'scheduled' from public.vehicle_classes c join public.zones za on za.code = 'demo-airport' join public.zones zb on zb.code = 'demo-centre' join public.vehicles v on v.label = 'DEMO E-CLASS-1' where c.key = 'demo-e-class';"`,
      { stdio: 'pipe' },
    );
    refA = execSync(
      `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tA -c "select reference from public.bookings where driver_id = '${driverAId}' order by created_at desc limit 1"`,
      { encoding: 'utf8' },
    ).trim();
    expect(refA).toMatch(/^EP-/);
    seedReady = true;

    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const signA = await anon.auth.signInWithPassword({ email: EMAIL_A, password: PASS });
    const signB = await anon.auth.signInWithPassword({ email: EMAIL_B, password: PASS });
    expect(signA.error).toBeNull();
    expect(signB.error).toBeNull();
    tokenA = signA.data.session!.access_token;
    tokenB = signB.data.session!.access_token;
  }, 120_000);

  it.skipIf(() => !seedReady)('401 unauthorized for missing or expired token', async () => {
    const missing = await handleMe(ctx(new Request('http://127.0.0.1:4322/api/driver/v1/me')));
    expect(missing.status).toBe(401);
    const missBody = await json(missing);
    expect(validateError(missBody)).toEqual([]);

    const expired = await handleMe(
      ctx(
        new Request('http://127.0.0.1:4322/api/driver/v1/me', {
          headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.invalid' },
        }),
      ),
    );
    expect(expired.status).toBe(401);
    expect(expired.status).not.toBe(500);
    expect(validateError(await json(expired))).toEqual([]);
  });

  it.skipIf(() => !seedReady)('GET /me and /vehicles', async () => {
    const meRes = await handleMe(ctx(authReq('/me', tokenA)));
    expect(meRes.status).toBe(200);
    const me = await json(meRes);
    expect(validateSchema('Me', me)).toEqual([]);
    assertNoPriceKeys(me);

    const vRes = await handleVehicles(ctx(authReq('/vehicles', tokenA)));
    expect(vRes.status).toBe(200);
    const vehicles = (await json(vRes)) as unknown[];
    expect(Array.isArray(vehicles)).toBe(true);
    for (const v of vehicles) expect(validateSchema('Vehicle', v)).toEqual([]);
    assertNoPriceKeys(vehicles);
  });

  it.skipIf(() => !seedReady)('shift start / end and documented errors', async () => {
    const start = await handleShiftStart(
      ctx(
        authReq('/shift/start', tokenA, {
          method: 'POST',
          body: JSON.stringify({ vehicleId, odometer: 1000 }),
        }),
      ),
    );
    expect(start.status).toBe(201);
    expect(validateSchema('Shift', await json(start))).toEqual([]);

    const again = await handleShiftStart(
      ctx(
        authReq('/shift/start', tokenA, {
          method: 'POST',
          body: JSON.stringify({ vehicleId }),
        }),
      ),
    );
    expect(again.status).toBe(409);
    const againBody = (await json(again)) as { error: string };
    expect(againBody.error).toBe('already_on_shift');
    expect(validateError(againBody)).toEqual([]);

    const end = await handleShiftEnd(
      ctx(authReq('/shift/end', tokenA, { method: 'POST', body: JSON.stringify({ odometer: 1100 }) })),
    );
    expect(end.status).toBe(200);
    expect(validateSchema('Shift', await json(end))).toEqual([]);

    const noShift = await handleShiftEnd(ctx(authReq('/shift/end', tokenA, { method: 'POST', body: '{}' })));
    expect(noShift.status).toBe(409);
    expect((await json(noShift) as { error: string }).error).toBe('no_shift');
  });

  it.skipIf(() => !seedReady)('jobs list, one job, cross-driver 404, no price keys', async () => {
    // Start shift so status updates can succeed later
    await handleShiftStart(
      ctx(authReq('/shift/start', tokenA, { method: 'POST', body: JSON.stringify({ vehicleId }) })),
    );

    const list = await handleJobs(ctx(authReq('/jobs', tokenA)));
    expect(list.status).toBe(200);
    const jobs = (await json(list)) as unknown[];
    expect(Array.isArray(jobs)).toBe(true);
    for (const j of jobs) expect(validateSchema('Job', j)).toEqual([]);
    assertNoPriceKeys(jobs);

    const one = await handleJobByReference(ctx(authReq(`/jobs/${refA}`, tokenA), { reference: refA }));
    expect(one.status).toBe(200);
    const job = await json(one);
    expect(validateSchema('Job', job)).toEqual([]);
    assertNoPriceKeys(job);
    expect((job as { customerPhone: string | null }).customerPhone).toBeNull(); // 48h out — DR-11

    const other = await handleJobByReference(
      ctx(authReq(`/jobs/${refA}`, tokenB), { reference: refA }),
    );
    expect(other.status).toBe(404);
    expect(validateError(await json(other))).toEqual([]);
  });

  it.skipIf(() => !seedReady)('trip status forward; invalid transition 409; forbidden for other driver', async () => {
    const ok = await handleJobStatus(
      ctx(
        authReq(`/jobs/${refA}/status`, tokenA, {
          method: 'POST',
          body: JSON.stringify({ status: 'on_way' }),
        }),
        { reference: refA },
      ),
    );
    expect(ok.status).toBe(200);
    const body = await json(ok);
    assertNoPriceKeys(body);

    const bad = await handleJobStatus(
      ctx(
        authReq(`/jobs/${refA}/status`, tokenA, {
          method: 'POST',
          body: JSON.stringify({ status: 'scheduled' }),
        }),
        { reference: refA },
      ),
    );
    expect([400, 409]).toContain(bad.status);

    const forbid = await handleJobStatus(
      ctx(
        authReq(`/jobs/${refA}/status`, tokenB, {
          method: 'POST',
          body: JSON.stringify({ status: 'arrived' }),
        }),
        { reference: refA },
      ),
    );
    expect(forbid.status).toBe(403);
    expect(validateError(await json(forbid))).toEqual([]);

    await handleShiftEnd(ctx(authReq('/shift/end', tokenA, { method: 'POST', body: '{}' })));
  });

  it.skipIf(() => !seedReady)('earnings hidden by default (403); visible path validates schema', async () => {
    process.env.DRIVER_EARNINGS_VISIBLE = 'false';
    const hidden = await handleEarnings(
      ctx(authReq('/earnings?from=2026-10-01&to=2026-10-31', tokenA)),
    );
    expect(hidden.status).toBe(403);
    expect(validateError(await json(hidden))).toEqual([]);

    // Second driver also 403 when hidden
    const hiddenB = await handleEarnings(
      ctx(authReq('/earnings?from=2026-10-01&to=2026-10-31', tokenB)),
    );
    expect(hiddenB.status).toBe(403);

    process.env.DRIVER_EARNINGS_VISIBLE = 'true';
    const shown = await handleEarnings(
      ctx(authReq('/earnings?from=2026-10-01&to=2026-10-31', tokenA)),
    );
    expect(shown.status).toBe(200);
    const earn = (await json(shown)) as { totalCents: number; lines: unknown[] };
    expect(typeof earn.totalCents).toBe('number');
    for (const line of earn.lines) expect(validateSchema('EarningLine', line)).toEqual([]);
    process.env.DRIVER_EARNINGS_VISIBLE = 'false';
  });

  it.skipIf(() => !seedReady)('invalid jobs date range → 400', async () => {
    const res = await handleJobs(
      ctx(authReq('/jobs?from=2026-01-01&to=2026-03-15', tokenA)),
    );
    expect(res.status).toBe(400);
    expect((await json(res) as { error: string }).error).toBe('invalid_request');
  });
});
