import 'server-only';
import { features } from '@tem/features';
import { inServiceArea } from '@tem/geo';
import { priceTrip, type PricingSettings } from '@tem/pricing';
import { route, RouteUnavailable } from '@tem/places';
import { BookingError } from '../booking/types';
import { bookingDb } from './db';
import { createRouteDbCache } from './route-cache';

type LatLng = { lat: number; lng: number };

export async function assertInServiceArea(points: LatLng[]): Promise<void> {
  const area = features().serviceArea || 'attica';
  for (const p of points) {
    if (!inServiceArea(p, area)) {
      throw new BookingError('outside_area', {
        stringKey: 'error.outside_area',
        message: 'outside_area',
      });
    }
  }
}

export async function loadPricingContext() {
  const db = bookingDb();
  const [{ rows: rateRows }, { rows: settingsRows }, { rows: periodRows }, { rows: areaRows }, { rows: vatRows }] =
    await Promise.all([
      db.query<{
        id: string;
        class_key: string;
        base_fare: number;
        per_km: number;
        per_min: number;
        minimum_fare: number;
        km_per_hour: number;
      }>(`select * from public.current_class_rates`),
      db.query<{ id: string; doc: PricingSettings }>(`select id, doc from public.current_pricing_settings`),
      db.query<{
        label: string;
        starts_on: string;
        ends_on: string;
        factor: number;
        active: boolean;
      }>(`select label, starts_on::text, ends_on::text, factor::float8 as factor, active from public.pricing_periods where active`),
      db.query<{
        label: string;
        kind: string;
        polygon: unknown;
        fee: number;
        active: boolean;
      }>(`select label, kind, polygon, fee, active from public.pricing_areas where active`),
      db.query<{ v: number }>(`select coalesce(public.setting_int('vat_rate_bp'), 2400) as v`),
    ]);

  const settingsRow = settingsRows[0];
  if (!settingsRow) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'pricing_settings_missing',
    });
  }

  const rates: Record<string, (typeof rateRows)[0]> = {};
  for (const r of rateRows) rates[r.class_key] = r;

  return {
    rates,
    settings: settingsRow.doc,
    settingsId: settingsRow.id,
    rateIds: Object.fromEntries(rateRows.map((r) => [r.class_key, r.id])),
    periods: periodRows,
    areas: areaRows,
    vatRateBp: vatRows[0]?.v ?? 2400,
  };
}

export async function routeDistance(input: {
  origin: LatLng;
  destination: LatLng;
  stops?: LatLng[];
  departAt: Date;
}): Promise<{ distanceKm: number; durationMin: number }> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) {
    throw new BookingError('service_unavailable', {
      stringKey: 'error.service_unavailable',
      message: 'routing_failed',
    });
  }
  try {
    return await route({
      origin: input.origin,
      destination: input.destination,
      stops: input.stops ?? [],
      departAt: input.departAt,
      apiKey: key,
      dbCache: createRouteDbCache(),
    });
  } catch (e) {
    if (e instanceof RouteUnavailable) {
      // Google found no road route → no_route (422); timeout / 5xx / quota → service_unavailable (503).
      const noRoute = e.reason === 'no_route';
      throw new BookingError(noRoute ? 'no_route' : 'service_unavailable', {
        stringKey: noRoute ? 'error.no_route' : 'error.service_unavailable',
        message: noRoute ? 'no_route' : 'routing_failed',
      });
    }
    throw e;
  }
}

export async function zonePriceCents(
  fromZoneId: string,
  toZoneId: string,
  classId: string,
): Promise<number | null> {
  const { rows } = await bookingDb().query<{ price_cents: number }>(
    `select price_cents from public.zone_prices
      where from_zone_id = $1 and to_zone_id = $2 and class_id = $3`,
    [fromZoneId, toZoneId, classId],
  );
  return rows[0]?.price_cents ?? null;
}

export { priceTrip, features };
