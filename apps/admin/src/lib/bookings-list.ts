/** Bookings list tabs, filters and load-error handling (staff session / RLS). */

export type BookingsTab =
  | 'upcoming'
  | 'need_vehicle'
  | 'pending'
  | 'past'
  | 'cancelled'
  | 'all';

export const BOOKINGS_TABS: readonly BookingsTab[] = [
  'upcoming',
  'need_vehicle',
  'pending',
  'past',
  'cancelled',
  'all',
] as const;

export const BOOKINGS_TAB_LABEL: Record<BookingsTab, string> = {
  upcoming: 'Upcoming',
  need_vehicle: 'Need a vehicle',
  pending: 'Pending payment',
  past: 'Past',
  cancelled: 'Cancelled',
  all: 'All',
};

/** Map query string (incl. legacy status= / needs_vehicle=) to a tab. Default: upcoming. */
export function parseBookingsTab(params: URLSearchParams): BookingsTab {
  const tab = params.get('tab');
  if (tab && (BOOKINGS_TABS as readonly string[]).includes(tab)) return tab as BookingsTab;

  if (params.get('needs_vehicle') === '1') return 'need_vehicle';

  const status = params.get('status');
  if (status === 'pending') return 'pending';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'completed' || status === 'expired') return 'past';
  if (status === 'all') return 'all';
  if (status === 'confirmed' || status === 'assigned' || status === 'active' || !status) {
    return 'upcoming';
  }
  return 'upcoming';
}

/** Apply the tab's status / time filters. Returns sort direction for pickup_at. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase filter builders are invariant
export function applyBookingsTab<T extends { eq: (...a: any[]) => any; in: (...a: any[]) => any; is: (...a: any[]) => any; gte: (...a: any[]) => any; gt: (...a: any[]) => any; or: (...a: any[]) => any }>(
  query: T,
  tab: BookingsTab,
  nowIso: string,
): { query: T; ascending: boolean } {
  switch (tab) {
    case 'upcoming':
      return {
        query: query.in('status', ['confirmed', 'assigned']).gte('pickup_at', nowIso) as T,
        ascending: true,
      };
    case 'need_vehicle':
      return {
        query: query.eq('status', 'confirmed').is('vehicle_id', null) as T,
        ascending: true,
      };
    case 'pending':
      return {
        query: query.eq('status', 'pending').gt('hold_expires_at', nowIso) as T,
        ascending: true,
      };
    case 'past':
      // Pick-up before now (any status), plus expired (even if pick-up is still ahead).
      // Quote the timestamp so PostgREST does not split on `:`.
      return {
        query: query.or(`pickup_at.lt."${nowIso}",status.eq.expired`) as T,
        ascending: false,
      };
    case 'cancelled':
      return {
        query: query.eq('status', 'cancelled') as T,
        ascending: false,
      };
    case 'all':
      return { query, ascending: false };
  }
}

export type ListLoadResult<T> =
  | { ok: true; rows: T[] }
  | { ok: false; message: string };

/** Never treat a Supabase error as an empty list. */
export function resolveListLoad<T>(
  entity: string,
  data: T[] | null,
  error: { message: string } | null,
): ListLoadResult<T> {
  if (error) {
    return { ok: false, message: `Could not load ${entity}: ${error.message}` };
  }
  return { ok: true, rows: data ?? [] };
}

export function logListError(code: string, message: string): void {
  console.error(JSON.stringify({ level: 'error', code, message }));
}
