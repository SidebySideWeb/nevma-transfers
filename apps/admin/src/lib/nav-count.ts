import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/** Confirmed bookings in the next 7 days with no vehicle assigned. */
export async function countNeedsVehicle(
  supabase: SupabaseClient<Database>,
): Promise<number> {
  const now = new Date();
  const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const { count, error } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'confirmed')
    .is('vehicle_id', null)
    .gte('pickup_at', now.toISOString())
    .lte('pickup_at', week.toISOString());
  if (error) return 0;
  return count ?? 0;
}
