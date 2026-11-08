import 'server-only';
import { features } from '@tem/features';
import { priceTrip } from '@tem/pricing';
import { toIsoWithOffset, localToInstant } from '../booking/time';
import { BookingError } from '../booking/types';
import type { QuoteRequestDistance } from '../booking/validation';
import { bookingDb } from './db';
import { demandFactorsForClasses, publicBreakdown } from './demand';
import { assertInServiceArea, loadPricingContext, routeDistance } from './distance-quote';
import { statusFor } from './http';
import { hashIp, quoteSigningSecret, signQuote } from './quote-crypto';
import { assertReturnAfterOutbound, mergeReturnOption } from './return-pricing';
import { getSettings } from './settings';

/**
 * PRICING_MODE=distance (FIX-2). Every price is Google km + min x the class rates.
 * No zone lookup, no zone price, no zone in the request or on the quote row.
 */

type Body = ReturnType<typeof QuoteRequestDistance.parse>;
type Line = { code: string; label: string; amount: number };
type Overrides = {
  rates?: Record<string, Record<string, number>>;
  settings?: Record<string, unknown>;
} | null;

export type QuoteFailureCtx = { distanceKm?: number | null; durationMin?: number | null };

export async function quoteDistanceFirst(a: {
  body: Body;
  ip?: string;
  simulate: boolean;
  overrides: Overrides;
  company: { prices: Record<string, number>; discountPct: number } | null;
  /** Set for business-area quotes (the public checkout refuses them). */
  companyId: string | null;
  ctx: QuoteFailureCtx;
}) {
  const { body, ip, simulate, overrides, company, companyId, ctx } = a;
  const db = bookingDb();
  const settings = await getSettings();
  const transfer = body.type === 'transfer';
  const pickup = localToInstant(body.pickupLocal, settings.timezone);
  const returnLeg = features().returnTrip && body.type === 'transfer' ? (body.return ?? null) : null;
  const returnPickup = returnLeg ? localToInstant(returnLeg.pickupLocal, settings.timezone) : null;

  // 1. return before outbound, then minimum notice.
  if (returnPickup && returnPickup.getTime() <= pickup.getTime()) {
    throw new BookingError('return_before_outbound', {
      stringKey: 'error.return_before_outbound',
      message: 'return_before_outbound',
      field: 'returnPickupLocal',
    });
  }
  if (pickup.getTime() < Date.now() + settings.minLeadMinutes * 60_000) {
    throw new BookingError('pickup_too_soon', {
      stringKey: 'error.pickup_too_soon',
      vars: { hours: Math.ceil(settings.minLeadMinutes / 60) },
      message: 'pickup_too_soon',
      field: 'pickupLocal',
    });
  }

  // 2. service area, then Google Routes (never the browser's distance).
  const origin = body.pickupPlace!;
  const destination = body.type === 'transfer' ? body.dropoffPlace! : null;
  await assertInServiceArea(destination ? [origin, destination] : [origin]);

  let distanceKm: number | null = null;
  let durationMin = body.type === 'hourly' ? body.hours * 60 : 0;
  if (body.type === 'transfer') {
    const routed = await routeDistance({
      origin,
      destination: destination!,
      stops: body.stops,
      departAt: pickup,
    });
    distanceKm = routed.distanceKm;
    durationMin = routed.durationMin;
    ctx.distanceKm = distanceKm;
    ctx.durationMin = durationMin;
  }

  const pctx = await loadPricingContext();
  const rates = { ...pctx.rates };
  for (const [key, patch] of Object.entries(overrides?.rates ?? {})) {
    rates[key] = { ...(rates[key] ?? {}), ...patch, class_key: key } as (typeof rates)[string];
  }
  const sdoc = { ...pctx.settings, ...(overrides?.settings ?? {}) } as typeof pctx.settings;

  // 3. quote-only above N km.
  if (!simulate && distanceKm != null && sdoc.quote_only_over_km && distanceKm > sdoc.quote_only_over_km) {
    throw new BookingError('quote_only_distance', {
      stringKey: 'error.quote_only_distance',
      message: 'quote_only_distance',
    });
  }

  const classes = (
    await db.query<{
      id: string;
      key: string;
      buffer_minutes: number;
      rate_cents: number | null;
      min_hours: number | null;
      max_hours: number | null;
    }>(
      `select c.id, c.key, c.buffer_minutes,
              h.price_per_hour_cents as rate_cents, h.min_hours, h.max_hours
         from public.vehicle_classes c
         left join public.hourly_rates h on h.class_id = c.id
        where c.active and c.max_passengers >= $1 and c.max_luggage >= $2
        order by c.sort_order`,
      [body.passengers, body.luggage],
    )
  ).rows;
  if (!classes.length) {
    throw new BookingError('no_price', { stringKey: 'error.no_price', message: 'no_price' });
  }

  const priceLeg = async (leg: {
    from: { lat: number; lng: number };
    to: { lat: number; lng: number } | null;
    at: Date;
    km: number | null;
    min: number;
    stops?: { lat: number; lng: number }[];
  }) => {
    const demandSnaps = await demandFactorsForClasses({
      classes: classes.map((c) => ({ id: c.id, key: c.key })),
      pickupAt: leg.at,
      durationMin: leg.min,
      demand: sdoc.demand,
    });
    const priced = priceTrip({
      trip: {
        type: body.type,
        pickupAt: leg.at,
        distanceKm: leg.km,
        durationMin: leg.min,
        hours: body.type === 'hourly' ? body.hours : null,
        stops: leg.stops ?? [],
        pickup: leg.from,
        dropoff: leg.to,
      },
      classes: classes.map((c) => ({
        key: c.key,
        hourlyRateCents: c.rate_cents,
        minHours: c.min_hours,
        maxHours: c.max_hours,
      })),
      rates,
      settings: sdoc,
      periods: pctx.periods,
      areas: pctx.areas,
      mode: 'distance',
      demand: Object.fromEntries(Object.entries(demandSnaps).map(([k, s]) => [k, s.factor])),
      company,
      vatRateBp: pctx.vatRateBp,
    });
    const out = new Map<
      string,
      { cents: number | null; available: boolean; reason?: string; breakdown: Line[]; net: number; vat: number; demandFactor: number }
    >();
    for (const c of classes) {
      const p = priced.perClass[c.key]!;
      const snap = demandSnaps[c.key];
      let available = p.available && !snap?.unavailable;
      if (available) {
        const { rows } = await db.query<{ n: number }>(
          `select public.class_availability(
             $1::uuid, public.blocked_range_for($2::timestamptz, $3::int, $4::int)
           ) as n`,
          [c.id, leg.at.toISOString(), leg.min, c.buffer_minutes],
        );
        available = (rows[0]?.n ?? 0) > 0;
      }
      out.set(c.key, {
        cents: p.available ? p.total : null,
        available,
        reason: snap?.unavailable ? 'unavailable' : p.reason,
        breakdown: simulate ? p.breakdown : publicBreakdown(p.breakdown),
        net: p.net,
        vat: p.vat,
        demandFactor: p.demandFactor ?? snap?.factor ?? 1,
      });
    }
    return out;
  };

  const outLeg = await priceLeg({
    from: origin,
    to: destination,
    at: pickup,
    km: distanceKm,
    min: durationMin,
    stops: body.type === 'transfer' ? body.stops : undefined,
  });

  // Return leg: its own route, time and night factor, then the return discount.
  let returnDistanceKm: number | null = null;
  let returnDurationMin: number | null = null;
  let returnLegPrices: Awaited<ReturnType<typeof priceLeg>> | null = null;
  let returnDiscountPct = 0;
  if (returnPickup && destination) {
    assertReturnAfterOutbound(pickup, durationMin, returnPickup);
    const r = await routeDistance({ origin: destination, destination: origin, departAt: returnPickup });
    returnDistanceKm = r.distanceKm;
    returnDurationMin = r.durationMin;
    returnDiscountPct = Number(sdoc.return_discount_pct) || 0;
    returnLegPrices = await priceLeg({
      from: destination,
      to: origin,
      at: returnPickup,
      km: r.distanceKm,
      min: r.durationMin,
    });
  }

  const options: {
    classKey: string;
    baseCents: number | null;
    available: boolean;
    reason?: string;
    breakdown?: Line[];
    outbound?: number | null;
    return?: number | null;
    total?: number | null;
    returnDiscountPct?: number;
    returnBreakdown?: Line[];
  }[] = [];
  const prices: Record<string, unknown> = {};
  for (const c of classes) {
    const o = outLeg.get(c.key)!;
    const outbound = {
      baseCents: o.cents,
      available: o.available,
      reason: o.cents == null ? (o.reason ?? 'not_priced') : o.available ? undefined : 'unavailable',
      breakdown: o.cents != null ? o.breakdown : undefined,
    };
    const rl = returnLegPrices?.get(c.key);
    if (rl) {
      const merged = mergeReturnOption(
        outbound,
        {
          baseCents: rl.cents,
          available: rl.available,
          reason: rl.cents == null ? 'not_priced' : undefined,
          breakdown: rl.breakdown,
        },
        returnDiscountPct,
      );
      options.push({ classKey: c.key, ...merged });
      prices[c.key] = {
        total: merged.total,
        outbound: merged.outbound,
        return: merged.return,
        available: merged.available && merged.baseCents != null,
        breakdown: merged.breakdown ?? [],
        returnBreakdown: merged.returnBreakdown ?? [],
        demandFactor: o.demandFactor,
        ...(merged.reason ? { reason: merged.reason } : {}),
      };
    } else {
      options.push({ classKey: c.key, ...outbound });
      prices[c.key] = {
        total: o.available ? o.cents : null,
        net: o.net,
        vat: o.vat,
        breakdown: outbound.breakdown ?? [],
        available: o.available,
        demandFactor: o.demandFactor,
        ...(outbound.reason ? { reason: outbound.reason } : {}),
      };
    }
  }

  // 4. nothing priced → not_priced (rates are 0); everything priced but busy → unavailable.
  const priced = options.filter((o) => o.baseCents != null);
  if (!priced.length) {
    throw new BookingError('not_priced', { stringKey: 'error.not_priced', message: 'not_priced' });
  }
  if (!priced.some((o) => o.available)) {
    throw new BookingError('unavailable', { stringKey: 'error.unavailable', message: 'unavailable' });
  }

  const pricingVersion = {
    pricingMode: 'distance' as const,
    settingsId: pctx.settingsId,
    rateIds: pctx.rateIds,
    source: 'distance',
    return: returnPickup ? true : undefined,
    simulate: simulate || undefined,
  };
  const pickupAt = toIsoWithOffset(pickup, settings.timezone);
  const returnPickupAt = returnPickup ? toIsoWithOffset(returnPickup, settings.timezone) : undefined;
  const classRows = options.map((o) => ({
    key: o.classKey,
    total: o.total ?? o.baseCents,
    outbound: o.outbound,
    return: o.return,
    available: o.available && o.baseCents != null,
    breakdown: o.breakdown,
    demandFactor: (prices[o.classKey] as { demandFactor: number }).demandFactor,
  }));

  if (simulate) {
    return {
      pickupAt,
      durationMinutes: durationMin,
      currency: 'EUR' as const,
      options,
      distanceKm,
      durationMin,
      returnPickupAt,
      returnDiscountPct: returnPickup ? returnDiscountPct : undefined,
      pricingVersion,
      classes: classRows,
    };
  }

  const secret = quoteSigningSecret();
  if (!secret) {
    throw new BookingError('service_unavailable', {
      stringKey: 'error.service_unavailable',
      message: 'pricing_failed',
    });
  }
  const expiresAtFinal = new Date(Date.now() + (sdoc.quote_ttl_min ?? 20) * 60_000).toISOString();
  // ponytail: a place without a Google placeId gets a coordinate id so the quotes/bookings
  // "place complete" checks pass; the id is never sent to Google.
  const pid = (p: { placeId?: string; lat: number; lng: number }) =>
    p.placeId ?? `coords-${p.lat.toFixed(5)}-${p.lng.toFixed(5)}`;
  const { rows: inserted } = await db.query<{ id: string; expires_at: Date }>(
    `insert into public.quotes (
       mode, pickup_at, hours, distance_km, duration_min,
       from_zone_code, to_zone_code, passengers, luggage, prices, pricing_version,
       expires_at, ip_hash,
       pickup_place_id, pickup_lat, pickup_lng,
       dropoff_place_id, dropoff_lat, dropoff_lng,
       return_pickup_at, return_duration_min, return_distance_km,
       company_id
     ) values (
       $1, $2::timestamptz, $3, $4, $5,
       null, null, $6, $7, $8::jsonb, $9::jsonb,
       $10::timestamptz, $11,
       $12, $13, $14, $15, $16, $17,
       $18::timestamptz, $19, $20,
       $21::uuid
     ) returning id, expires_at`,
    [
      body.type,
      pickup.toISOString(),
      body.type === 'hourly' ? body.hours : null,
      distanceKm,
      durationMin,
      body.passengers,
      body.luggage,
      JSON.stringify(prices),
      JSON.stringify(pricingVersion),
      expiresAtFinal,
      hashIp(ip),
      pid(origin),
      origin.lat,
      origin.lng,
      destination ? pid(destination) : null,
      destination?.lat ?? null,
      destination?.lng ?? null,
      returnPickup?.toISOString() ?? null,
      returnDurationMin,
      returnDistanceKm,
      companyId,
    ],
  );
  const quoteId = inserted[0]!.id;
  const expiresAt = new Date(inserted[0]!.expires_at).toISOString();

  return {
    pickupAt,
    durationMinutes: durationMin,
    currency: 'EUR' as const,
    options,
    quoteId,
    expiresAt,
    signature: signQuote(secret, quoteId, expiresAt),
    distanceKm,
    durationMin,
    pricingVersion,
    classes: options.map((o) => ({
      key: o.classKey,
      total: o.baseCents,
      available: o.available && o.baseCents != null,
    })),
  };
}

// ---------------------------------------------------------------------------
// quote_failures (0036): one row per failed quote, no personal data.
// ---------------------------------------------------------------------------

const REASONS = new Set([
  'return_before_outbound', 'pickup_too_soon', 'no_route', 'outside_area', 'quote_only_distance',
  'not_priced', 'unavailable', 'routing_failed', 'pricing_failed', 'invalid_request',
]);

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown, max = 40) => (typeof v === 'string' ? v.slice(0, max) : undefined);
const pt = (v: unknown) => {
  const p = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  return p ? { lat: num(p.lat), lng: num(p.lng), placeId: str(p.placeId, 255) } : undefined;
};

/** Coordinates, times, passengers only. Never an address, name, email or phone. */
function safeRequest(raw: unknown) {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const ret = r.return && typeof r.return === 'object' ? (r.return as Record<string, unknown>) : null;
  return {
    type: str(r.type),
    pickup: pt(r.pickupPlace),
    dropoff: pt(r.dropoffPlace),
    pickupLocal: str(r.pickupLocal),
    returnPickupLocal: ret ? str(ret.pickupLocal) : undefined,
    hours: num(r.hours),
    passengers: num(r.passengers),
    luggage: num(r.luggage),
    stops: Array.isArray(r.stops) ? r.stops.length : undefined,
  };
}

export async function logQuoteFailure(raw: unknown, e: unknown, ip: string | undefined, ctx: QuoteFailureCtx) {
  let reason = 'other';
  let status = 500;
  let detail = e instanceof Error ? e.message.slice(0, 120) : 'unknown';
  if (e instanceof BookingError) {
    if (e.message === 'rate_limit') return; // not a quote problem
    status = statusFor(e);
    reason = e.code === 'service_unavailable' ? (e.message === 'pricing_failed' ? 'pricing_failed' : 'routing_failed') : e.code;
    if (!REASONS.has(reason)) return; // no_price etc. are not part of the distance-first set
    detail = e.message.slice(0, 120);
  }
  console.error(JSON.stringify({ level: 'error', code: 'quote_failed', reason, status, detail }));
  try {
    await bookingDb().query(
      `insert into public.quote_failures (http_status, reason, detail, request, distance_km, duration_min, ip_hash)
       values ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
      [status, reason, detail, JSON.stringify(safeRequest(raw)), ctx.distanceKm ?? null, ctx.durationMin ?? null, hashIp(ip)],
    );
  } catch {
    /* logging must never break the quote answer (0036 not applied yet) */
  }
}
