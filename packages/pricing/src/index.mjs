// @tem/pricing — pure priceTrip (no I/O). Money = integer cents. docs/BOOKING-V2-PLAN.md §3

import { pointInRing } from '@tem/geo';

/**
 * @typedef {{ code: string, label: string, amount: number }} BreakdownLine
 * @typedef {{
 *   total: number, net: number, vat: number,
 *   breakdown: BreakdownLine[],
 *   available: boolean,
 *   reason?: string,
 *   kmIncluded?: number,
 * }} ClassPrice
 */

/** Split VAT-inclusive gross into net + vat (same formula as bookings.vat_cents). */
export function splitVat(grossCents, vatRateBp) {
  const g = Math.trunc(grossCents);
  const bp = Math.trunc(vatRateBp);
  const net = Math.round((g * 10000) / (10000 + bp));
  return { net, vat: g - net };
}

/** Round up to the next multiple of `rounding` euros (1 or 5). */
export function roundUpEuros(cents, rounding) {
  const step = (rounding === 5 ? 5 : 1) * 100;
  if (cents <= 0) return 0;
  return Math.ceil(cents / step) * step;
}

/** Minutes since local midnight in Europe/Athens. */
export function athensMinutesOfDay(isoOrDate) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Athens',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

/** Parse "HH:MM" to minutes. */
export function parseHm(hm) {
  const [h, m] = String(hm).split(':').map(Number);
  return h * 60 + m;
}

/**
 * Night window in Athens local time. Supports windows that cross midnight (from > to).
 */
/** Apply return discount % to leg-2 cents only (integer). */
export function applyReturnDiscount(cents, pct) {
  const p = Number(pct) || 0;
  if (!Number.isFinite(cents) || cents <= 0 || p <= 0) return Math.round(cents) || 0;
  const clamped = Math.min(100, Math.max(0, p));
  return Math.max(0, Math.round(cents * (1 - clamped / 100)));
}

export function inNightWindow(pickupAt, night) {
  if (!night?.from || !night?.to) return false;
  const t = athensMinutesOfDay(pickupAt);
  const from = parseHm(night.from);
  const to = parseHm(night.to);
  if (from === to) return false;
  if (from < to) return t >= from && t < to;
  // crosses midnight, e.g. 22:00 → 06:00
  return t >= from || t < to;
}

/** Highest matching period factor (never multiply periods). Default 1. */
export function periodFactor(pickupAt, periods) {
  if (!Array.isArray(periods) || !periods.length) return 1;
  const d = pickupAt instanceof Date ? pickupAt : new Date(pickupAt);
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Athens',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d); // YYYY-MM-DD
  let best = 1;
  for (const p of periods) {
    if (p.active === false) continue;
    const start = String(p.starts_on).slice(0, 10);
    const end = String(p.ends_on).slice(0, 10);
    if (day >= start && day <= end) {
      const f = Number(p.factor);
      if (Number.isFinite(f) && f > best) best = f;
    }
  }
  return best;
}

/** GeoJSON Polygon → ring for pointInRing. */
function ringFromPolygon(polygon) {
  if (!polygon) return null;
  if (Array.isArray(polygon)) return polygon;
  const coords = polygon.coordinates?.[0];
  return Array.isArray(coords) ? coords : null;
}

/**
 * Sum area fees for points that fall inside active airport/port polygons.
 * @returns {{ total: number, lines: BreakdownLine[] }}
 */
export function areaFees(points, areas) {
  const lines = [];
  let total = 0;
  if (!Array.isArray(areas) || !Array.isArray(points)) return { total, lines };
  for (const area of areas) {
    if (area.active === false) continue;
    const ring = ringFromPolygon(area.polygon);
    if (!ring) continue;
    const fee = Math.trunc(area.fee ?? 0);
    if (fee <= 0) continue;
    for (const pt of points) {
      if (!pt || !Number.isFinite(pt.lat) || !Number.isFinite(pt.lng)) continue;
      if (pointInRing(pt.lat, pt.lng, ring)) {
        const code = `area_${area.kind || 'fee'}`;
        lines.push({ code, label: area.label || 'Area fee', amount: fee });
        total += fee;
        break; // one fee per area even if both ends inside
      }
    }
  }
  return { total, lines };
}

function applyFactor(cents, factor) {
  const f = Number(factor);
  if (!Number.isFinite(f) || f === 1) return Math.trunc(cents);
  return Math.round(Math.trunc(cents) * f);
}

function ratesAreZero(rate) {
  if (!rate) return true;
  return (
    (rate.base_fare ?? 0) === 0 &&
    (rate.per_km ?? 0) === 0 &&
    (rate.per_min ?? 0) === 0 &&
    (rate.minimum_fare ?? 0) === 0
  );
}

/**
 * Price a trip for every class. Pure — no I/O.
 *
 * @param {{
 *   trip: {
 *     type: 'transfer'|'hourly',
 *     pickupAt: string|Date,
 *     distanceKm?: number|null,
 *     durationMin: number,
 *     hours?: number|null,
 *     stops?: unknown[],
 *     pickup?: { lat: number, lng: number }|null,
 *     dropoff?: { lat: number, lng: number }|null,
 *   },
 *   classes: Array<{ key: string, hourlyRateCents?: number|null, minHours?: number|null, maxHours?: number|null }>,
 *   rates: Record<string, { base_fare: number, per_km: number, per_min: number, minimum_fare: number, km_per_hour?: number }>,
 *   settings: {
 *     night: { from: string, to: string, factor: number },
 *     stop_fee: number,
 *     rounding: 1|5,
 *     waiting?: object,
 *     return_discount_pct?: number,
 *     quote_ttl_min?: number,
 *     demand?: object,
 *   },
 *   periods?: Array<{ label?: string, starts_on: string, ends_on: string, factor: number, active?: boolean }>,
 *   areas?: Array<{ label: string, kind: string, polygon: unknown, fee: number, active?: boolean }>,
 *   zonePrice?: (classKey: string) => number|null|undefined,
 *   mode?: 'zones'|'distance'|'hybrid',
 *   demand?: number,
 *   extras?: BreakdownLine[],
 *   vatRateBp?: number,
 * }} input
 * @returns {{ perClass: Record<string, ClassPrice> }}
 */
export function priceTrip(input) {
  const {
    trip,
    classes,
    rates,
    settings,
    periods = [],
    areas = [],
    zonePrice,
    mode = 'distance',
    demand = 1,
    extras = [],
    vatRateBp = 2400,
  } = input;

  const nightOn = inNightWindow(trip.pickupAt, settings.night);
  const nightF = nightOn ? Number(settings.night.factor) || 1 : 1;
  const periodF = periodFactor(trip.pickupAt, periods);
  const demandF = Number(demand) > 0 ? Number(demand) : 1;
  const stopFee = Math.trunc(settings.stop_fee ?? 0);
  const stopCount = Array.isArray(trip.stops) ? trip.stops.length : 0;
  const stopsCents = stopFee * stopCount;
  const points = [trip.pickup, trip.dropoff].filter(Boolean);
  const areasResult = areaFees(points, areas);
  const extrasCents = extras.reduce((s, e) => s + Math.trunc(e.amount || 0), 0);

  /** @type {Record<string, ClassPrice>} */
  const perClass = {};

  for (const cls of classes) {
    const key = cls.key;
    const rate = rates[key];
    const zp = typeof zonePrice === 'function' ? zonePrice(key) : null;
    const hasZone = Number.isFinite(zp) && zp > 0;

    if (trip.type === 'hourly') {
      const hours = Math.trunc(trip.hours ?? 0);
      const hr = cls.hourlyRateCents;
      if (!Number.isFinite(hr) || hr == null || hours < 1) {
        perClass[key] = {
          total: 0,
          net: 0,
          vat: 0,
          breakdown: [],
          available: false,
          reason: 'not_priced',
        };
        continue;
      }
      if (
        cls.minHours != null &&
        cls.maxHours != null &&
        (hours < cls.minHours || hours > cls.maxHours)
      ) {
        perClass[key] = {
          total: 0,
          net: 0,
          vat: 0,
          breakdown: [],
          available: false,
          reason: 'not_priced',
        };
        continue;
      }

      const kmPerHour = rate?.km_per_hour ?? 40;
      const kmIncluded = hours * kmPerHour;
      /** @type {BreakdownLine[]} */
      const breakdown = [
        { code: 'hourly', label: `Hourly × ${hours}`, amount: hr * hours },
      ];
      let cents = hr * hours;
      if (nightOn && nightF !== 1) {
        const before = cents;
        cents = applyFactor(cents, nightF);
        breakdown.push({ code: 'night', label: 'Night', amount: cents - before });
      }
      if (periodF !== 1) {
        const before = cents;
        cents = applyFactor(cents, periodF);
        breakdown.push({ code: 'period', label: 'Special period', amount: cents - before });
      }
      if (demandF !== 1) {
        const before = cents;
        cents = applyFactor(cents, demandF);
        breakdown.push({ code: 'demand', label: 'Demand', amount: cents - before });
      }
      for (const e of extras) breakdown.push({ ...e, amount: Math.trunc(e.amount) });
      cents += extrasCents;
      const rounded = roundUpEuros(cents, settings.rounding);
      if (rounded !== cents) {
        breakdown.push({ code: 'rounding', label: 'Rounding', amount: rounded - cents });
      }
      if (rounded <= 0) {
        perClass[key] = {
          total: 0,
          net: 0,
          vat: 0,
          breakdown: [],
          available: false,
          reason: 'not_priced',
          kmIncluded,
        };
        continue;
      }
      const { net, vat } = splitVat(rounded, vatRateBp);
      perClass[key] = {
        total: rounded,
        net,
        vat,
        breakdown,
        available: true,
        kmIncluded,
      };
      continue;
    }

    // --- transfer ---
    const useFixed = (mode === 'hybrid' || mode === 'zones') && hasZone;
    if (!useFixed && ratesAreZero(rate) && !hasZone) {
      perClass[key] = {
        total: 0,
        net: 0,
        vat: 0,
        breakdown: [],
        available: false,
        reason: 'not_priced',
      };
      continue;
    }
    if (mode === 'distance' && ratesAreZero(rate) && !hasZone) {
      perClass[key] = {
        total: 0,
        net: 0,
        vat: 0,
        breakdown: [],
        available: false,
        reason: 'not_priced',
      };
      continue;
    }
    if (mode === 'distance' && ratesAreZero(rate)) {
      perClass[key] = {
        total: 0,
        net: 0,
        vat: 0,
        breakdown: [],
        available: false,
        reason: 'not_priced',
      };
      continue;
    }

    /** @type {BreakdownLine[]} */
    const breakdown = [];
    let cents = 0;

    if (useFixed) {
      cents = Math.trunc(zp);
      breakdown.push({ code: 'fixed_route', label: 'Fixed route price', amount: cents });
    } else {
      const km = Number(trip.distanceKm) || 0;
      const mins = Math.trunc(trip.durationMin) || 0;
      const base = Math.trunc(rate.base_fare);
      const dist = Math.round(km * Math.trunc(rate.per_km));
      const time = mins * Math.trunc(rate.per_min);
      cents = base + dist + time;
      if (base) breakdown.push({ code: 'base_fare', label: 'Base fare', amount: base });
      if (dist) breakdown.push({ code: 'distance', label: 'Distance', amount: dist });
      if (time) breakdown.push({ code: 'time', label: 'Time', amount: time });
      if (!base && !dist && !time) {
        breakdown.push({ code: 'base_fare', label: 'Base fare', amount: 0 });
      }
    }

    if (stopsCents > 0) {
      breakdown.push({ code: 'stops', label: 'Extra stops', amount: stopsCents });
      cents += stopsCents;
    }
    for (const line of areasResult.lines) {
      breakdown.push(line);
      cents += line.amount;
    }

    if (nightOn && nightF !== 1) {
      const before = cents;
      cents = applyFactor(cents, nightF);
      breakdown.push({ code: 'night', label: 'Night', amount: cents - before });
    }
    if (periodF !== 1) {
      const before = cents;
      cents = applyFactor(cents, periodF);
      breakdown.push({ code: 'period', label: 'Special period', amount: cents - before });
    }
    if (demandF !== 1) {
      const before = cents;
      cents = applyFactor(cents, demandF);
      breakdown.push({ code: 'demand', label: 'Demand', amount: cents - before });
    }

    const minFare = Math.trunc(rate?.minimum_fare ?? 0);
    if (!useFixed && minFare > cents) {
      breakdown.push({ code: 'minimum', label: 'Minimum fare', amount: minFare - cents });
      cents = minFare;
    }

    for (const e of extras) breakdown.push({ ...e, amount: Math.trunc(e.amount) });
    cents += extrasCents;

    const rounded = roundUpEuros(cents, settings.rounding);
    if (rounded !== cents) {
      breakdown.push({ code: 'rounding', label: 'Rounding', amount: rounded - cents });
    }

    if (rounded <= 0) {
      perClass[key] = {
        total: 0,
        net: 0,
        vat: 0,
        breakdown: [],
        available: false,
        reason: 'not_priced',
      };
      continue;
    }

    const { net, vat } = splitVat(rounded, vatRateBp);
    perClass[key] = { total: rounded, net, vat, breakdown, available: true };
  }

  return { perClass };
}

export { pointInRing };
