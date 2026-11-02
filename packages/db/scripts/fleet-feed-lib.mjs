// Fleet and pricing feed (data/fleet-feed.json): validation and conversion, shared by the database importer
// (packages/db/scripts/import-fleet-feed.mjs) and the Sanity importer (apps/studio/scripts/import-fleet-feed.mjs).
// Pure functions only: no database, no network. Rules: docs/FLEET-FEED.md.
import { readFileSync } from 'node:fs';

const KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ZONE_KINDS = ['airport', 'city', 'port', 'area', 'other'];
const BOOKING_TYPES = ['transfer', 'hourly'];
const BRAND = 'Elite Protection';

export function loadFeed(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const int = (v) => Number.isInteger(v) && v >= 0;
const val = (s) => (s && typeof s === 'object' && 'value' in s ? s.value : s);
const demo = (s) => Boolean(s && typeof s === 'object' && s.demo);

/** Final price the customer pays, in cents. The feed may hold prices before VAT. */
export function finalCents(cents, vatRatePercent, pricesIncludeVat) {
  if (pricesIncludeVat) return cents;
  return Math.round((cents * (100 + vatRatePercent)) / 100);
}

/** Replaces the old working name in customer-facing text. */
export function brand(text) {
  return typeof text === 'string' ? text.replace(/TEM Protection/g, BRAND) : text;
}

/** Returns { errors: string[], warnings: string[] }. Errors stop the import. */
export function validateFeed(feed) {
  const errors = [];
  const warnings = [];
  const e = (m) => errors.push(m);
  if (!feed || typeof feed !== 'object') return { errors: ['feed is not a JSON object'], warnings };
  if (feed.currency !== 'EUR') e(`currency must be EUR, got ${feed.currency}`);
  const s = feed.settings ?? {};
  const rate = val(s.vat_rate_percent);
  if (!(typeof rate === 'number' && rate >= 0 && rate <= 100)) e('settings.vat_rate_percent.value must be a number between 0 and 100');
  if (typeof s.prices_include_vat !== 'boolean') e('settings.prices_include_vat must be true or false');
  if (s.booking_reference_format) warnings.push(`settings.booking_reference_format ("${s.booking_reference_format}") is ignored: references are ELP-XXXXXX (migration 0017)`);
  for (const k of ['default_buffer_minutes', 'hourly_max_hours']) if (k in s) warnings.push(`settings.${k} is informational: each class carries its own buffer and hourly maximum`);

  const classes = new Set();
  for (const c of feed.vehicle_classes ?? []) {
    if (!KEY.test(c.key ?? '')) e(`vehicle class key "${c.key}" must be lower-case letters, numbers and hyphens`);
    if (classes.has(c.key)) e(`vehicle class "${c.key}" appears twice`);
    classes.add(c.key);
    const o = c.operations ?? {};
    if (!(Number.isInteger(o.max_passengers) && o.max_passengers > 0)) e(`${c.key}: operations.max_passengers must be a positive whole number`);
    if (!int(o.max_luggage)) e(`${c.key}: operations.max_luggage must be a whole number`);
    if (!(Number.isInteger(o.buffer_minutes) && o.buffer_minutes >= 0 && o.buffer_minutes <= 240)) e(`${c.key}: operations.buffer_minutes must be 0–240`);
    const ct = c.content ?? {};
    if (!ct.name || !ct.short_name) e(`${c.key}: content.name and content.short_name are required`);
    if (!Array.isArray(ct.images) || ct.images.length < 1 || ct.images.length > 12) e(`${c.key}: content.images must list 1–12 files`);
    if (ct.hero_image && !(ct.images ?? []).includes(ct.hero_image)) e(`${c.key}: content.hero_image must be one of content.images`);
  }
  if (classes.size === 0) e('vehicle_classes is empty');

  const labels = new Set();
  for (const v of feed.vehicles ?? []) {
    if (!v.label) e('a vehicle has no label');
    const l = (v.label ?? '').toLowerCase();
    if (labels.has(l)) e(`vehicle label "${v.label}" appears twice`);
    labels.add(l);
    if (!classes.has(v.class_key)) e(`vehicle "${v.label}" uses unknown class "${v.class_key}"`);
    if (!['active', 'maintenance', 'retired'].includes(v.status ?? 'active')) e(`vehicle "${v.label}": status must be active, maintenance or retired`);
  }

  const zones = new Set();
  for (const z of feed.zones ?? []) {
    if (!KEY.test(z.code ?? '')) e(`zone code "${z.code}" must be lower-case letters, numbers and hyphens`);
    if (zones.has(z.code)) e(`zone "${z.code}" appears twice`);
    zones.add(z.code);
    if (z.type && !ZONE_KINDS.includes(z.type)) e(`zone "${z.code}": type must be one of ${ZONE_KINDS.join(', ')}`);
  }

  const routes = new Set();
  for (const r of feed.zone_routes ?? []) {
    if (!zones.has(r.from_zone) || !zones.has(r.to_zone)) e(`route ${r.from_zone} → ${r.to_zone} uses an unknown zone`);
    if (r.from_zone === r.to_zone) e(`route ${r.from_zone} → ${r.to_zone} starts and ends in the same zone`);
    if (!(Number.isInteger(r.duration_minutes) && r.duration_minutes > 0)) e(`route ${r.from_zone} → ${r.to_zone}: duration_minutes must be a positive whole number`);
    routes.add(`${r.from_zone}>${r.to_zone}`);
    if (r.bidirectional) routes.add(`${r.to_zone}>${r.from_zone}`);
  }

  const priced = new Set();
  for (const p of feed.zone_prices ?? []) {
    if (!classes.has(p.class_key)) e(`price ${p.from_zone} → ${p.to_zone} uses unknown class "${p.class_key}"`);
    if (!routes.has(`${p.from_zone}>${p.to_zone}`)) e(`price ${p.from_zone} → ${p.to_zone} (${p.class_key}) has no route with a duration`);
    if (p.bidirectional && !routes.has(`${p.to_zone}>${p.from_zone}`)) e(`price ${p.to_zone} → ${p.from_zone} (${p.class_key}, bidirectional) has no route`);
    if (!int(p.price_cents)) e(`price ${p.from_zone} → ${p.to_zone} (${p.class_key}) must be whole cents`);
    for (const k of [`${p.from_zone}>${p.to_zone}>${p.class_key}`, ...(p.bidirectional ? [`${p.to_zone}>${p.from_zone}>${p.class_key}`] : [])]) {
      if (priced.has(k)) e(`price ${k.replaceAll('>', ' → ')} is given twice`);
      priced.add(k);
    }
  }

  for (const h of feed.hourly_rates ?? []) {
    if (!classes.has(h.class_key)) e(`hourly rate uses unknown class "${h.class_key}"`);
    if (!int(h.price_per_hour_cents)) e(`hourly rate ${h.class_key}: price_per_hour_cents must be whole cents`);
    if (!(h.min_hours >= 1 && h.max_hours >= h.min_hours && h.max_hours <= 24)) e(`hourly rate ${h.class_key}: need 1 ≤ min_hours ≤ max_hours ≤ 24`);
  }

  const extras = new Set();
  for (const x of feed.extras ?? []) {
    if (!KEY.test(x.code ?? '')) e(`extra code "${x.code}" must be lower-case letters, numbers and hyphens`);
    if (extras.has(x.code)) e(`extra "${x.code}" appears twice`);
    extras.add(x.code);
    if (!int(x.price_cents)) e(`extra ${x.code}: price_cents must be whole cents`);
    const at = x.applies_to ?? BOOKING_TYPES;
    if (!Array.isArray(at) || at.length === 0 || at.some((t) => !BOOKING_TYPES.includes(t))) e(`extra ${x.code}: applies_to must list transfer and/or hourly`);
    if (x.max_quantity !== undefined && !(Number.isInteger(x.max_quantity) && x.max_quantity >= 1 && x.max_quantity <= 10)) e(`extra ${x.code}: max_quantity must be 1–10`);
  }
  for (const code of ['vip-security', 'night-surcharge']) if (!extras.has(code)) warnings.push(`extra "${code}" is built into the booking flow and is missing from the feed: it is kept as it is`);
  if (s.prices_include_vat === false) warnings.push(`prices in the feed are before VAT: stored as final prices (+${rate}%), e.g. 18000 → ${finalCents(18000, rate, false)} cents`);
  return { errors, warnings };
}

/** Turns the feed into the rows the database importer writes (both directions expanded, final prices). */
export function toDbRows(feed) {
  const s = feed.settings;
  const rate = val(s.vat_rate_percent);
  const incl = s.prices_include_vat;
  const fin = (c) => finalCents(c, rate, incl);
  const settings = [
    { key: 'hold_minutes', value: val(s.hold_minutes), is_demo: demo(s.hold_minutes) },
    { key: 'min_lead_minutes', value: val(s.min_lead_minutes), is_demo: demo(s.min_lead_minutes) },
    { key: 'cancel_window_hours', value: val(s.refund_window_hours), is_demo: demo(s.refund_window_hours) },
    { key: 'vat_rate_bp', value: Math.round(rate * 100), is_demo: demo(s.vat_rate_percent) },
  ].filter((r) => r.value !== undefined && r.value !== null);
  const classes = feed.vehicle_classes.map((c) => ({
    key: c.key, name: c.content.name, max_passengers: c.operations.max_passengers, max_luggage: c.operations.max_luggage,
    buffer_minutes: c.operations.buffer_minutes, sort_order: c.sort_order * 10, active: c.active !== false, is_demo: Boolean(c.operations.demo),
  }));
  const vehicles = (feed.vehicles ?? []).map((v) => ({ label: v.label, class_key: v.class_key, plate: v.plate ?? null, status: v.status ?? 'active', is_demo: Boolean(v.demo) }));
  const zones = (feed.zones ?? []).map((z) => ({ code: z.code, name: z.name, kind: z.type ?? 'area', sort_order: z.sort_order * 10, active: z.active !== false, is_demo: Boolean(z.demo) }));
  const routes = [];
  for (const r of feed.zone_routes ?? []) {
    routes.push({ from: r.from_zone, to: r.to_zone, duration_minutes: r.duration_minutes, is_demo: Boolean(r.demo) });
    if (r.bidirectional) routes.push({ from: r.to_zone, to: r.from_zone, duration_minutes: r.duration_minutes, is_demo: Boolean(r.demo) });
  }
  const prices = [];
  for (const p of feed.zone_prices ?? []) {
    prices.push({ from: p.from_zone, to: p.to_zone, class_key: p.class_key, price_cents: fin(p.price_cents), is_demo: Boolean(p.demo) });
    if (p.bidirectional) prices.push({ from: p.to_zone, to: p.from_zone, class_key: p.class_key, price_cents: fin(p.price_cents), is_demo: Boolean(p.demo) });
  }
  const hourly = (feed.hourly_rates ?? []).map((h) => ({ class_key: h.class_key, price_per_hour_cents: fin(h.price_per_hour_cents), min_hours: h.min_hours, max_hours: h.max_hours, is_demo: Boolean(h.demo) }));
  const extras = (feed.extras ?? []).map((x) => ({ code: x.code, name: x.name, price_cents: fin(x.price_cents), active: x.active !== false, applies_to: x.applies_to ?? BOOKING_TYPES, max_quantity: x.max_quantity ?? 1, is_demo: Boolean(x.demo) }));
  return { settings, classes, vehicles, zones, routes, prices, hourly, extras };
}

const human = (file, shortName) => {
  const part = file.replace(/\.[a-z]+$/, '').split('-').slice(-1)[0];
  const words = { ext: 'exterior', int: 'interior', int2: 'interior', dash: 'dashboard', cabin: 'cabin', lounge: 'lounge seating', street: 'on a city street', night: 'at night', marina: 'at a marina', terminal: 'at the airport terminal', front: 'front view', city: 'in the city', drive: 'on the road', chauffeur: 'with chauffeur', london: 'outside a hotel', '9': 'passenger seating', '1': 'cabin', '2': 'lounge seating', '3': 'interior lighting' };
  return `${shortName} ${words[part] ?? part}`.trim();
};

/** Sanity vehicleClass content per class: document id, fields to set, images to upload (hero first). */
export function toSanityDocs(feed) {
  return feed.vehicle_classes.map((c) => {
    const ct = c.content;
    const images = [ct.hero_image ?? ct.images[0], ...ct.images.filter((i) => i !== (ct.hero_image ?? ct.images[0]))];
    return {
      _id: `vehicleClass-${c.key}`,
      key: c.key,
      set: {
        name: ct.short_name,
        fullName: ct.name,
        tagline: ct.kind_label,
        group: ct.group,
        amenities: ct.amenities ?? [],
        sortOrder: c.sort_order * 10,
        copy: ct.blurb,
        specs: [
          ['Passengers', `Up to ${c.operations.max_passengers}`],
          ['Luggage', `Up to ${c.operations.max_luggage}`],
          ['Type', ct.kind_label],
        ],
        seo: { title: brand(ct.seo?.title), description: brand(ct.seo?.description ?? ct.blurb) },
        internalNote: c.operations.demo ? 'DEMO: capacities from the fleet feed, to confirm with the client.' : undefined,
      },
      images: images.map((file) => ({ file, alt: human(file, ct.short_name) })),
    };
  });
}

/** The vehicleClass fields the Sanity importer sets, given the uploaded asset ids (same order as entry.images). */
export function buildVehicleClassPatch(entry, assetIds) {
  let n = 0;
  const k = () => `feed${(++n).toString(36).padStart(4, '0')}`;
  const { copy, specs, internalNote, ...rest } = entry.set;
  const patch = {
    ...rest,
    copy: [{ _type: 'block', _key: k(), style: 'normal', markDefs: [], children: [{ _type: 'span', _key: k(), text: copy, marks: [] }] }],
    specs: specs.map(([label, value]) => ({ _type: 'spec', _key: k(), label, value })),
    photos: entry.images.map((img, i) => ({ _type: 'image', _key: k(), asset: { _type: 'reference', _ref: assetIds[i] }, alt: img.alt })),
    seo: { _type: 'seo', ...entry.set.seo },
  };
  if (internalNote) patch.internalNote = internalNote;
  return patch;
}
