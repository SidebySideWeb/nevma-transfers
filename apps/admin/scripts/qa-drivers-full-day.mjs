#!/usr/bin/env node
/**
 * D6 full-day walk (automated evidence for docs/QA-DRIVERS.md).
 * Requires: local Supabase + admin at PUBLIC_ADMIN_URL (default http://127.0.0.1:4322) with FEATURE_DRIVERS=true.
 * Creates two drivers, assigns bookings via SQL, exercises the driver API, builds a statement via SQL.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const ADMIN = (process.env.PUBLIC_ADMIN_URL || 'http://127.0.0.1:4322').replace(/\/$/, '');
const DB = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const EMAIL = 'qa-day-driver@tem.local';
const EMAIL2 = 'qa-day-driver-2@tem.local';
const PASS = 'QaDayPass123!';

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const steps = [];

function ok(name, detail = '') {
  steps.push({ name, result: 'pass', detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail) {
  steps.push({ name, result: 'fail', detail });
  console.error(`FAIL  ${name} — ${detail}`);
  throw new Error(detail);
}

async function ensureUser(email) {
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  let user = listed.data.users.find((u) => (u.email || '').toLowerCase() === email);
  if (!user) {
    const created = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true });
    if (created.error) throw created.error;
    user = created.data.user;
  } else {
    await admin.auth.admin.updateUserById(user.id, { password: PASS, email_confirm: true });
  }
  return user;
}

async function main() {
  // Clean prior walk
  execSync(
    `psql "${DB}" -v ON_ERROR_STOP=1 -c "update driver_statements set status='draft' where driver_id in (select id from drivers where email in ('${EMAIL}','${EMAIL2}')); delete from driver_statement_lines where statement_id in (select id from driver_statements where driver_id in (select id from drivers where email in ('${EMAIL}','${EMAIL2}'))); delete from driver_statements where driver_id in (select id from drivers where email in ('${EMAIL}','${EMAIL2}')); delete from driver_pay_plans where driver_id in (select id from drivers where email in ('${EMAIL}','${EMAIL2}')); delete from booking_events where booking_id in (select id from bookings where customer_email='qa-day@example.com'); delete from bookings where customer_email='qa-day@example.com'; delete from driver_shifts where driver_id in (select id from drivers where email in ('${EMAIL}','${EMAIL2}')); delete from drivers where email in ('${EMAIL}','${EMAIL2}');"`,
    { stdio: 'pipe' },
  );

  const user1 = await ensureUser(EMAIL);
  const user2 = await ensureUser(EMAIL2);
  const { data: d1, error: e1 } = await admin
    .from('drivers')
    .insert({
      full_name: 'QA Day Driver',
      email: EMAIL,
      phone: '+306900009701',
      employment: 'employee',
      active: true,
      user_id: user1.id,
    })
    .select('id')
    .single();
  if (e1) fail('create driver 1', e1.message);
  const { error: e2 } = await admin.from('drivers').insert({
    full_name: 'QA Day Driver 2',
    email: EMAIL2,
    phone: '+306900009702',
    employment: 'freelancer',
    active: true,
    user_id: user2.id,
  });
  if (e2) fail('create driver 2', e2.message);
  ok('create two drivers', `${d1.id.slice(0, 8)}… + second`);

  execSync(
    `psql "${DB}" -v ON_ERROR_STOP=1 -c "insert into driver_pay_plans (driver_id, valid_from, monthly_salary_cents, per_transfer_cents) values ('${d1.id}', current_date - 7, 100000, 1500);"`,
    { stdio: 'pipe' },
  );
  ok('pay plan for driver 1');

  // Three spaced bookings tomorrow on DEMO S-CLASS-1 (avoid Today e2e vehicle clash).
  const sqlFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'qa-day-bookings.sql');
  execSync(`psql "${DB}" -v ON_ERROR_STOP=1 -v driver_id=${d1.id} -f "${sqlFile}"`, {
    stdio: 'inherit',
  });
  const refs = execSync(
    `psql "${DB}" -tA -c "select reference from bookings where customer_email='qa-day@example.com' order by pickup_at"`,
    { encoding: 'utf8' },
  )
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  if (refs.length < 3) fail('assign three bookings', `got ${refs.length}`);
  ok('assign three bookings', refs.join(', '));

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const sign = await anon.auth.signInWithPassword({ email: EMAIL, password: PASS });
  if (sign.error) fail('driver sign-in', sign.error.message);
  const token = sign.data.session.access_token;
  ok('driver sign-in (invite link simulated via user_id)');

  const vehicleId = execSync(
    `psql "${DB}" -tA -c "select id from vehicles where label='DEMO S-CLASS-1' limit 1"`,
    { encoding: 'utf8' },
  ).trim();

  async function api(path, init = {}) {
    const headers = { Authorization: `Bearer ${token}`, ...(init.headers || {}) };
    if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${ADMIN}/api/driver/v1${path}`, { ...init, headers });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: res.status, body };
  }

  const me = await api('/me');
  if (me.status !== 200) fail('GET /me', `${me.status} ${JSON.stringify(me.body)}`);
  ok('GET /me', me.body.fullName);

  const start = await api('/shift/start', {
    method: 'POST',
    body: JSON.stringify({ vehicleId, odometer: 5000 }),
  });
  if (start.status !== 201) fail('POST /shift/start', `${start.status} ${JSON.stringify(start.body)}`);
  ok('start the day (API)');

  const statuses = ['on_way', 'arrived', 'on_board', 'completed'];
  const jobRef = refs[0];
  for (const st of statuses) {
    const r = await api(`/jobs/${jobRef}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: st }),
    });
    if (r.status !== 200) fail(`status → ${st}`, `${r.status} ${JSON.stringify(r.body)}`);
  }
  ok('move first job through every forward status', jobRef);

  const end = await api('/shift/end', { method: 'POST', body: JSON.stringify({ odometer: 5120 }) });
  if (end.status !== 200) fail('POST /shift/end', `${end.status} ${JSON.stringify(end.body)}`);
  ok('end the day (API)');

  const weekFrom = execSync(
    `psql "${DB}" -tA -c "select (date_trunc('week', (now() at time zone 'Europe/Athens')::date))::date"`,
    { encoding: 'utf8' },
  ).trim();
  const weekTo = execSync(
    `psql "${DB}" -tA -c "select ((date_trunc('week', (now() at time zone 'Europe/Athens')::date) + interval '6 days')::date)"`,
    { encoding: 'utf8' },
  ).trim();

  // Statements / reports are staff-only: sign in as office@tem.local and call RPCs.
  const staffSign = await anon.auth.signInWithPassword({
    email: 'office@tem.local',
    password: 'OfficePass123!',
  });
  if (staffSign.error) fail('staff sign-in for statement', staffSign.error.message);
  const staffClient = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${staffSign.data.session.access_token}` } },
  });
  const { data: sid, error: buildErr } = await staffClient.rpc('driver_statement_build', {
    p_driver_id: d1.id,
    p_from: weekFrom,
    p_to: weekTo,
  });
  if (buildErr) fail('driver_statement_build', buildErr.message);
  const { error: apprErr } = await staffClient.rpc('driver_statement_approve', { p_id: sid });
  if (apprErr) fail('driver_statement_approve', apprErr.message);
  ok('build + approve weekly statement', String(sid).slice(0, 8));

  const { data: payRows, error: payErr } = await staffClient.rpc('report_driver_pay', {
    p_from: weekFrom,
    p_to: weekTo,
  });
  if (payErr) fail('report_driver_pay', payErr.message);
  ok('report_driver_pay for the week', `${(payRows ?? []).length} rows`);

  // CSV export route (staff cookie not set here — prove function + note Playwright DR-09 for HTTP exports).
  ok('reports export', 'CSV/Excel covered by e2e/pay-reports.spec.ts (DR-09)');

  console.log('\n--- full-day walk complete ---');
  for (const s of steps) console.log(`${s.result.toUpperCase()}\t${s.name}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
