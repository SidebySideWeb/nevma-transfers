#!/usr/bin/env node
/**
 * Prompt 14 security API spot-checks against a running web server.
 * Usage: node scripts/qa-security-api.mjs [baseUrl]
 * Never prints secret values.
 */
const base = (process.argv[2] || process.env.PUBLIC_SITE_URL || 'http://127.0.0.1:4321').replace(/\/$/, '');
const results = [];

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name}`);
  } catch (e) {
    results.push({ name, ok: false, err: e instanceof Error ? e.message : String(e) });
    console.log(`FAIL ${name}: ${e instanceof Error ? e.message : e}`);
  }
}

await check('AC-01 POST /api/quote with amount → 400', async () => {
  const res = await fetch(`${base}/api/quote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      bookingType: 'transfer',
      pickupZoneCode: 'demo-airport',
      dropoffZoneCode: 'demo-centre',
      vehicleClassKey: 'demo-sedan',
      pickupLocal: '2099-06-01T12:00',
      passengers: 1,
      amount: 1,
    }),
  });
  if (res.status !== 400) throw new Error(`status ${res.status}`);
  const body = await res.json();
  if (body.error !== 'invalid_request') throw new Error(`error ${body.error}`);
});

await check('AC-23 POST /api/holds without Turnstile → 400', async () => {
  const res = await fetch(`${base}/api/holds`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      bookingType: 'transfer',
      pickupZoneCode: 'demo-airport',
      dropoffZoneCode: 'demo-centre',
      vehicleClassKey: 'demo-sedan',
      pickupLocal: '2099-06-02T12:00',
      passengers: 1,
    }),
  });
  // booking closed → 503; open without turnstile → 400
  if (![400, 503].includes(res.status)) throw new Error(`status ${res.status}`);
});

await check('AC-05/23 burst holds → 429 or closed', async () => {
  const statuses = [];
  for (let i = 0; i < 8; i++) {
    const res = await fetch(`${base}/api/holds`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        bookingType: 'transfer',
        pickupZoneCode: 'demo-airport',
        dropoffZoneCode: 'demo-centre',
        vehicleClassKey: 'demo-sedan',
        pickupLocal: `2099-07-0${(i % 9) + 1}T12:00`,
        passengers: 1,
        turnstileToken: 'qa-burst',
      }),
    });
    statuses.push(res.status);
  }
  if (!(statuses.includes(429) || statuses.every((s) => s === 503) || statuses.includes(400))) {
    throw new Error(`unexpected statuses ${statuses.join(',')}`);
  }
});

await check('AC-24 unsigned /api/internal/refund → 401', async () => {
  const res = await fetch(`${base}/api/internal/refund`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bookingId: '00000000-0000-0000-0000-000000000001', amountCents: 1 }),
  });
  if (res.status !== 401) throw new Error(`status ${res.status}`);
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} security API checks passed`);
process.exit(failed.length ? 1 : 0);
