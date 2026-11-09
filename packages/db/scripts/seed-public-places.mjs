#!/usr/bin/env node
// Seed public places for the booking widget (0035/0036).
// Looks each place up ONCE with Google Places Text Search (New) and stores the exact
// place ID, address and coordinates in saved_places as a PUBLIC place.
//
//   node scripts/seed-public-places.mjs                 dry run: prints what Google found
//   node scripts/seed-public-places.mjs --apply         writes to Supabase
//   node scripts/seed-public-places.mjs --file other.json
//
// Env: GOOGLE_MAPS_SERVER_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (service role: server only).
// Cost: one Text Search call per place (about 45 calls, once).

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ATTICA = { low: { latitude: 37.60, longitude: 23.30 }, high: { latitude: 38.35, longitude: 24.10 } };
export const KINDS = ['airport', 'port', 'station', 'landmark', 'square', 'hotel', 'venue', 'area'];

export function validateEntry(e) {
  if (!e || typeof e.query !== 'string' || e.query.trim().length < 3) return 'query missing';
  if (typeof e.label !== 'string' || e.label.trim().length < 2 || e.label.length > 200) return 'label missing';
  if (!KINDS.includes(e.kind)) return `kind must be one of ${KINDS.join(', ')} (never "address")`;
  return null;
}

export function searchBody(query) {
  return {
    textQuery: query,
    languageCode: 'en',
    regionCode: 'GR',
    pageSize: 1,
    locationRestriction: { rectangle: ATTICA },
  };
}

export function parsePlace(json) {
  const p = json?.places?.[0];
  if (!p?.id || !p?.location) return null;
  const lat = Number(p.location.latitude), lng = Number(p.location.longitude);
  if (!(lat >= 34 && lat <= 42 && lng >= 19 && lng <= 30)) return null;
  return {
    placeId: p.id,
    name: p.displayName?.text ?? '',
    address: (p.formattedAddress ?? p.displayName?.text ?? '').slice(0, 300),
    lat, lng,
  };
}

export function rowFor(entry, found) {
  return {
    label: entry.label.trim(),
    address: found.address || entry.label.trim(),
    place_id: found.placeId,
    lat: found.lat,
    lng: found.lng,
    kind: entry.kind,
    is_public: true,
    pinned: Boolean(entry.pinned),
    hidden: false,
    source: 'office',
  };
}

async function googleSearch(query, key, fetchImpl = fetch) {
  const res = await fetchImpl('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify(searchBody(query)),
  });
  if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return parsePlace(await res.json());
}

function supa(url, key, fetchImpl = fetch) {
  const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  return {
    async byPlaceId(placeId) {
      const r = await fetchImpl(`${url}/rest/v1/saved_places?select=id&place_id=eq.${encodeURIComponent(placeId)}`, { headers: h });
      if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
      return (await r.json())[0]?.id ?? null;
    },
    async nearest(lat, lng, maxM) {
      const r = await fetchImpl(`${url}/rest/v1/rpc/nearest_saved_place`, {
        method: 'POST', headers: h, body: JSON.stringify({ p_lat: lat, p_lng: lng, p_max_m: maxM }),
      });
      if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
      return (await r.json()) || null;
    },
    async update(id, row) {
      const r = await fetchImpl(`${url}/rest/v1/saved_places?id=eq.${id}`, {
        method: 'PATCH', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify(row),
      });
      if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
    },
    async insert(row) {
      const r = await fetchImpl(`${url}/rest/v1/saved_places`, {
        method: 'POST', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify(row),
      });
      if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const fileArg = args[args.indexOf('--file') + 1];
  const here = path.dirname(fileURLToPath(import.meta.url));
  const file = args.includes('--file') ? fileArg : path.join(here, 'public-places.json');

  const gKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!gKey) throw new Error('Set GOOGLE_MAPS_SERVER_KEY');
  const db = apply ? supa(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) : null;
  if (apply && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for --apply');
  }

  const { places } = JSON.parse(await readFile(file, 'utf8'));
  let ok = 0, missing = 0, written = 0;
  for (const entry of places) {
    const bad = validateEntry(entry);
    if (bad) { console.log(`SKIP  ${entry?.label ?? '?'}: ${bad}`); continue; }
    const found = await googleSearch(entry.query, gKey);
    if (!found) { missing++; console.log(`NONE  ${entry.label}  (query: "${entry.query}")`); continue; }
    ok++;
    console.log(`FOUND ${entry.label.padEnd(42)} → ${found.name} · ${found.address} · ${found.lat.toFixed(5)},${found.lng.toFixed(5)}`);
    if (!apply) continue;
    const row = rowFor(entry, found);
    // Same Google place, or a place we already learnt within 60 m (e.g. from bookings): upgrade it.
    const id = (await db.byPlaceId(found.placeId)) ?? (await db.nearest(found.lat, found.lng, 60));
    if (id) await db.update(id, row); else await db.insert(row);
    written++;
  }
  console.log(`\n${ok} found, ${missing} not found${apply ? `, ${written} written` : ' (dry run: nothing written; add --apply)'}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
