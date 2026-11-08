import 'server-only';
import { bookingDb } from './db';

export type FeaturedPlaceDto = {
  code: string;
  name: string;
  address: string;
  placeId: string;
  lat: number;
  lng: number;
  kind: string;
};

export type FeaturedRouteDto = {
  from: FeaturedPlaceDto;
  to: FeaturedPlaceDto;
  durationMin: number;
  fromPriceCents: number;
};

type Row = {
  from_code: string;
  from_name: string;
  from_address: string;
  from_place_id: string;
  from_lat: number;
  from_lng: number;
  from_kind: string | null;
  to_code: string;
  to_name: string;
  to_address: string;
  to_place_id: string;
  to_lat: number;
  to_lng: number;
  to_kind: string | null;
  duration_minutes: number;
  from_price_cents: number;
};

function stripDemo(name: string): string {
  return name.replace(/^DEMO\s+/i, '');
}

function mapPlace(
  code: string,
  name: string,
  address: string,
  placeId: string,
  lat: number,
  lng: number,
  kind: string | null,
): FeaturedPlaceDto {
  return {
    code,
    name: stripDemo(name),
    address,
    placeId,
    lat,
    lng,
    kind: kind || 'area',
  };
}

/** Map a featured_routes row; skips incomplete places (view should already filter). */
export function mapFeaturedRow(r: Row): FeaturedRouteDto | null {
  if (!r.from_place_id || !r.to_place_id || !r.from_address || !r.to_address) return null;
  if (r.from_lat == null || r.from_lng == null || r.to_lat == null || r.to_lng == null) return null;
  return {
    from: mapPlace(
      r.from_code,
      r.from_name,
      r.from_address,
      r.from_place_id,
      Number(r.from_lat),
      Number(r.from_lng),
      r.from_kind,
    ),
    to: mapPlace(
      r.to_code,
      r.to_name,
      r.to_address,
      r.to_place_id,
      Number(r.to_lat),
      Number(r.to_lng),
      r.to_kind,
    ),
    durationMin: Number(r.duration_minutes) || 0,
    fromPriceCents: Number(r.from_price_cents) || 0,
  };
}

/** Popular routes for the booking widget (service role / DATABASE_URL). */
export async function listFeaturedRoutes(limit = 8): Promise<FeaturedRouteDto[]> {
  const capped = Math.max(1, Math.min(20, Math.floor(limit) || 8));
  const { rows } = await bookingDb().query<Row>(
    `select from_code, from_name, from_address, from_place_id, from_lat, from_lng, from_kind,
            to_code, to_name, to_address, to_place_id, to_lat, to_lng, to_kind,
            duration_minutes, from_price_cents
       from public.featured_routes
      order by featured_order, from_name, to_name
      limit $1`,
    [capped],
  );
  const out: FeaturedRouteDto[] = [];
  for (const r of rows) {
    const mapped = mapFeaturedRow(r);
    if (mapped) out.push(mapped);
  }
  return out;
}
