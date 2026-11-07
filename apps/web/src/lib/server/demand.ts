import 'server-only';
import { features } from '@tem/features';
import {
  demandFactor,
  occupancyRatio,
  peakBusyCount,
  type PricingSettings,
} from '@tem/pricing';
import { bookingDb } from './db';

export type DemandSnapshot = {
  factor: number;
  occupancy: number;
  peakBusy: number;
  activeVehicles: number;
  unavailable: boolean;
};

/**
 * Peak occupancy over the trip window [pickup, pickup+duration), then demand factor.
 * Returns factor 1 when FEATURE_DEMAND_PRICING is off or settings.demand.enabled is false.
 */
export async function demandFactorForClass(input: {
  classId: string;
  classKey: string;
  pickupAt: Date | string;
  durationMin: number;
  demand?: PricingSettings['demand'] | null;
}): Promise<DemandSnapshot> {
  const featureOn = features().demandPricing;
  const demand = input.demand;
  if (!featureOn || !demand?.enabled) {
    return { factor: 1, occupancy: 0, peakBusy: 0, activeVehicles: 0, unavailable: false };
  }

  const pickup = new Date(input.pickupAt);
  const durationMs = Math.max(1, Math.trunc(input.durationMin)) * 60_000;
  const windowEnd = new Date(pickup.getTime() + durationMs);

  const { rows: activeRows } = await bookingDb().query<{ n: number }>(
    `select count(*)::int as n from public.vehicles
      where class_id = $1::uuid and status = 'active'`,
    [input.classId],
  );
  const activeVehicles = activeRows[0]?.n ?? 0;
  if (activeVehicles <= 0) {
    return { factor: 1, occupancy: 0, peakBusy: 0, activeVehicles: 0, unavailable: true };
  }

  const { rows: intervals } = await bookingDb().query<{ start: Date; end: Date }>(
    `select b.pickup_at as start,
            b.pickup_at + make_interval(mins => b.duration_minutes) as end
       from public.bookings b
      where b.class_id = $1::uuid
        and b.status not in ('cancelled', 'expired', 'completed')
        and (b.status in ('confirmed', 'assigned')
             or (b.status = 'pending' and b.hold_expires_at > now()))
        and b.pickup_at < $3::timestamptz
        and b.pickup_at + make_interval(mins => b.duration_minutes) > $2::timestamptz
     union all
     select h.pickup_at as start,
            h.pickup_at + make_interval(mins => coalesce(h.duration_minutes, 0)) as end
       from public.slot_holds h
      where h.class_id = $1::uuid
        and h.status = 'active' and h.expires_at > now()
        and h.booking_id is null
        and h.pickup_at is not null and h.duration_minutes is not null
        and h.pickup_at < $3::timestamptz
        and h.pickup_at + make_interval(mins => h.duration_minutes) > $2::timestamptz`,
    [input.classId, pickup.toISOString(), windowEnd.toISOString()],
  );

  const peakBusy = peakBusyCount(intervals, pickup, windowEnd);
  const { occupancy, unavailable } = occupancyRatio(peakBusy, activeVehicles);
  if (unavailable) {
    return { factor: 1, occupancy: 0, peakBusy, activeVehicles, unavailable: true };
  }
  const { factor } = demandFactor({
    featureOn: true,
    demand,
    occupancy,
    activeVehicles,
  });
  return { factor, occupancy, peakBusy, activeVehicles, unavailable: false };
}

/** Compute demand factors for many classes (same window). */
export async function demandFactorsForClasses(input: {
  classes: Array<{ id: string; key: string }>;
  pickupAt: Date | string;
  durationMin: number;
  demand?: PricingSettings['demand'] | null;
}): Promise<Record<string, DemandSnapshot>> {
  const out: Record<string, DemandSnapshot> = {};
  await Promise.all(
    input.classes.map(async (c) => {
      out[c.key] = await demandFactorForClass({
        classId: c.id,
        classKey: c.key,
        pickupAt: input.pickupAt,
        durationMin: input.durationMin,
        demand: input.demand,
      });
    }),
  );
  return out;
}

/** Strip demand lines from customer-facing breakdown (admin keeps full quote JSON). */
export function publicBreakdown<T extends { code?: string }>(lines: T[] | null | undefined): T[] {
  return (lines ?? []).filter((l) => l.code !== 'demand');
}
