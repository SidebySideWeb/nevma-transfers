#!/usr/bin/env node
/**
 * AC-10: anon key must return no rows from public tables via PostgREST.
 * Requires SUPABASE_URL + SUPABASE_ANON_KEY. Never prints the key.
 */
const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.SUPABASE_ANON_KEY || '';
if (!url || !key) {
  console.log('SKIP: SUPABASE_URL / SUPABASE_ANON_KEY not set');
  process.exit(0);
}

const tables = [
  'bookings',
  'payments',
  'zones',
  'vehicles',
  'vehicle_classes',
  'extras',
  'slot_holds',
  'settings',
  'staff',
];

let failed = 0;
for (const table of tables) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=5`, {
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      accept: 'application/json',
    },
  });
  const text = await res.text();
  let rows;
  try {
    rows = JSON.parse(text);
  } catch {
    rows = null;
  }
  const empty =
    res.status === 401 ||
    res.status === 403 ||
    (Array.isArray(rows) && rows.length === 0) ||
    (rows && rows.message && /permission|JWT|RLS/i.test(String(rows.message)));
  if (!empty) {
    console.log(`FAIL ${table}: status ${res.status}, got data`);
    failed++;
  } else {
    console.log(`PASS ${table}: no data for anon`);
  }
}
process.exit(failed ? 1 : 0);
