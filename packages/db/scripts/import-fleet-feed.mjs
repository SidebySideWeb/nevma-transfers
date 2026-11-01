#!/usr/bin/env node
// Imports the fleet and pricing feed into Postgres (admin and website read from here).
//   DATABASE_URL=postgres://... node packages/db/scripts/import-fleet-feed.mjs --file data/fleet-feed.json            (dry run: shows the changes, writes nothing)
//   DATABASE_URL=postgres://... node packages/db/scripts/import-fleet-feed.mjs --file data/fleet-feed.json --apply    (writes, in one transaction)
// Options: --retire-missing-vehicles  sets vehicles that are not in the feed to "retired" (only if they have no future bookings).
// Needs migrations 0001–0006, 0011, 0012, 0014. Rules: docs/FLEET-FEED.md. Never touches bookings or payments.
import pg from 'pg';
import { pathToFileURL } from 'node:url';
import { loadFeed, validateFeed, toDbRows } from './fleet-feed-lib.mjs';

/** Applies the feed inside an open transaction on `client`. Returns a report of what changed. */
export async function importFeed(client, feed, { retireMissingVehicles = false } = {}) {
  const { errors, warnings } = validateFeed(feed);
  if (errors.length) {
    const err = new Error(`The feed has ${errors.length} problem(s):\n- ${errors.join('\n- ')}`);
    err.feedErrors = errors;
    throw err;
  }
  const rows = toDbRows(feed);
  const report = { warnings: [...warnings], changes: {} };
  const count = (k, n) => { report.changes[k] = (report.changes[k] ?? 0) + n; };
  const q = (sql, p) => client.query(sql, p);

  // settings: update the keys that exist; never create unknown ones
  for (const s of rows.settings) {
    const r = await q(`update public.settings set value = to_jsonb($2::int), is_demo = $3
                        where key = $1 and (value is distinct from to_jsonb($2::int) or is_demo is distinct from $3)`, [s.key, s.value, s.is_demo]);
    const exists = (await q(`select 1 from public.settings where key = $1`, [s.key])).rowCount;
    if (!exists) report.warnings.push(`setting ${s.key} does not exist in this database (migration not applied?): skipped`);
    count('settings updated', r.rowCount);
  }

  // vehicle classes: upsert by key; classes not in the feed go offline (never deleted)
  for (const c of rows.classes) {
    const r = await q(`insert into public.vehicle_classes (key, name, max_passengers, max_luggage, buffer_minutes, sort_order, active, is_demo)
                       values ($1, $2, $3, $4, $5, $6, $7, $8)
                       on conflict (key) do update set name = excluded.name, max_passengers = excluded.max_passengers, max_luggage = excluded.max_luggage,
                         buffer_minutes = excluded.buffer_minutes, sort_order = excluded.sort_order, active = excluded.active, is_demo = excluded.is_demo
                       where (vehicle_classes.name, vehicle_classes.max_passengers, vehicle_classes.max_luggage, vehicle_classes.buffer_minutes,
                              vehicle_classes.sort_order, vehicle_classes.active, vehicle_classes.is_demo)
                         is distinct from (excluded.name, excluded.max_passengers, excluded.max_luggage, excluded.buffer_minutes,
                              excluded.sort_order, excluded.active, excluded.is_demo)
                       returning (xmax = 0) as inserted`, [c.key, c.name, c.max_passengers, c.max_luggage, c.buffer_minutes, c.sort_order, c.active, c.is_demo]);
    if (r.rowCount) count(r.rows[0].inserted ? 'classes added' : 'classes updated', 1);
  }
  const keys = rows.classes.map((c) => c.key);
  count('classes switched offline (not in the feed)', (await q(`update public.vehicle_classes set active = false where active and not (key = any($1))`, [keys])).rowCount);

  // zones: upsert by code; zones not in the feed are switched off
  for (const z of rows.zones) {
    const r = await q(`insert into public.zones (code, name, kind, sort_order, active, is_demo) values ($1, $2, $3, $4, $5, $6)
                       on conflict (code) do update set name = excluded.name, kind = excluded.kind, sort_order = excluded.sort_order, active = excluded.active, is_demo = excluded.is_demo
                       where (zones.name, zones.kind, zones.sort_order, zones.active, zones.is_demo) is distinct from (excluded.name, excluded.kind, excluded.sort_order, excluded.active, excluded.is_demo)
                       returning (xmax = 0) as inserted`, [z.code, z.name, z.kind, z.sort_order, z.active, z.is_demo]);
    if (r.rowCount) count(r.rows[0].inserted ? 'zones added' : 'zones updated', 1);
  }
  count('zones switched off (not in the feed)', (await q(`update public.zones set active = false where active and not (code = any($1))`, [rows.zones.map((z) => z.code)])).rowCount);

  const zoneId = new Map((await q(`select code, id from public.zones`)).rows.map((r) => [r.code, r.id]));
  const classId = new Map((await q(`select key, id from public.vehicle_classes`)).rows.map((r) => [r.key, r.id]));

  // routes and durations: upsert (both directions already expanded)
  for (const r of rows.routes) {
    const res = await q(`insert into public.zone_routes (from_zone_id, to_zone_id, duration_minutes, is_demo) values ($1, $2, $3, $4)
                         on conflict (from_zone_id, to_zone_id) do update set duration_minutes = excluded.duration_minutes, is_demo = excluded.is_demo
                         where (zone_routes.duration_minutes, zone_routes.is_demo) is distinct from (excluded.duration_minutes, excluded.is_demo)
                         returning (xmax = 0) as inserted`, [zoneId.get(r.from), zoneId.get(r.to), r.duration_minutes, r.is_demo]);
    if (res.rowCount) count(res.rows[0].inserted ? 'routes added' : 'routes updated', 1);
  }

  // prices: the feed is the full price list for its classes and zones. Upsert what it lists, delete the rest
  // between those zones for those classes (an empty cell means "no online price, request a quote").
  const listed = new Set();
  for (const p of rows.prices) {
    listed.add(`${p.from}>${p.to}>${p.class_key}`);
    const res = await q(`insert into public.zone_prices (from_zone_id, to_zone_id, class_id, price_cents, is_demo) values ($1, $2, $3, $4, $5)
                         on conflict (from_zone_id, to_zone_id, class_id) do update set price_cents = excluded.price_cents, is_demo = excluded.is_demo
                         where (zone_prices.price_cents, zone_prices.is_demo) is distinct from (excluded.price_cents, excluded.is_demo)
                         returning (xmax = 0) as inserted`, [zoneId.get(p.from), zoneId.get(p.to), classId.get(p.class_key), p.price_cents, p.is_demo]);
    if (res.rowCount) count(res.rows[0].inserted ? 'prices added' : 'prices changed', 1);
  }
  const existing = (await q(`select zf.code f, zt.code t, c.key k from public.zone_prices p
                               join public.zones zf on zf.id = p.from_zone_id join public.zones zt on zt.id = p.to_zone_id
                               join public.vehicle_classes c on c.id = p.class_id
                              where c.key = any($1) and zf.code = any($2) and zt.code = any($2)`, [keys, rows.zones.map((z) => z.code)])).rows;
  for (const e of existing) {
    if (!listed.has(`${e.f}>${e.t}>${e.k}`)) {
      await q(`delete from public.zone_prices where from_zone_id = $1 and to_zone_id = $2 and class_id = $3`, [zoneId.get(e.f), zoneId.get(e.t), classId.get(e.k)]);
      count('prices removed (not in the feed)', 1);
    }
  }

  // hourly rates: upsert per class
  for (const h of rows.hourly) {
    const res = await q(`insert into public.hourly_rates (class_id, price_per_hour_cents, min_hours, max_hours, is_demo) values ($1, $2, $3, $4, $5)
                         on conflict (class_id) do update set price_per_hour_cents = excluded.price_per_hour_cents, min_hours = excluded.min_hours, max_hours = excluded.max_hours, is_demo = excluded.is_demo
                         where (hourly_rates.price_per_hour_cents, hourly_rates.min_hours, hourly_rates.max_hours, hourly_rates.is_demo)
                           is distinct from (excluded.price_per_hour_cents, excluded.min_hours, excluded.max_hours, excluded.is_demo)
                         returning (xmax = 0) as inserted`, [classId.get(h.class_key), h.price_per_hour_cents, h.min_hours, h.max_hours, h.is_demo]);
    if (res.rowCount) count(res.rows[0].inserted ? 'hourly rates added' : 'hourly rates changed', 1);
  }

  // vehicles: upsert by label (case-insensitive)
  for (const v of rows.vehicles) {
    const found = (await q(`select id, class_id, status, plate, is_demo from public.vehicles where lower(label) = lower($1)`, [v.label])).rows[0];
    const cid = classId.get(v.class_key);
    if (!found) {
      await q(`insert into public.vehicles (class_id, label, status, plate, is_demo) values ($1, $2, $3, $4, $5)`, [cid, v.label, v.status, v.plate, v.is_demo]);
      count('vehicles added', 1);
    } else if (found.class_id !== cid || found.status !== v.status || (found.plate ?? null) !== v.plate || found.is_demo !== v.is_demo) {
      await q(`update public.vehicles set class_id = $2, status = $3, plate = $4, is_demo = $5 where id = $1`, [found.id, cid, v.status, v.plate, v.is_demo]);
      count('vehicles updated', 1);
    }
  }
  const missing = (await q(`select id, label from public.vehicles where status <> 'retired' and not (lower(label) = any($1))`, [rows.vehicles.map((v) => v.label.toLowerCase())])).rows;
  if (missing.length && !retireMissingVehicles) report.warnings.push(`${missing.length} vehicle(s) not in the feed were left as they are (${missing.map((m) => m.label).join(', ')}); use --retire-missing-vehicles to retire them`);
  if (retireMissingVehicles) {
    for (const m of missing) {
      await q('savepoint retire');
      try {
        await q(`update public.vehicles set status = 'retired' where id = $1`, [m.id]);
        await q('release savepoint retire');
        count('vehicles retired (not in the feed)', 1);
      } catch (err) {
        await q('rollback to savepoint retire');
        report.warnings.push(`could not retire ${m.label}: ${err.message.replace(/^has_future_bookings: /, '')}`);
      }
    }
  }

  // extras: upsert by code; extras not in the feed are switched off (built-in ones are never deleted)
  for (const x of rows.extras) {
    const res = await q(`insert into public.extras (code, name, price_cents, active, applies_to, max_quantity, is_demo) values ($1, $2, $3, $4, $5, $6, $7)
                         on conflict (code) do update set name = excluded.name, price_cents = excluded.price_cents, active = excluded.active,
                           applies_to = excluded.applies_to, max_quantity = excluded.max_quantity, is_demo = excluded.is_demo
                         where (extras.name, extras.price_cents, extras.active, extras.applies_to, extras.max_quantity, extras.is_demo)
                           is distinct from (excluded.name, excluded.price_cents, excluded.active, excluded.applies_to, excluded.max_quantity, excluded.is_demo)
                         returning (xmax = 0) as inserted`, [x.code, x.name, x.price_cents, x.active, x.applies_to, x.max_quantity, x.is_demo]);
    if (res.rowCount) count(res.rows[0].inserted ? 'extras added' : 'extras changed', 1);
  }
  count('extras switched off (not in the feed)', (await q(`update public.extras set active = false where active and not (code = any($1))`, [rows.extras.map((x) => x.code)])).rowCount);

  for (const k of Object.keys(report.changes)) if (report.changes[k] === 0) delete report.changes[k];
  return report;
}

function printReport(report, applied) {
  console.log(applied ? 'Imported. Changes:' : 'Dry run (nothing written). Changes the import would make:');
  const entries = Object.entries(report.changes);
  if (!entries.length) console.log('  none: the database already matches the feed');
  for (const [k, n] of entries) console.log(`  ${k}: ${n}`);
  if (report.warnings.length) {
    console.log('Notes:');
    for (const w of report.warnings) console.log(`  - ${w}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const file = args[args.indexOf('--file') + 1];
  if (!args.includes('--file') || !file) throw new Error('Usage: import-fleet-feed.mjs --file data/fleet-feed.json [--apply] [--retire-missing-vehicles]');
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to the Supabase connection string (Session pooler, port 5432).');
  const apply = args.includes('--apply');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('begin');
    const report = await importFeed(client, loadFeed(file), { retireMissingVehicles: args.includes('--retire-missing-vehicles') });
    await client.query(apply ? 'commit' : 'rollback');
    printReport(report, apply);
  } catch (err) {
    await client.query('rollback').catch(() => {});
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
