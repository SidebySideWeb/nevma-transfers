import 'server-only';
import { createHash } from 'node:crypto';
import { features } from '@tem/features';
import { applyCompanyDiscount, companyBasePrice } from '@tem/pricing';
import { expandExtraCodes, formatEuro, normaliseExtraChoices, quoteHourly, quoteTransfer } from '../booking/pricing';
import { placeLabel, transferRouteLabel } from '../booking/route-label';
import { assertLeadTime, formatLocal, localToInstant, toIsoWithOffset } from '../booking/time';
import { BookingError } from '../booking/types';
import {
  BookingRequest,
  CancelRequest,
  HoldRequest,
  QuoteCheckoutRequest,
  QuoteRequest,
  QuoteRequestDistance,
  rejectMoneyFields,
} from '../booking/validation';
import { bookingDb, type BookingDb } from './db';
import { demandFactorsForClasses, publicBreakdown } from './demand';
import {
  assertInServiceArea,
  loadPricingContext,
  priceTrip,
  routeDistance,
  zonePriceCents,
} from './distance-quote';
import { mapPgBookingError } from './http';
import { fireOnCancelled } from './hooks';
import { getPaymentProvider } from './payments';
import { parsePlace, placeColumns, PlacesError } from '@tem/places';
import { logQuoteFailure, quoteDistanceFirst, type QuoteFailureCtx } from './quote-distance';
import { hashIp, quoteSigningSecret, signQuote, verifyQuoteSignature } from './quote-crypto';
import { assertRateLimit, RATE } from './rate-limit';
import { assertReturnAfterOutbound, mergeReturnOption } from './return-pricing';
import { getSettings } from './settings';
import { quoteTrip, zoneByCode, routeDuration } from './trip-quote';
import { verifyTurnstile } from './turnstile';

export type SanityVehicleClass = {
  key: string;
  name: string;
  fullName?: string | null;
  tagline?: string | null;
  group?: string | null;
  photos?: {
    url?: string | null;
    alt?: string | null;
    asset?: {
      _id?: string;
      url?: string | null;
      metadata?: { dimensions?: { width?: number; height?: number } } | null;
    } | null;
  }[] | null;
  copy?: Record<string, unknown>[] | null;
  specs?: { label: string; value: string }[] | null;
  seo?: {
    title?: string | null;
    description?: string | null;
    noindex?: boolean | null;
  } | null;
};

let sanityClasses: SanityVehicleClass[] | null = null;
const missingSanityLogged = new Set<string>();

/** Inject Sanity vehicle class content (or test stubs). Null = fetch/empty. */
export function setSanityVehicleClasses(classes: SanityVehicleClass[] | null): void {
  sanityClasses = classes;
  missingSanityLogged.clear();
}

export async function requireTurnstile(token: string | undefined, ip?: string): Promise<void> {
  if (!token || !(await verifyTurnstile(token, ip))) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'turnstile_failed',
      field: 'turnstileToken',
    });
  }
}

function db(): BookingDb {
  return bookingDb();
}

// ---------------------------------------------------------------------------
// GET /api/booking-options
// ---------------------------------------------------------------------------

async function loadSanityClasses(): Promise<SanityVehicleClass[]> {
  if (sanityClasses) return sanityClasses;
  try {
    const { createSanityClient } = await import('../sanity/client');
    const { VEHICLE_CLASSES_QUERY } = await import('../sanity/queries');
    const client = createSanityClient();
    const rows = await client.fetch<
      {
        key: string;
        name: string;
        fullName?: string | null;
        tagline?: string | null;
        group?: string | null;
        photos?: {
          alt?: string | null;
          asset?: {
            _id?: string;
            url?: string | null;
            metadata?: { dimensions?: { width?: number; height?: number } } | null;
          } | null;
        }[] | null;
        copy?: Record<string, unknown>[] | null;
        specs?: { label?: string | null; value?: string | null }[] | null;
        seo?: {
          title?: string | null;
          description?: string | null;
          noindex?: boolean | null;
        } | null;
      }[]
    >(VEHICLE_CLASSES_QUERY);
    return (rows ?? []).map((r) => ({
      key: r.key,
      name: r.name,
      fullName: r.fullName ?? null,
      tagline: r.tagline,
      group: r.group ?? null,
      photos: (r.photos ?? []).map((p) => ({
        url: p.asset?.url ?? null,
        alt: p.alt ?? null,
        asset: p.asset,
      })),
      copy: r.copy ?? null,
      specs: (r.specs ?? [])
        .filter((s): s is { label: string; value: string } => Boolean(s.label && s.value))
        .map((s) => ({ label: s.label, value: s.value })),
      seo: r.seo ?? null,
    }));
  } catch {
    return [];
  }
}

/** Shared with kit 2 publishable fleet (prompt 16). */
export async function loadSanityVehicleClasses(): Promise<SanityVehicleClass[]> {
  return loadSanityClasses();
}

export function warnMissingSanityClass(key: string): void {
  if (missingSanityLogged.has(key)) return;
  missingSanityLogged.add(key);
  console.error(JSON.stringify({ level: 'warn', code: 'missing_sanity_class', key }));
}

export async function bookingOptions() {
  const settings = await getSettings();
  const classesContent = await loadSanityClasses();

  const zones = (
    await db().query<{ code: string; name: string }>(
      `select code, name from public.zones where active order by sort_order, code`,
    )
  ).rows;

  const classRows = (
    await db().query<{
      key: string;
      max_passengers: number;
      max_luggage: number;
      min_hours: number | null;
      max_hours: number | null;
    }>(
      `select c.key, c.max_passengers, c.max_luggage, h.min_hours, h.max_hours
         from public.vehicle_classes c
         left join public.hourly_rates h on h.class_id = c.id
        where c.active
        order by c.sort_order, c.key`,
    )
  ).rows;

  const byKey = new Map(classesContent.map((c) => [c.key, c]));
  const classes = [];
  for (const row of classRows) {
    const content = byKey.get(row.key);
    if (!content) warnMissingSanityClass(row.key);
    // Fall back to the Postgres key so booking still works when Sanity is empty/offline.
    const name = content?.name ?? row.key;
    const photo = content?.photos?.[0];
    classes.push({
      key: row.key,
      name,
      maxPassengers: row.max_passengers,
      maxLuggage: row.max_luggage,
      hourly:
        row.min_hours != null && row.max_hours != null
          ? { minHours: row.min_hours, maxHours: row.max_hours }
          : null,
      photo: photo?.url ? { url: photo.url, alt: photo.alt ?? name } : null,
      tagline: content?.tagline ?? null,
    });
  }

  const extras = (
    await db().query<{
      code: string;
      name: string;
      price_cents: number;
      applies_to: string[];
      max_quantity: number;
    }>(
      `select code, name, price_cents, applies_to, max_quantity
         from public.extras where active order by code`,
    )
  ).rows.map((e) => ({
    code: e.code,
    name: e.name,
    priceCents: e.price_cents,
    appliesTo: e.applies_to ?? ['transfer', 'hourly'],
    maxQuantity: e.max_quantity ?? 1,
  }));

  const f = features();
  let kmPerHour = 40;
  let waitingAirportFreeMin = 60;
  try {
    const [{ rows: rateRows }, { rows: ps }] = await Promise.all([
      db().query<{ km_per_hour: number }>(
        `select km_per_hour from public.current_class_rates order by km_per_hour desc limit 1`,
      ),
      db().query<{ doc: { waiting?: { airport_free_min?: number } } }>(
        `select doc from public.current_pricing_settings`,
      ),
    ]);
    if (rateRows[0]?.km_per_hour) kmPerHour = rateRows[0].km_per_hour;
    if (ps[0]?.doc?.waiting?.airport_free_min != null) {
      waitingAirportFreeMin = ps[0].doc.waiting.airport_free_min;
    }
  } catch {
    /* 0025 not applied — defaults */
  }

  const zoneName = new Map(zones.map((z) => [z.code, z.name]));
  const { rows: routeRows } = await db().query<{
    from_code: string;
    to_code: string;
  }>(
    `select zf.code as from_code, zt.code as to_code
       from public.zone_routes zr
       join public.zone_prices zp
         on zp.from_zone_id = zr.from_zone_id and zp.to_zone_id = zr.to_zone_id
       join public.zones zf on zf.id = zr.from_zone_id
       join public.zones zt on zt.id = zr.to_zone_id
      where zf.active and zt.active
      group by zf.code, zt.code, zf.sort_order, zt.sort_order
      order by zf.sort_order, zt.sort_order
      limit 12`,
  );
  const routes = routeRows.map((r) => ({
    fromCode: r.from_code,
    toCode: r.to_code,
    label: `${(zoneName.get(r.from_code) ?? r.from_code).replace(/^DEMO\s+/i, '')} → ${(zoneName.get(r.to_code) ?? r.to_code).replace(/^DEMO\s+/i, '')}`,
  }));

  return {
    timezone: settings.timezone,
    minLeadMinutes: settings.minLeadMinutes,
    holdMinutes: settings.holdMinutes,
    kmPerHour,
    waitingAirportFreeMin,
    returnTrip: f.returnTrip,
    flightTracking: f.flightTracking,
    zones: zones.map((z) => ({ code: z.code, name: z.name })),
    routes,
    classes,
    extras,
  };
}

// ---------------------------------------------------------------------------
// POST /api/quote
// ---------------------------------------------------------------------------

export type QuoteOpts = {
  /** Do not persist a quotes row (admin simulator). */
  simulate?: boolean;
  /** Staff-only rate/settings overrides for "compare with unsaved". */
  isStaff?: boolean;
  /** B9: authenticated company booker — prices/discount from Postgres, never the browser. */
  company?: {
    id: string;
    prices: Record<string, number>;
    discountPct: number;
  } | null;
};

/** Route failures that fall back to the fixed zone price (hybrid / zones only). */
const ROUTE_FALLBACK_CODES = new Set(['unavailable', 'service_unavailable', 'no_route']);

export async function quote(raw: unknown, ip?: string, opts: QuoteOpts = {}) {
  const ctx: QuoteFailureCtx = {};
  try {
    return await quoteInner(raw, ip, opts, ctx);
  } catch (e) {
    // FIX-2: every failed distance quote is logged (reason, status, coordinates; no personal data).
    const sim = opts.simulate === true || (raw as { simulate?: unknown } | null)?.simulate === true;
    if (features().pricingMode === 'distance' && !sim) await logQuoteFailure(raw, e, ip, ctx);
    throw e;
  }
}

async function quoteInner(raw: unknown, ip: string | undefined, opts: QuoteOpts, ctx: QuoteFailureCtx) {
  rejectMoneyFields(raw, ['overrides']);
  const rawObj: Record<string, unknown> =
    raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : {};
  const simulate = opts.simulate === true || rawObj.simulate === true;
  const distanceMode = features().pricingMode === 'distance';
  if (distanceMode && ('fromZone' in rawObj || 'toZone' in rawObj)) {
    // Zones play no part in distance pricing: ignore old clients that still send them.
    console.warn(JSON.stringify({ level: 'warn', code: 'client sent zones' }));
    delete rawObj.fromZone;
    delete rawObj.toZone;
  }
  if (rawObj.overrides != null && !opts.isStaff) {
    const err = new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'overrides_forbidden',
    });
    (err as BookingError & { httpStatus?: number }).httpStatus = 403;
    throw err;
  }
  if (ip && !simulate) {
    const lim = features().distancePricing ? RATE.quotePerIpDistance : RATE.quotePerIp;
    await assertRateLimit(`quote:ip:${ip}`, lim.windowSeconds, lim.max);
  }

  const { simulate: _s, overrides: _o, ...quoteRaw } = rawObj;
  const parsed = (distanceMode ? QuoteRequestDistance : QuoteRequest).safeParse(quoteRaw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field =
      first && typeof first.path[0] === 'string'
        ? String(first.path[0] === 'return' ? 'returnPickupLocal' : first.path[0])
        : undefined;
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: first?.message ?? parsed.error.message,
      field,
    });
  }
  const body = parsed.data;
  const fEarly = features();
  const returnLeg =
    fEarly.returnTrip &&
    body.type === 'transfer' &&
    'return' in body &&
    body.return &&
    typeof body.return === 'object'
      ? body.return
      : null;
  const overrides =
    opts.isStaff && rawObj.overrides && typeof rawObj.overrides === 'object'
      ? (rawObj.overrides as {
          rates?: Record<string, Partial<{ base_fare: number; per_km: number; per_min: number; minimum_fare: number; km_per_hour: number }>>;
          settings?: Record<string, unknown>;
        })
      : null;
  if (distanceMode) {
    return quoteDistanceFirst({
      body,
      ip,
      simulate,
      overrides,
      company:
        features().corporate && opts.company
          ? { prices: opts.company.prices, discountPct: opts.company.discountPct }
          : null,
      companyId: opts.company?.id ?? null,
      ctx,
    });
  }

  const settings = await getSettings();
  const pickup = localToInstant(body.pickupLocal, settings.timezone);
  assertLeadTime(pickup, new Date(), settings.minLeadMinutes);

  // Zones / hybrid pricing still prices from zone codes.
  if (!body.fromZone) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'fromZone required',
      field: 'fromZone',
    });
  }
  if (body.type === 'transfer' && !body.toZone) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'toZone required',
      field: 'toZone',
    });
  }
  const fromZone = body.fromZone;
  const toZone = body.type === 'transfer' ? body.toZone! : '';
  const from = await zoneByCode(fromZone, 'fromZone');
  let toId: string | null = null;
  let durationMinutes: number;

  if (body.type === 'transfer') {
    if (fromZone === toZone) {
      throw new BookingError('invalid_request', {
        stringKey: 'error.invalid_request',
        message: 'from and to must differ',
        field: 'toZone',
      });
    }
    const to = await zoneByCode(toZone, 'toZone');
    toId = to.id;
    durationMinutes = await routeDuration(from.id, to.id);
  } else {
    durationMinutes = body.hours * 60;
  }

  const company =
    features().corporate && opts.company
      ? {
          prices: opts.company.prices,
          discountPct: opts.company.discountPct,
        }
      : null;

  const classes = (
    await db().query<{
      id: string;
      key: string;
      max_passengers: number;
      max_luggage: number;
      buffer_minutes: number;
      rate_cents: number | null;
      min_hours: number | null;
      max_hours: number | null;
    }>(
      `select c.id, c.key, c.max_passengers, c.max_luggage, c.buffer_minutes,
              h.price_per_hour_cents as rate_cents, h.min_hours, h.max_hours
         from public.vehicle_classes c
         left join public.hourly_rates h on h.class_id = c.id
        where c.active
          and c.max_passengers >= $1
          and c.max_luggage >= $2
        order by c.sort_order`,
      [body.passengers, body.luggage],
    )
  ).rows;

  const options: {
    classKey: string;
    baseCents: number | null;
    available: boolean;
    reason?: string;
    breakdown?: { code: string; label: string; amount: number }[];
    outbound?: number | null;
    return?: number | null;
    total?: number | null;
    returnDiscountPct?: number;
    returnBreakdown?: { code: string; label: string; amount: number }[];
  }[] = [];

  let anyPrice = false;

  for (const c of classes) {
    let baseCents: number | null = null;
    let reason: string | undefined;
    let breakdown: { code: string; label: string; amount: number }[] | undefined;

    if (body.type === 'transfer') {
      const { rows: prices } = await db().query<{ price_cents: number }>(
        `select price_cents from public.zone_prices
          where from_zone_id = $1 and to_zone_id = $2 and class_id = $3`,
        [from.id, toId, c.id],
      );
      if (!prices[0]) {
        baseCents = null;
        reason = 'no_price';
      } else {
        baseCents = quoteTransfer({ zonePriceCents: prices[0].price_cents });
        anyPrice = true;
        breakdown = [
          { code: 'fixed_route', label: 'Fixed route price', amount: baseCents },
        ];
      }
    } else {
      if (c.rate_cents == null || c.min_hours == null || c.max_hours == null) {
        baseCents = null;
        reason = 'no_price';
      } else {
        try {
          baseCents = quoteHourly({
            rateCents: c.rate_cents,
            minHours: c.min_hours,
            maxHours: c.max_hours,
            hours: body.hours,
          });
          anyPrice = true;
          breakdown = [{ code: 'hourly', label: 'Hourly hire', amount: baseCents }];
        } catch (e) {
          if (e instanceof BookingError && e.stringKey === 'error.hours_range') throw e;
          baseCents = null;
          reason = 'no_price';
        }
      }
    }

    // B9 zone-path company pricing (distance path uses priceTrip's company arg).
    if (baseCents != null && company) {
      const corp = companyBasePrice(company.prices, c.key);
      if (corp != null) {
        baseCents = body.type === 'hourly' ? corp * body.hours : corp;
        breakdown = [{ code: 'company_price', label: 'Company price', amount: baseCents }];
      } else if (company.discountPct > 0) {
        const { cents: next, saved } = applyCompanyDiscount(baseCents, company.discountPct);
        if (saved > 0) {
          breakdown = [
            ...(breakdown ?? []),
            {
              code: 'company_discount',
              label: `Company discount −${company.discountPct} %`,
              amount: -saved,
            },
          ];
          baseCents = next;
        }
      }
    }

    let available = false;
    if (baseCents != null) {
      const { rows: avail } = await db().query<{ n: number }>(
        `select public.class_availability(
           $1::uuid,
           public.blocked_range_for($2::timestamptz, $3::int, $4::int)
         ) as n`,
        [c.id, pickup.toISOString(), durationMinutes, c.buffer_minutes],
      );
      available = (avail[0]?.n ?? 0) > 0;
    }

    options.push({
      classKey: c.key,
      baseCents,
      available,
      ...(reason ? { reason } : {}),
      ...(baseCents != null && breakdown ? { breakdown } : {}),
    });
  }

  if (!anyPrice) {
    throw new BookingError('no_price', { stringKey: 'error.no_price', message: 'no_price' });
  }

  const pickupAt = toIsoWithOffset(pickup, settings.timezone);
  const legacy = {
    pickupAt,
    durationMinutes,
    currency: 'EUR' as const,
    options,
  };

  // B3: wrap zone prices in a signed quote when QUOTE_SIGNING_SECRET is set
  // (always on with FEATURE_DISTANCE_PRICING). Keeps `options` for the current widget.
  // B6: return trips always need a signed quote (two legs, one checkout).
  const secret = quoteSigningSecret();
  if (!secret) {
    if (returnLeg) {
      throw new BookingError('invalid_request', {
        stringKey: 'error.invalid_request',
        message: 'return_requires_quote_signing',
      });
    }
    return legacy;
  }

  const f = features();
  let ttlMin = 20;
  let settingsId: string | null = null;
  const pricingVersionExtras: { rateIds?: Record<string, string> } = {};
  try {
    const { rows: ps } = await db().query<{ id: string; doc: { quote_ttl_min?: number } }>(
      `select id, doc from public.current_pricing_settings`,
    );
    settingsId = ps[0]?.id ?? null;
    if (ps[0]?.doc?.quote_ttl_min) ttlMin = ps[0].doc.quote_ttl_min;
  } catch {
    // 0025 not applied — still sign with 20 min
  }

  const prices: Record<string, unknown> = {};
  for (const o of options) {
    prices[o.classKey] = {
      total: o.baseCents,
      available: o.available && o.baseCents != null,
      breakdown: o.breakdown ?? [],
      ...(o.reason ? { reason: o.reason } : {}),
    };
  }

  // Distance / hybrid: places + Routes. Fixed zone prices only when both placeIds are the
  // zones' display anchors (chip / popular route). Any Google address → km rates.
  let distanceKm: number | null = null;
  let durationMin = durationMinutes;
  const rawPlaces = raw as {
    pickupPlace?: { lat?: number; lng?: number; placeId?: string };
    dropoffPlace?: { lat?: number; lng?: number; placeId?: string };
    stops?: { lat: number; lng: number }[];
  };
  let zoneAnchors = false;
  if (body.type === 'transfer' && toId && rawPlaces.pickupPlace?.placeId && rawPlaces.dropoffPlace?.placeId) {
    const { rows: anchors } = await db().query<{ code: string; display_place_id: string | null }>(
      `select code, display_place_id from public.zones where id = any($1::uuid[])`,
      [[from.id, toId]],
    );
    const byCode = new Map(anchors.map((a) => [a.code, a.display_place_id]));
    zoneAnchors =
      Boolean(byCode.get(fromZone)) &&
      byCode.get(fromZone) === rawPlaces.pickupPlace.placeId &&
      Boolean(byCode.get(toZone)) &&
      byCode.get(toZone) === rawPlaces.dropoffPlace.placeId;
  }
  const hybridFixedRoute =
    zoneAnchors &&
    (f.pricingMode === 'hybrid' || f.pricingMode === 'zones') &&
    options.length > 0 &&
    options.every((o) => o.baseCents != null);
  if (
    f.distancePricing &&
    body.type === 'transfer' &&
    rawPlaces.pickupPlace?.lat != null &&
    rawPlaces.dropoffPlace?.lat != null &&
    toId
  ) {
    const origin = {
      lat: Number(rawPlaces.pickupPlace.lat),
      lng: Number(rawPlaces.pickupPlace.lng),
    };
    const destination = {
      lat: Number(rawPlaces.dropoffPlace.lat),
      lng: Number(rawPlaces.dropoffPlace.lng),
    };
    await assertInServiceArea([origin, destination]);
    if (!hybridFixedRoute) {
      try {
        const routed = await routeDistance({
          origin,
          destination,
          stops: rawPlaces.stops,
          departAt: pickup,
        });
        distanceKm = routed.distanceKm;
        durationMin = routed.durationMin;

        const ctx = await loadPricingContext();
        const rates = { ...ctx.rates };
        if (overrides?.rates) {
          for (const [key, patch] of Object.entries(overrides.rates)) {
            rates[key] = { ...(rates[key] ?? {}), ...patch, class_key: key } as (typeof rates)[string];
          }
        }
        const settingsDoc = {
          ...ctx.settings,
          ...(overrides?.settings ?? {}),
        } as typeof ctx.settings;
        // Google address (not a zone chip): never use the fixed matrix — km / hybrid distance path.
        const zonePriceMap = new Map<string, number | null>();
        if (zoneAnchors) {
          for (const c of classes) {
            zonePriceMap.set(c.key, await zonePriceCents(from.id, toId, c.id));
          }
        }
        const demandSnaps = await demandFactorsForClasses({
          classes: classes.map((c) => ({ id: c.id, key: c.key })),
          pickupAt: pickup,
          durationMin,
          demand: settingsDoc.demand,
        });
        const demandByClass = Object.fromEntries(
          Object.entries(demandSnaps).map(([k, s]) => [k, s.factor]),
        );
        const priced = priceTrip({
          trip: {
            type: 'transfer',
            pickupAt: pickup,
            distanceKm,
            durationMin,
            stops: (rawPlaces.stops as { lat: number; lng: number }[]) ?? [],
            pickup: origin,
            dropoff: destination,
          },
          classes: classes.map((c) => ({ key: c.key })),
          rates,
          settings: settingsDoc,
          periods: ctx.periods,
          areas: ctx.areas,
          mode: zoneAnchors ? f.pricingMode : 'distance',
          zonePrice: (key) => (zoneAnchors ? (zonePriceMap.get(key) ?? null) : null),
          demand: demandByClass,
          company,
          vatRateBp: ctx.vatRateBp,
        });

        for (const [key, p] of Object.entries(priced.perClass)) {
          const cls = classes.find((c) => c.key === key);
          const snap = demandSnaps[key];
          let available = p.available && !snap?.unavailable;
          if (available && cls) {
            const { rows: avail } = await db().query<{ n: number }>(
              `select public.class_availability(
                 $1::uuid,
                 public.blocked_range_for($2::timestamptz, $3::int, $4::int)
               ) as n`,
              [cls.id, pickup.toISOString(), durationMin, cls.buffer_minutes],
            );
            available = (avail[0]?.n ?? 0) > 0;
          }
          const demandFactor = p.demandFactor ?? snap?.factor ?? 1;
          prices[key] = {
            total: available && p.available ? p.total : null,
            net: p.net,
            vat: p.vat,
            breakdown: p.breakdown,
            available,
            demandFactor,
            ...(p.reason || snap?.unavailable ? { reason: p.reason ?? 'unavailable' } : {}),
          };
          const opt = options.find((o) => o.classKey === key);
          if (opt) {
            if (available && p.available) {
              opt.baseCents = p.total;
              opt.available = true;
              opt.breakdown = simulate ? p.breakdown : publicBreakdown(p.breakdown);
              delete opt.reason;
            } else {
              opt.baseCents = null;
              opt.available = false;
              opt.breakdown = undefined;
              opt.reason = snap?.unavailable ? 'unavailable' : (p.reason ?? 'not_priced');
            }
          }
        }
        settingsId = ctx.settingsId;
        ttlMin = ctx.settings.quote_ttl_min ?? ttlMin;
        (pricingVersionExtras as { rateIds?: Record<string, string> }).rateIds = ctx.rateIds;
      } catch (e) {
        // Only fall back to fixed matrix when the customer actually picked zone anchors.
        if (
          !(e instanceof BookingError) ||
          !ROUTE_FALLBACK_CODES.has(e.code) ||
          !zoneAnchors ||
          !(f.pricingMode === 'hybrid' || f.pricingMode === 'zones') ||
          !anyPrice
        ) {
          throw e;
        }
        console.error(
          JSON.stringify({
            level: 'warn',
            code: 'route_fallback_zones',
            detail: e.message.slice(0, 120),
          }),
        );
      }
    }
  }

  let returnPickupAt: Date | null = null;
  let returnDurationMin: number | null = null;
  let returnDistanceKm: number | null = null;
  let returnDiscountPct = 0;
  let returnFlightNumber: string | null = null;

  if (returnLeg && body.type === 'transfer' && toId) {
    returnPickupAt = localToInstant(returnLeg.pickupLocal, settings.timezone);
    assertLeadTime(returnPickupAt, new Date(), settings.minLeadMinutes);
    assertReturnAfterOutbound(pickup, durationMin, returnPickupAt);
    returnFlightNumber = returnLeg.flightNumber?.trim() || null;

    try {
      const { rows: ps } = await db().query<{ doc: { return_discount_pct?: number } }>(
        `select doc from public.current_pricing_settings`,
      );
      returnDiscountPct = Number(ps[0]?.doc?.return_discount_pct) || 0;
    } catch {
      returnDiscountPct = 0;
    }

    let returnRouted: { distanceKm: number; durationMin: number } | null = null;
    if (
      f.distancePricing &&
      !hybridFixedRoute &&
      rawPlaces.pickupPlace?.lat != null &&
      rawPlaces.dropoffPlace?.lat != null
    ) {
      const origin = {
        lat: Number(rawPlaces.dropoffPlace.lat),
        lng: Number(rawPlaces.dropoffPlace.lng),
      };
      const destination = {
        lat: Number(rawPlaces.pickupPlace.lat),
        lng: Number(rawPlaces.pickupPlace.lng),
      };
      await assertInServiceArea([origin, destination]);
      try {
        returnRouted = await routeDistance({
          origin,
          destination,
          departAt: returnPickupAt,
        });
        returnDistanceKm = returnRouted.distanceKm;
        returnDurationMin = returnRouted.durationMin;
      } catch (e) {
        if (
          !(e instanceof BookingError) ||
          !ROUTE_FALLBACK_CODES.has(e.code) ||
          !zoneAnchors ||
          !(f.pricingMode === 'hybrid' || f.pricingMode === 'zones')
        ) {
          throw e;
        }
        console.error(
          JSON.stringify({
            level: 'warn',
            code: 'route_fallback_zones_return',
            detail: e.message.slice(0, 120),
          }),
        );
        returnDurationMin = await routeDuration(toId, from.id);
      }
    } else {
      returnDurationMin = await routeDuration(toId, from.id);
    }

    const returnPrices = new Map<string, { cents: number | null; breakdown?: { code: string; label: string; amount: number }[] }>();

    if (returnRouted) {
      const ctx = await loadPricingContext();
      const rates = { ...ctx.rates };
      if (overrides?.rates) {
        for (const [key, patch] of Object.entries(overrides.rates)) {
          rates[key] = { ...(rates[key] ?? {}), ...patch, class_key: key } as (typeof rates)[string];
        }
      }
      const settingsDoc = {
        ...ctx.settings,
        ...(overrides?.settings ?? {}),
      } as typeof ctx.settings;
      returnDiscountPct = Number(settingsDoc.return_discount_pct) || returnDiscountPct;
      const zonePriceMap = new Map<string, number | null>();
      if (zoneAnchors) {
        for (const c of classes) {
          zonePriceMap.set(c.key, await zonePriceCents(toId, from.id, c.id));
        }
      }
      const demandSnaps = await demandFactorsForClasses({
        classes: classes.map((c) => ({ id: c.id, key: c.key })),
        pickupAt: returnPickupAt,
        durationMin: returnRouted.durationMin,
        demand: settingsDoc.demand,
      });
      const demandByClass = Object.fromEntries(
        Object.entries(demandSnaps).map(([k, s]) => [k, s.factor]),
      );
      const priced = priceTrip({
        trip: {
          type: 'transfer',
          pickupAt: returnPickupAt,
          distanceKm: returnRouted.distanceKm,
          durationMin: returnRouted.durationMin,
          stops: [],
          pickup: {
            lat: Number(rawPlaces.dropoffPlace!.lat),
            lng: Number(rawPlaces.dropoffPlace!.lng),
          },
          dropoff: {
            lat: Number(rawPlaces.pickupPlace!.lat),
            lng: Number(rawPlaces.pickupPlace!.lng),
          },
        },
        classes: classes.map((c) => ({ key: c.key })),
        rates,
        settings: settingsDoc,
        periods: ctx.periods,
        areas: ctx.areas,
        mode: zoneAnchors ? f.pricingMode : 'distance',
        zonePrice: (key) => (zoneAnchors ? (zonePriceMap.get(key) ?? null) : null),
        demand: demandByClass,
        company,
        vatRateBp: ctx.vatRateBp,
      });
      for (const [key, p] of Object.entries(priced.perClass)) {
        const snap = demandSnaps[key];
        returnPrices.set(key, {
          cents: p.available && !snap?.unavailable ? p.total : null,
          breakdown: simulate ? p.breakdown : publicBreakdown(p.breakdown),
        });
      }
    } else {
      for (const c of classes) {
        const cents = await zonePriceCents(toId, from.id, c.id);
        returnPrices.set(c.key, {
          cents,
          breakdown:
            cents != null
              ? [{ code: 'fixed_route', label: 'Return fixed route', amount: cents }]
              : undefined,
        });
      }
    }

    for (let i = 0; i < options.length; i++) {
      const o = options[i]!;
      const rp = returnPrices.get(o.classKey);
      let retAvail = false;
      if (rp?.cents != null) {
        const cls = classes.find((c) => c.key === o.classKey);
        if (cls) {
          const { rows: avail } = await db().query<{ n: number }>(
            `select public.class_availability(
               $1::uuid,
               public.blocked_range_for($2::timestamptz, $3::int, $4::int)
             ) as n`,
            [cls.id, returnPickupAt.toISOString(), returnDurationMin, cls.buffer_minutes],
          );
          retAvail = (avail[0]?.n ?? 0) > 0;
        }
      }
      const merged = mergeReturnOption(
        {
          baseCents: o.baseCents,
          available: o.available,
          reason: o.reason,
          breakdown: o.breakdown,
        },
        {
          baseCents: rp?.cents ?? null,
          available: retAvail,
          reason: rp?.cents == null ? 'no_price' : undefined,
          breakdown: rp?.breakdown,
        },
        returnDiscountPct,
      );
      options[i] = { classKey: o.classKey, ...merged };
    }

    // Rebuild prices map for signed quote (keep outbound demandFactor)
    for (const o of options) {
      const prev = prices[o.classKey] as { demandFactor?: number } | undefined;
      prices[o.classKey] = {
        total: o.total ?? o.baseCents,
        outbound: o.outbound,
        return: o.return,
        available: o.available && o.baseCents != null,
        breakdown: o.breakdown ?? [],
        returnBreakdown: o.returnBreakdown ?? [],
        demandFactor: prev?.demandFactor ?? 1,
        ...(o.reason ? { reason: o.reason } : {}),
      };
    }
  }

  if (!simulate) {
    for (const o of options) {
      if (o.breakdown) o.breakdown = publicBreakdown(o.breakdown);
    }
  }

  const pricingVersion = {
    pricingMode: f.pricingMode,
    settingsId,
    ...pricingVersionExtras,
    source: distanceKm != null ? 'distance' : 'zones',
    return: returnPickupAt ? true : undefined,
    simulate: simulate || undefined,
  };

  if (simulate) {
    const withDemand = options.map((o) => {
      const stored = prices[o.classKey] as { demandFactor?: number } | undefined;
      return { ...o, demandFactor: stored?.demandFactor ?? 1 };
    });
    return {
      pickupAt,
      durationMinutes: durationMin,
      currency: 'EUR' as const,
      options: withDemand,
      distanceKm,
      durationMin,
      returnPickupAt: returnPickupAt
        ? toIsoWithOffset(returnPickupAt, settings.timezone)
        : undefined,
      returnDiscountPct: returnPickupAt ? returnDiscountPct : undefined,
      pricingVersion,
      classes: withDemand.map((o) => ({
        key: o.classKey,
        total: o.baseCents,
        outbound: o.outbound,
        return: o.return,
        available: o.available && o.baseCents != null,
        breakdown: o.breakdown,
        demandFactor: o.demandFactor,
      })),
    };
  }

  const expiresAtFinal = new Date(Date.now() + ttlMin * 60_000).toISOString();

  const { rows: inserted } = await db().query<{ id: string; expires_at: Date }>(
    `insert into public.quotes (
       mode, pickup_at, hours, distance_km, duration_min,
       from_zone_code, to_zone_code, passengers, luggage, prices, pricing_version,
       expires_at, ip_hash,
       pickup_place_id, pickup_lat, pickup_lng,
       dropoff_place_id, dropoff_lat, dropoff_lng,
       return_pickup_at, return_duration_min, return_distance_km, return_flight_number,
       company_id
     ) values (
       $1, $2::timestamptz, $3, $4, $5,
       $6, $7, $8, $9, $10::jsonb, $11::jsonb,
       $12::timestamptz, $13,
       $14, $15, $16, $17, $18, $19,
       $20::timestamptz, $21, $22, $23,
       $24::uuid
     ) returning id, expires_at`,
    [
      body.type,
      pickup.toISOString(),
      body.type === 'hourly' ? body.hours : null,
      distanceKm,
      durationMin,
      fromZone,
      body.type === 'transfer' ? toZone : null,
      body.passengers,
      body.luggage,
      JSON.stringify(prices),
      JSON.stringify(pricingVersion),
      expiresAtFinal,
      hashIp(ip),
      rawPlaces.pickupPlace?.placeId ?? null,
      rawPlaces.pickupPlace?.lat ?? null,
      rawPlaces.pickupPlace?.lng ?? null,
      rawPlaces.dropoffPlace?.placeId ?? null,
      rawPlaces.dropoffPlace?.lat ?? null,
      rawPlaces.dropoffPlace?.lng ?? null,
      returnPickupAt?.toISOString() ?? null,
      returnDurationMin,
      returnDistanceKm,
      returnFlightNumber,
      opts.company?.id ?? null,
    ],
  );
  const quoteId = inserted[0]!.id;
  const expiresAt = new Date(inserted[0]!.expires_at).toISOString();
  const signature = signQuote(secret, quoteId, expiresAt);

  return {
    pickupAt,
    durationMinutes: durationMin,
    currency: 'EUR' as const,
    options,
    quoteId,
    expiresAt,
    signature,
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
// POST /api/holds
// ---------------------------------------------------------------------------

export async function createHold(raw: unknown, visitorKey: string, ip?: string) {
  rejectMoneyFields(raw);
  const parsed = HoldRequest.safeParse(raw);
  if (!parsed.success) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: parsed.error.message,
    });
  }
  const body = parsed.data;
  await requireTurnstile(body.turnstileToken, ip);
  if (ip) await assertRateLimit(`hold:ip:${ip}`, RATE.holdPerIp.windowSeconds, RATE.holdPerIp.max);
  await assertRateLimit(
    `hold:vid:${visitorKey}`,
    RATE.holdPerVisitor.windowSeconds,
    RATE.holdPerVisitor.max,
  );

  const settings = await getSettings();
  const pickup = localToInstant(body.pickupLocal, settings.timezone);
  assertLeadTime(pickup, new Date(), settings.minLeadMinutes);

  const trip = await quoteTrip({
    type: body.type,
    classKey: body.classKey,
    fromZone: body.fromZone,
    toZone: body.type === 'transfer' ? body.toZone : undefined,
    hours: body.type === 'hourly' ? body.hours : undefined,
    passengers: body.passengers,
    luggage: body.luggage,
  });

  let hold: {
    id: string;
    expires_at: Date;
  };
  try {
    const { rows } = await db().query<{ id: string; expires_at: Date }>(
      `select id, expires_at from public.create_hold(
         $1::text, $2::timestamptz, $3::int, $4::text,
         $5::public.booking_type, $6::uuid, $7::uuid, $8::int
       )`,
      [
        body.classKey,
        pickup.toISOString(),
        trip.durationMinutes,
        visitorKey,
        body.type,
        trip.fromId,
        trip.toId,
        trip.hours,
      ],
    );
    hold = rows[0]!;
  } catch (e) {
    throw mapPgBookingError(e);
  }

  return {
    holdId: hold.id,
    expiresAt: toIsoWithOffset(new Date(hold.expires_at), settings.timezone),
    classKey: body.classKey,
    baseCents: trip.baseCents,
  };
}

// ---------------------------------------------------------------------------
// POST /api/bookings from a signed quote (B3)
// ---------------------------------------------------------------------------

async function createBookingFromQuote(
  raw: unknown,
  visitorKey: string,
  ip?: string,
  opts?: { skipPayment?: boolean; skipTurnstile?: boolean },
) {
  const parsed = QuoteCheckoutRequest.safeParse(raw);
  if (!parsed.success) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: parsed.error.message,
    });
  }
  const body = parsed.data;
  if (!opts?.skipTurnstile) await requireTurnstile(body.turnstileToken, ip);
  if (ip) {
    await assertRateLimit(`book:ip:${ip}`, RATE.bookingPerIp.windowSeconds, RATE.bookingPerIp.max);
  }
  await assertRateLimit(
    `book:vid:${visitorKey}`,
    RATE.bookingPerVisitor.windowSeconds,
    RATE.bookingPerVisitor.max,
  );

  const secret = quoteSigningSecret();
  if (!secret) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'quote_signing_unavailable',
    });
  }

  const { rows: quoteRows } = await db().query<{
    id: string;
    expires_at: Date;
    prices: Record<string, { total?: number; available?: boolean }>;
    mode: string;
  }>(`select id, expires_at, prices, mode from public.quotes where id = $1::uuid`, [body.quoteId]);
  const q = quoteRows[0];
  if (!q) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'unknown_quote',
    });
  }
  const expiresAt = new Date(q.expires_at).toISOString();
  if (!verifyQuoteSignature(secret, body.quoteId, expiresAt, body.signature)) {
    const err = new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'bad_signature',
    });
    (err as BookingError & { httpStatus?: number }).httpStatus = 403;
    throw err;
  }
  if (new Date(q.expires_at).getTime() <= Date.now()) {
    throw new BookingError('quote_expired', {
      stringKey: 'error.quote_expired',
      message: 'quote_expired',
    });
  }
  const classPrice = q.prices?.[body.classKey];
  if (!classPrice?.available || !classPrice.total) {
    throw new BookingError('unavailable', {
      stringKey: 'error.unavailable',
      message: 'class_unavailable',
    });
  }

  let pickupPlace;
  let dropoffPlace;
  try {
    pickupPlace = parsePlace(body.pickupPlace ?? null);
    dropoffPlace = parsePlace(body.dropoffPlace ?? null);
  } catch (e) {
    if (e instanceof PlacesError) {
      throw new BookingError('invalid_request', {
        stringKey: 'error.invalid_request',
        message: e.message,
      });
    }
    throw e;
  }
  if (q.mode === 'hourly' && dropoffPlace) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'dropoff place not allowed on hourly',
      field: 'dropoffPlace',
    });
  }

  const inv = body.invoice;
  let created: {
    booking_id: string;
    reference: string;
    return_booking_id?: string;
    return_reference?: string;
    trip_group_id?: string;
    base_cents: number;
    price_cents: number;
    outbound_cents?: number;
    return_cents?: number;
    hold_expires_at: string;
    lines: { code: string; label: string; cents: number }[];
    class_key: string;
    currency: string;
  };
  try {
    const { rows } = await db().query<{ j: typeof created }>(
      `select public.create_booking_from_quote(
         $1::uuid, $2::text, $3::text, $4::text, $5::text, $6::int, $7::int, $8::text, $9::text,
         $10::text[], $11::text, $12::text, $13::text,
         $14::text, $15::text, $16::text, $17::text
       ) as j`,
      [
        body.quoteId,
        body.classKey,
        visitorKey,
        body.pickupAddress,
        body.dropoffAddress ?? null,
        body.passengers,
        body.luggage,
        body.flightNumber ?? null,
        body.notes ?? null,
        expandExtraCodes(normaliseExtraChoices(body.extras)),
        body.customer.name,
        body.customer.email,
        body.customer.phone,
        inv?.company ?? null,
        inv?.vat ?? null,
        inv?.taxOffice ?? null,
        inv?.address ?? null,
      ],
    );
    created = rows[0]!.j;
  } catch (e) {
    throw mapPgBookingError(e);
  }

  if (features().flightTracking) {
    try {
      const { stampFlightAtBooking } = await import('./flight-tracking');
      const { rows: legs } = await db().query<{
        id: string;
        pickup_at: Date;
        flight_number: string | null;
      }>(
        `select id, pickup_at, flight_number from public.bookings
          where id = $1::uuid
             or ($2::uuid is not null and id = $2::uuid)`,
        [created.booking_id, created.return_booking_id ?? null],
      );
      for (const leg of legs) {
        const fn =
          leg.id === created.booking_id
            ? body.flightNumber?.trim() || leg.flight_number
            : leg.flight_number;
        if (fn) await stampFlightAtBooking(leg.id, fn, leg.pickup_at);
      }
    } catch {
      /* non-fatal */
    }
  }

  // Prefer request places when provided; quote already copied its own.
  if (pickupPlace || dropoffPlace) {
    try {
      const pickCols = placeColumns('pickup', pickupPlace ?? null);
      const dropCols = placeColumns('dropoff', dropoffPlace ?? null);
      await db().query(
        `update public.bookings set
           pickup_place_id = coalesce($2, pickup_place_id),
           pickup_lat = coalesce($3, pickup_lat),
           pickup_lng = coalesce($4, pickup_lng),
           dropoff_place_id = coalesce($5, dropoff_place_id),
           dropoff_lat = coalesce($6, dropoff_lat),
           dropoff_lng = coalesce($7, dropoff_lng)
         where id = $1::uuid`,
        [
          created.booking_id,
          pickCols.pickup_place_id,
          pickCols.pickup_lat,
          pickCols.pickup_lng,
          dropCols.dropoff_place_id,
          dropCols.dropoff_lat,
          dropCols.dropoff_lng,
        ],
      );
      if (created.return_booking_id) {
        await db().query(
          `update public.bookings set
             pickup_place_id = coalesce($2, pickup_place_id),
             pickup_lat = coalesce($3, pickup_lat),
             pickup_lng = coalesce($4, pickup_lng),
             dropoff_place_id = coalesce($5, dropoff_place_id),
             dropoff_lat = coalesce($6, dropoff_lat),
             dropoff_lng = coalesce($7, dropoff_lng)
           where id = $1::uuid`,
          [
            created.return_booking_id,
            dropCols.dropoff_place_id,
            dropCols.dropoff_lat,
            dropCols.dropoff_lng,
            pickCols.pickup_place_id,
            pickCols.pickup_lat,
            pickCols.pickup_lng,
          ],
        );
      }
    } catch {
      /* non-fatal */
    }
  }

  const settings = await getSettings();
  const holdExpires = new Date(created.hold_expires_at);
  const timeoutSec = Math.max(1, Math.floor((holdExpires.getTime() - Date.now()) / 1000));

  const { rows: vatRows } = await db().query<{ vat_rate_bp: number; vat_cents: number }>(
    `select vat_rate_bp, vat_cents from public.bookings where id = $1::uuid`,
    [created.booking_id],
  );
  const vat = vatRows[0]!;

  if (opts?.skipPayment) {
    return {
      reference: created.reference,
      returnReference: created.return_reference,
      tripGroupId: created.trip_group_id,
      status: 'pending' as const,
      currency: created.currency,
      lines: created.lines,
      totalCents: created.price_cents,
      vatRateBp: vat.vat_rate_bp,
      vatCents: vat.vat_cents,
      holdExpiresAt: toIsoWithOffset(holdExpires, settings.timezone),
      checkoutUrl: null as string | null,
      bookingId: created.booking_id,
    };
  }

  try {
    const order = await getPaymentProvider().createOrder({
      amountCents: created.price_cents,
      reference: created.reference,
      customerEmail: body.customer.email,
      customerName: body.customer.name,
      customerPhone: body.customer.phone,
      paymentTimeoutSeconds: timeoutSec,
    });
    if (created.trip_group_id) {
      await db().query(
        `update public.bookings set viva_order_code = $1::bigint where trip_group_id = $2::uuid`,
        [order.orderCode, created.trip_group_id],
      );
    } else {
      await db().query(`update public.bookings set viva_order_code = $1::bigint where id = $2::uuid`, [
        order.orderCode,
        created.booking_id,
      ]);
    }

    return {
      reference: created.reference,
      returnReference: created.return_reference,
      tripGroupId: created.trip_group_id,
      status: 'pending' as const,
      currency: created.currency,
      lines: created.lines,
      totalCents: created.price_cents,
      vatRateBp: vat.vat_rate_bp,
      vatCents: vat.vat_cents,
      holdExpiresAt: toIsoWithOffset(holdExpires, settings.timezone),
      checkoutUrl: order.checkoutUrl,
      bookingId: created.booking_id,
    };
  } catch (e) {
    const err = new BookingError('payment_failed', {
      stringKey: 'error.payment_failed',
      message: e instanceof Error ? e.message : 'payment_failed',
    });
    (err as BookingError & { reference?: string }).reference = created.reference;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/holds/:id
// ---------------------------------------------------------------------------

export async function releaseHold(holdId: string, visitorKey: string): Promise<void> {
  const { rows } = await db().query<{ id: string }>(
    `update public.slot_holds
        set status = 'released'
      where id = $1::uuid
        and visitor_key = $2
        and status = 'active'
        and expires_at > now()
      returning id`,
    [holdId, visitorKey],
  );
  if (!rows[0]) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'hold not yours or ended',
    });
  }
}

// ---------------------------------------------------------------------------
// POST /api/bookings
// ---------------------------------------------------------------------------

export async function createBooking(
  raw: unknown,
  visitorKey: string,
  ip?: string,
  opts?: { skipPayment?: boolean; skipTurnstile?: boolean },
) {
  rejectMoneyFields(raw);
  if (raw && typeof raw === 'object' && 'quoteId' in (raw as object)) {
    return createBookingFromQuote(raw, visitorKey, ip, opts);
  }
  const parsed = BookingRequest.safeParse(raw);
  if (!parsed.success) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: parsed.error.message,
    });
  }
  const body = parsed.data;
  await requireTurnstile(body.turnstileToken, ip);
  if (ip) {
    await assertRateLimit(`book:ip:${ip}`, RATE.bookingPerIp.windowSeconds, RATE.bookingPerIp.max);
  }
  await assertRateLimit(
    `book:vid:${visitorKey}`,
    RATE.bookingPerVisitor.windowSeconds,
    RATE.bookingPerVisitor.max,
  );

  let pickupPlace;
  let dropoffPlace;
  try {
    pickupPlace = parsePlace(body.pickupPlace ?? null);
    dropoffPlace = parsePlace(body.dropoffPlace ?? null);
  } catch (e) {
    if (e instanceof PlacesError) {
      throw new BookingError('invalid_request', {
        stringKey: 'error.invalid_request',
        message: e.message,
      });
    }
    throw e;
  }
  const { rows: holdType } = await db().query<{ booking_type: string }>(
    `select booking_type::text from public.slot_holds where id = $1::uuid and visitor_key = $2`,
    [body.holdId, visitorKey],
  );
  if (holdType[0]?.booking_type === 'hourly' && dropoffPlace) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'dropoff place not allowed on hourly',
      field: 'dropoffPlace',
    });
  }

  const inv = body.invoice;
  let created: {
    booking_id: string;
    reference: string;
    base_cents: number;
    price_cents: number;
    hold_expires_at: string;
    lines: { code: string; label: string; cents: number }[];
    class_key: string;
    currency: string;
  };
  try {
    const { rows } = await db().query<{ j: typeof created }>(
      `select public.create_booking_from_hold(
         $1::uuid, $2::text, $3::text, $4::text, $5::int, $6::int, $7::text, $8::text,
         $9::text[], $10::text, $11::text, $12::text,
         $13::text, $14::text, $15::text, $16::text
       ) as j`,
      [
        body.holdId,
        visitorKey,
        body.pickupAddress,
        body.dropoffAddress ?? null,
        body.passengers,
        body.luggage,
        body.flightNumber ?? null,
        body.notes ?? null,
        expandExtraCodes(normaliseExtraChoices(body.extras)),
        body.customer.name,
        body.customer.email,
        body.customer.phone,
        inv?.company ?? null,
        inv?.vat ?? null,
        inv?.taxOffice ?? null,
        inv?.address ?? null,
      ],
    );
    created = rows[0]!.j;
  } catch (e) {
    throw mapPgBookingError(e);
  }

  if (features().flightTracking && body.flightNumber?.trim()) {
    try {
      const { stampFlightAtBooking } = await import('./flight-tracking');
      const { rows: pu } = await db().query<{ pickup_at: Date }>(
        `select pickup_at from public.bookings where id = $1::uuid`,
        [created.booking_id],
      );
      if (pu[0]) await stampFlightAtBooking(created.booking_id, body.flightNumber, pu[0].pickup_at);
    } catch {
      /* non-fatal */
    }
  }

  // Place IDs/coords are optional enrichment (migration 0021). Never abandon a created booking if this fails
  // (e.g. production DB without 0021 yet, or a check-constraint reject).
  try {
    const pickCols = placeColumns('pickup', pickupPlace);
    const dropCols = placeColumns('dropoff', dropoffPlace);
    await db().query(
      `update public.bookings set
         pickup_place_id = $2, pickup_lat = $3, pickup_lng = $4,
         dropoff_place_id = $5, dropoff_lat = $6, dropoff_lng = $7
       where id = $1::uuid`,
      [
        created.booking_id,
        pickCols.pickup_place_id,
        pickCols.pickup_lat,
        pickCols.pickup_lng,
        dropCols.dropoff_place_id,
        dropCols.dropoff_lat,
        dropCols.dropoff_lng,
      ],
    );
  } catch (e) {
    const detail = e instanceof Error ? e.message.slice(0, 180) : 'unknown';
    console.error(
      JSON.stringify({
        level: 'error',
        code: 'booking_places_update_failed',
        reference: created.reference,
        detail,
      }),
    );
  }

  const settings = await getSettings();
  const holdExpires = new Date(created.hold_expires_at);
  const timeoutSec = Math.max(1, Math.floor((holdExpires.getTime() - Date.now()) / 1000));

  try {
    const order = await getPaymentProvider().createOrder({
      amountCents: created.price_cents,
      reference: created.reference,
      customerEmail: body.customer.email,
      customerName: body.customer.name,
      customerPhone: body.customer.phone,
      paymentTimeoutSeconds: timeoutSec,
    });
    await db().query(`update public.bookings set viva_order_code = $1::bigint where id = $2::uuid`, [
      order.orderCode,
      created.booking_id,
    ]);

    const { rows: vatRows } = await db().query<{ vat_rate_bp: number; vat_cents: number }>(
      `select vat_rate_bp, vat_cents from public.bookings where id = $1::uuid`,
      [created.booking_id],
    );
    const vat = vatRows[0]!;

    return {
      reference: created.reference,
      status: 'pending' as const,
      currency: created.currency,
      lines: created.lines.map((l) => ({ label: l.label, cents: l.cents })),
      totalCents: created.price_cents,
      vatRateBp: vat.vat_rate_bp,
      vatCents: vat.vat_cents,
      holdExpiresAt: toIsoWithOffset(holdExpires, settings.timezone),
      checkoutUrl: order.checkoutUrl,
    };
  } catch {
    throw Object.assign(
      new BookingError('payment_failed', {
        stringKey: 'error.payment_failed',
        message: 'payment_failed',
      }),
      { reference: created.reference },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/bookings/pay
// ---------------------------------------------------------------------------

export async function payAgain(raw: unknown, visitorKey: string) {
  rejectMoneyFields(raw);
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('reference' in raw) ||
    typeof (raw as { reference: unknown }).reference !== 'string'
  ) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'reference required',
    });
  }
  const reference = (raw as { reference: string }).reference;

  const { rows } = await db().query<{
    id: string;
    price_cents: number;
    hold_expires_at: Date | null;
    payment_status: string;
    status: string;
    customer_email: string;
    customer_name: string;
    customer_phone: string;
  }>(
    `select id, price_cents, hold_expires_at, payment_status, status,
            customer_email, customer_name, customer_phone
       from public.bookings
      where reference = $1 and visitor_key = $2`,
    [reference, visitorKey],
  );
  const b = rows[0];
  if (!b || b.status !== 'pending' || b.payment_status !== 'unpaid') {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'booking not payable',
    });
  }
  if (!b.hold_expires_at || new Date(b.hold_expires_at).getTime() <= Date.now()) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'hold ended',
    });
  }

  const timeoutSec = Math.max(
    1,
    Math.floor((new Date(b.hold_expires_at).getTime() - Date.now()) / 1000),
  );
  try {
    const order = await getPaymentProvider().createOrder({
      amountCents: b.price_cents,
      reference,
      customerEmail: b.customer_email,
      customerName: b.customer_name,
      customerPhone: b.customer_phone,
      paymentTimeoutSeconds: timeoutSec,
    });
    await db().query(`update public.bookings set viva_order_code = $1::bigint where id = $2::uuid`, [
      order.orderCode,
      b.id,
    ]);
    return { checkoutUrl: order.checkoutUrl };
  } catch {
    throw new BookingError('payment_failed', {
      stringKey: 'error.payment_failed',
      message: 'payment_failed',
    });
  }
}

// ---------------------------------------------------------------------------
// GET /api/booking-status
// ---------------------------------------------------------------------------

export async function bookingStatus(orderCode: string) {
  const { rows } = await db().query<{
    reference: string;
    status: string;
    payment_status: string;
  }>(
    `select reference, status, payment_status from public.bookings where viva_order_code = $1::bigint`,
    [orderCode],
  );
  if (!rows[0]) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'unknown order',
    });
  }
  return {
    reference: rows[0].reference,
    status: rows[0].status,
    paymentStatus: rows[0].payment_status,
  };
}

/** What the return pages show about a booking: the card of 10 / 11 / 16 and the journey of 09. */
export type ReturnCard = {
  reference: string;
  classKey: string;
  className: string;
  /** First Sanity photo of the class (display only), or null. */
  photoUrl: string | null;
  /** "Tue 17 Nov 2026, 14:30" in the business time zone. */
  pickupLabel: string;
  /** "A → B", or "A · 4 h" for hourly hire. */
  routeLabel: string;
  passengers: number;
  luggage: number;
};

type CardRow = {
  reference: string;
  pickup_at: Date;
  booking_type: string;
  hours: number | null;
  duration_minutes: number;
  passengers: number;
  luggage: number;
  class_key: string;
  class_name: string;
  from_name: string | null;
  to_name: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
};

const CARD_COLUMNS = `b.reference, b.pickup_at, b.booking_type, b.hours, b.duration_minutes,
       b.passengers, b.luggage, c.key as class_key, c.name as class_name,
       b.pickup_address, b.dropoff_address,
       zf.name as from_name, zt.name as to_name`;
const CARD_JOINS = `join public.vehicle_classes c on c.id = b.class_id
       left join public.zones zf on zf.id = b.from_zone_id
       left join public.zones zt on zt.id = b.to_zone_id`;

async function toReturnCard(row: CardRow): Promise<ReturnCard> {
  const settings = await getSettings();
  const photoUrl =
    (await loadSanityVehicleClasses()).find((c) => c.key === row.class_key)?.photos?.[0]?.url ??
    null;
  const hours = row.hours ?? Math.round(row.duration_minutes / 60);
  const from = placeLabel(row.from_name, row.pickup_address);
  return {
    reference: row.reference,
    classKey: row.class_key,
    className: row.class_name,
    photoUrl,
    pickupLabel: formatLocal(new Date(row.pickup_at), settings.timezone),
    routeLabel:
      row.booking_type === 'hourly'
        ? `${from} · ${hours} h`
        : transferRouteLabel(row.from_name, row.to_name, row.pickup_address, row.dropoff_address),
    passengers: row.passengers,
    luggage: row.luggage,
  };
}

export type ConfirmedView = {
  card: ReturnCard;
  /** Only for the visitor who made the booking (cookie); null otherwise. */
  email: string | null;
  /** Server amounts: the lines in cents, VAT rate and VAT share (price analysis, AC-37). */
  lines: { label: string; cents: number }[];
  vatRateBp: number;
  vatCents: number;
  totalCents: number;
  bookingType: 'transfer' | 'hourly';
  hours: number;
};

/** The paid booking behind a Viva order code, or null while it is not confirmed yet. */
export async function confirmedView(
  orderCode: string | null | undefined,
  visitorKey: string | undefined,
): Promise<ConfirmedView | null> {
  if (!orderCode || !/^\d{1,18}$/.test(orderCode)) return null;
  const { rows } = await db().query<
    CardRow & {
      id: string;
      status: string;
      visitor_key: string | null;
      customer_email: string;
      price_cents: number;
      base_price_cents: number;
      vat_rate_bp: number;
      vat_cents: number;
    }
  >(
    `select b.id, b.status, b.visitor_key, b.customer_email, b.price_cents, b.base_price_cents,
            b.vat_rate_bp, b.vat_cents, ${CARD_COLUMNS}
       from public.bookings b
       ${CARD_JOINS}
      where b.viva_order_code = $1::bigint`,
    [orderCode],
  );
  const b = rows[0];
  if (!b || !['confirmed', 'assigned', 'completed'].includes(b.status)) return null;
  const { rows: extras } = await db().query<{ name: string; cents: number }>(
    `select e.name, be.price_cents as cents
       from public.booking_extras be
       join public.extras e on e.id = be.extra_id
      where be.booking_id = $1::uuid
      order by e.code`,
    [b.id],
  );
  const card = await toReturnCard(b);
  const hours = b.hours ?? Math.round(b.duration_minutes / 60);
  return {
    card,
    email: visitorKey && b.visitor_key === visitorKey ? b.customer_email : null,
    lines: [
      { label: b.class_name, cents: b.base_price_cents },
      ...extras.map((e) => ({ label: e.name, cents: e.cents })),
    ],
    vatRateBp: b.vat_rate_bp,
    vatCents: b.vat_cents,
    totalCents: b.price_cents,
    bookingType: b.booking_type as 'transfer' | 'hourly',
    hours,
  };
}

export type NotCompletedView =
  | { kind: 'expired'; card: ReturnCard | null }
  | {
      kind: 'live';
      card: ReturnCard;
      reference: string;
      holdExpiresAt: string;
      holdExpiresAtMs: number;
    };

/** Pending booking with a live hold for this visitor, looked up by Viva order code. */
export async function notCompletedView(
  orderCode: string | null | undefined,
  visitorKey: string | undefined,
): Promise<NotCompletedView> {
  if (!orderCode || !visitorKey || !/^\d{1,18}$/.test(orderCode)) {
    return { kind: 'expired', card: null };
  }
  const { rows } = await db().query<
    CardRow & { status: string; payment_status: string; hold_expires_at: Date | null }
  >(
    `select b.status, b.payment_status, b.hold_expires_at, ${CARD_COLUMNS}
       from public.bookings b
       ${CARD_JOINS}
      where b.viva_order_code = $1::bigint and b.visitor_key = $2`,
    [orderCode, visitorKey],
  );
  const b = rows[0];
  if (!b) return { kind: 'expired', card: null };
  const card = await toReturnCard(b);
  if (b.status !== 'pending' || b.payment_status !== 'unpaid' || !b.hold_expires_at) {
    return { kind: 'expired', card };
  }
  const expiresMs = new Date(b.hold_expires_at).getTime();
  if (expiresMs <= Date.now()) return { kind: 'expired', card };
  const settings = await getSettings();
  return {
    kind: 'live',
    card,
    reference: b.reference,
    holdExpiresAt: toIsoWithOffset(new Date(b.hold_expires_at), settings.timezone),
    holdExpiresAtMs: expiresMs,
  };
}

/** End a pending hold so the visitor can pick another vehicle. */
export async function releasePendingBooking(raw: unknown, visitorKey: string): Promise<void> {
  rejectMoneyFields(raw);
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('reference' in raw) ||
    typeof (raw as { reference: unknown }).reference !== 'string'
  ) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'reference required',
    });
  }
  const reference = (raw as { reference: string }).reference;
  const expired = await db().query(
    `update public.bookings
        set status = 'expired',
            hold_expires_at = least(coalesce(hold_expires_at, now()), now())
      where reference = $1
        and visitor_key = $2
        and status = 'pending'
        and payment_status = 'unpaid'
      returning id`,
    [reference, visitorKey],
  );
  if (!expired.rows[0]) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'booking not releasable',
    });
  }
}

export type CancelPageView =
  | { kind: 'invalid' }
  | { kind: 'tooLate' }
  | {
      kind: 'ok';
      reference: string;
      card: ReturnCard;
      pickupLabel: string;
      tripLabel: string;
      refundCents: number;
      refundLabel: string;
    };

/** Server data for `/booking/cancel/[token]` (never returns personal data). */
export async function cancelPageView(token: string): Promise<CancelPageView> {
  if (!token || token.length < 16) return { kind: 'invalid' };
  const hash = hashCancelToken(token);
  const { rows } = await db().query<
    CardRow & { price_cents: number; payment_status: string; status: string }
  >(
    `select b.price_cents, b.payment_status, b.status, ${CARD_COLUMNS}
       from public.bookings b
       ${CARD_JOINS}
      where b.cancel_token_hash = $1`,
    [hash],
  );
  const b = rows[0];
  if (!b || b.status === 'cancelled') return { kind: 'invalid' };

  const settings = await getSettings();
  const cutoff = new Date(b.pickup_at).getTime() - settings.cancelWindowHours * 3600_000;
  if (Date.now() > cutoff) return { kind: 'tooLate' };

  const refundCents =
    b.payment_status === 'paid' || b.payment_status === 'partially_refunded' ? b.price_cents : 0;
  const tripLabel =
    b.booking_type === 'hourly'
      ? `${Math.round(b.duration_minutes / 60)} h`
      : transferRouteLabel(b.from_name, b.to_name, b.pickup_address, b.dropoff_address);

  return {
    kind: 'ok',
    reference: b.reference,
    card: await toReturnCard(b),
    pickupLabel: `${formatLocal(new Date(b.pickup_at), settings.timezone)} (Athens)`,
    tripLabel,
    refundCents,
    refundLabel: formatEuro(refundCents),
  };
}

// ---------------------------------------------------------------------------
// POST /api/bookings/cancel
// ---------------------------------------------------------------------------

export function hashCancelToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function cancelBooking(raw: unknown, ip?: string) {
  rejectMoneyFields(raw);
  const parsed = CancelRequest.safeParse(raw);
  if (!parsed.success) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: parsed.error.message,
    });
  }
  const body = parsed.data;
  await requireTurnstile(body.turnstileToken, ip);

  const hash = hashCancelToken(body.token);
  const { rows } = await db().query<{
    id: string;
    reference: string;
    pickup_at: Date;
    price_cents: number;
    payment_status: string;
    viva_order_code: string | null;
    status: string;
  }>(
    `select id, reference, pickup_at, price_cents, payment_status, viva_order_code::text, status
       from public.bookings
      where cancel_token_hash = $1`,
    [hash],
  );
  const b = rows[0];
  if (!b || b.status === 'cancelled') {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'unknown or used token',
    });
  }

  const settings = await getSettings();
  const cutoff = new Date(b.pickup_at).getTime() - settings.cancelWindowHours * 3600_000;
  if (Date.now() > cutoff) {
    throw new BookingError('invalid_request', {
      stringKey: 'booking.cancel.tooLate',
      message: 'booking.cancel.tooLate',
    });
  }

  let refundCents = 0;
  if (b.payment_status === 'paid' || b.payment_status === 'partially_refunded') {
    refundCents = b.price_cents;
    const { rows: payRows } = await db().query<{ viva_transaction_id: string }>(
      `select viva_transaction_id::text
         from public.payments
        where booking_id = $1::uuid and kind = 'payment' and status = 'succeeded'
          and viva_transaction_id is not null
        order by created_at asc limit 1`,
      [b.id],
    );
    const txId = payRows[0]?.viva_transaction_id;
    if (txId) {
      await getPaymentProvider().refund({
        transactionId: txId,
        amountCents: refundCents,
      });
    }
  }

  await db().query(
    `update public.bookings
        set status = 'cancelled',
            cancelled_at = now(),
            cancel_token_hash = null,
            payment_status = case
              when payment_status in ('paid', 'partially_refunded') then 'refunded'::public.payment_status
              else payment_status
            end
      where id = $1::uuid`,
    [b.id],
  );

  await fireOnCancelled(b.reference, refundCents);

  return {
    reference: b.reference,
    status: 'cancelled' as const,
    refundCents,
  };
}
