/** Pure helpers for the booking Driver select (buffers already in blocked_range). */

export type TimeRange = { startMs: number; endMs: number };

export type DriverBookingSlice = TimeRange & {
  driverId: string;
  reference: string;
  status: string;
  /** Booking id — used to ignore the booking being edited. */
  id?: string;
};

const LIVE = new Set(['pending', 'confirmed', 'assigned']);

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

export function busyOverlap(
  target: TimeRange,
  bookings: DriverBookingSlice[],
  driverId: string,
  excludeBookingId?: string,
): DriverBookingSlice | null {
  for (const b of bookings) {
    if (b.driverId !== driverId) continue;
    if (!LIVE.has(b.status)) continue;
    if (excludeBookingId && b.id === excludeBookingId) continue;
    if (rangesOverlap(target, b)) return b;
  }
  return null;
}

function athensHm(ms: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Athens',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ms));
}

function athensDayMonth(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00+02:00`);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Athens',
    day: 'numeric',
    month: 'short',
  }).format(d);
}

export type DriverOfferInput = {
  driverId: string;
  fullName: string;
  onShift: boolean;
  licenceExpiresOn: string | null;
  tripStartMs: number;
  tripEndMs: number;
  bookings: DriverBookingSlice[];
  nowMs?: number;
  /** Exclude this booking's own assignment when re-rendering. */
  excludeBookingId?: string;
};

export type DriverOffer = {
  id: string;
  label: string;
  meta: string;
  disabled: boolean;
  warning?: string;
};

/** Build one Select option for an active driver. */
export function classifyDriverOffer(input: DriverOfferInput): DriverOffer {
  const target = { startMs: input.tripStartMs, endMs: input.tripEndMs };
  const clash = busyOverlap(target, input.bookings, input.driverId, input.excludeBookingId);
  const now = input.nowMs ?? Date.now();
  const tripDay = new Date(input.tripStartMs).toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });

  let warning: string | undefined;
  if (input.licenceExpiresOn) {
    const expires = input.licenceExpiresOn;
    const in30 = new Date(now + 30 * 86400_000).toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
    if (expires < tripDay || expires <= in30) {
      warning = `licence expires ${athensDayMonth(expires)}`;
    }
  }

  if (clash) {
    return {
      id: input.driverId,
      label: input.fullName,
      meta: `busy ${athensHm(clash.startMs)}–${athensHm(clash.endMs)}`,
      disabled: true,
      warning,
    };
  }

  const base = input.onShift ? 'on shift · free' : 'free';
  return {
    id: input.driverId,
    label: input.fullName,
    meta: warning ? `${base} · ${warning}` : base,
    disabled: false,
    warning,
  };
}

export function expiresWithinDays(isoDate: string | null | undefined, days: number, nowMs = Date.now()): boolean {
  if (!isoDate) return false;
  const limit = new Date(nowMs + days * 86400_000).toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
  return isoDate <= limit;
}
