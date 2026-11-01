import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { athensLocalToInstant } from './time';

/**
 * Read-only trip helpers for the New booking form. They use the signed-in staff session (RLS),
 * never the service role. The price shown here is a hint: the web app recomputes it on create.
 */
type Db = SupabaseClient<Database>;

export type TripInput = {
  pickupLocal: string;
  type: 'transfer' | 'hourly';
  fromZone: string;
  toZone?: string;
  hours?: number;
  passengers: number;
  luggage: number;
};

export type ClassOffer = {
  key: string;
  name: string;
  free: number;
  /** Price list base for this trip, or null when no price is set. */
  priceCents: number | null;
  fits: boolean;
  maxPassengers: number;
  maxLuggage: number;
};

export type ExtraOffer = { code: string; name: string; priceCents: number };

export class TripError extends Error {}

/** Postgres range literal for [start, end). */
export function rangeLiteral(start: Date, end: Date): string {
  return `[${start.toISOString()},${end.toISOString()})`;
}

export function tripRange(pickup: Date, durationMinutes: number, bufferMinutes: number): string {
  const ms = 60_000;
  return rangeLiteral(
    new Date(pickup.getTime() - bufferMinutes * ms),
    new Date(pickup.getTime() + (durationMinutes + bufferMinutes) * ms),
  );
}

export async function tripDuration(
  supabase: Db,
  input: Pick<TripInput, 'type' | 'fromZone' | 'toZone' | 'hours'>,
): Promise<{ durationMinutes: number; fromId: string; toId: string | null }> {
  const { data: zones } = await supabase
    .from('zones')
    .select('id, code')
    .in('code', [input.fromZone, ...(input.toZone ? [input.toZone] : [])])
    .eq('active', true);
  const from = zones?.find((z) => z.code === input.fromZone);
  if (!from) throw new TripError('Unknown pick-up zone');
  if (input.type === 'hourly') {
    if (!input.hours || input.hours < 1) throw new TripError('Choose the number of hours');
    return { durationMinutes: input.hours * 60, fromId: from.id, toId: null };
  }
  const to = zones?.find((z) => z.code === input.toZone);
  if (!to || to.id === from.id) throw new TripError('Choose a different drop-off zone');
  const { data: route } = await supabase
    .from('zone_routes')
    .select('duration_minutes')
    .eq('from_zone_id', from.id)
    .eq('to_zone_id', to.id)
    .maybeSingle();
  if (!route) throw new TripError('No route between these zones');
  return { durationMinutes: route.duration_minutes, fromId: from.id, toId: to.id };
}

/** Free vehicles per active class for the trip window (buffers included) plus its list price. */
export async function classAvailabilityForTrip(
  supabase: Db,
  input: TripInput,
): Promise<{ durationMinutes: number; classes: ClassOffer[]; extras: ExtraOffer[] }> {
  let pickup: Date;
  try {
    pickup = athensLocalToInstant(input.pickupLocal);
  } catch {
    throw new TripError('Invalid Athens date/time');
  }
  const trip = await tripDuration(supabase, input);

  const [classesRes, pricesRes, ratesRes, extrasRes] = await Promise.all([
    supabase
      .from('vehicle_classes')
      .select('id, key, name, max_passengers, max_luggage, buffer_minutes')
      .eq('active', true)
      .order('sort_order')
      .order('name'),
    trip.toId
      ? supabase
          .from('zone_prices')
          .select('class_id, price_cents')
          .eq('from_zone_id', trip.fromId)
          .eq('to_zone_id', trip.toId)
      : Promise.resolve({ data: [] as { class_id: string; price_cents: number }[] }),
    supabase.from('hourly_rates').select('class_id, price_per_hour_cents, min_hours, max_hours'),
    supabase
      .from('extras')
      .select('code, name, price_cents')
      .eq('active', true)
      .order('price_cents', { ascending: false }),
  ]);

  const classes: ClassOffer[] = await Promise.all(
    (classesRes.data ?? []).map(async (c) => {
      const range = tripRange(pickup, trip.durationMinutes, c.buffer_minutes);
      const { data: free } = await supabase.rpc('class_availability', {
        p_class_id: c.id,
        p_range: range,
      });
      let priceCents: number | null = null;
      if (input.type === 'transfer') {
        priceCents = pricesRes.data?.find((p) => p.class_id === c.id)?.price_cents ?? null;
      } else {
        const r = ratesRes.data?.find((x) => x.class_id === c.id);
        if (r && input.hours && input.hours >= r.min_hours && input.hours <= r.max_hours) {
          priceCents = r.price_per_hour_cents * input.hours;
        }
      }
      return {
        key: c.key,
        name: c.name,
        free: free ?? 0,
        priceCents,
        fits: c.max_passengers >= input.passengers && c.max_luggage >= input.luggage,
        maxPassengers: c.max_passengers,
        maxLuggage: c.max_luggage,
      };
    }),
  );

  return {
    durationMinutes: trip.durationMinutes,
    classes,
    extras: (extrasRes.data ?? []).map((e) => ({
      code: e.code,
      name: e.name,
      priceCents: e.price_cents,
    })),
  };
}

export type VehicleOffer = { id: string; label: string; free: boolean };

/**
 * Active vehicles of a class, flagged free or busy for the trip window.
 * ponytail: reads the class's bookings and blocks and compares in code; fine for a small fleet,
 * move to an RPC if the fleet or booking volume grows.
 */
export async function freeVehiclesForClass(
  supabase: Db,
  input: { classKey: string; pickupLocal: string; durationMinutes: number },
): Promise<VehicleOffer[]> {
  let pickup: Date;
  try {
    pickup = athensLocalToInstant(input.pickupLocal);
  } catch {
    throw new TripError('Invalid Athens date/time');
  }
  const { data: cls } = await supabase
    .from('vehicle_classes')
    .select('id, buffer_minutes')
    .eq('key', input.classKey)
    .eq('active', true)
    .maybeSingle();
  if (!cls) throw new TripError('Unknown vehicle class');
  const range = tripRange(pickup, input.durationMinutes, cls.buffer_minutes);
  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, label')
    .eq('class_id', cls.id)
    .eq('status', 'active')
    .order('label');
  const ids = (vehicles ?? []).map((v) => v.id);
  if (!ids.length) return [];

  const [bookings, blocks] = await Promise.all([
    supabase
      .from('bookings')
      .select('vehicle_id, status, hold_expires_at')
      .in('vehicle_id', ids)
      .in('status', ['pending', 'confirmed', 'assigned'])
      .filter('blocked_range', 'ov', range),
    supabase.from('blocked_slots').select('vehicle_id').in('vehicle_id', ids).filter('range', 'ov', range),
  ]);
  const now = Date.now();
  const busy = new Set<string>();
  for (const b of bookings.data ?? []) {
    const live = b.status !== 'pending' || (b.hold_expires_at && new Date(b.hold_expires_at).getTime() > now);
    if (live && b.vehicle_id) busy.add(b.vehicle_id);
  }
  for (const s of blocks.data ?? []) busy.add(s.vehicle_id);
  return (vehicles ?? []).map((v) => ({ id: v.id, label: v.label, free: !busy.has(v.id) }));
}
