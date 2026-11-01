export const BOOKING_STATUSES = [
  'pending',
  'confirmed',
  'assigned',
  'completed',
  'cancelled',
  'expired',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

const WORDS: Record<BookingStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  assigned: 'Assigned',
  completed: 'Completed',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

/** Status colour class: expired shares the completed (muted) tone. */
export function statusClass(status: BookingStatus): string {
  return status === 'expired' ? 's-completed' : `s-${status}`;
}

export function statusWord(status: BookingStatus): string {
  return WORDS[status];
}

export function renderStatusBadge(status: BookingStatus): string {
  return `<span class="badge ${statusClass(status)}">${statusWord(status)}</span>`;
}
