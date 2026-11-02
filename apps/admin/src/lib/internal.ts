import { signWithEnv } from './signing';

function siteUrl(): string {
  return (import.meta.env.PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '');
}

export type InternalResult =
  | { ok: true; data: unknown }
  | {
      ok: false;
      message: string;
      status: number;
      /** Web error code: no_price, unavailable, invalid_request, payment_failed. */
      code?: string;
      /** Field name → message, when the web app can pin the error to a field. */
      fields?: Record<string, string>;
    };

async function postInternal(
  path:
    | '/api/internal/cancel'
    | '/api/internal/refund'
    | '/api/internal/bookings'
    | '/api/internal/payments'
    | '/api/internal/drivers/invite'
    | '/api/internal/drivers/notify',
  body: unknown,
  staffUserId: string,
): Promise<InternalResult> {
  const rawBody = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWithEnv(rawBody, timestamp);
  const res = await fetch(`${siteUrl()}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tem-timestamp': String(timestamp),
      'x-tem-signature': signature,
      'x-tem-staff': staffUserId,
    },
    body: rawBody,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message: (data as { message?: string }).message || `HTTP ${res.status}`,
      code: (data as { error?: string }).error,
      fields: (data as { fields?: Record<string, string> }).fields,
    };
  }
  return { ok: true, data };
}

export async function callInternalCancel(
  body: {
    reference: string;
    refund: 'full' | 'none' | { amountCents: number };
    reason: string;
    idempotencyKey: string;
  },
  staffUserId: string,
) {
  return postInternal('/api/internal/cancel', body, staffUserId);
}

export async function callInternalRefund(
  body: {
    reference: string;
    amountCents: number;
    reason: string;
    idempotencyKey: string;
  },
  staffUserId: string,
) {
  return postInternal('/api/internal/refund', body, staffUserId);
}

export type OfficeBookingBody = {
  idempotencyKey: string;
  staffUserId: string;
  customer: { name: string; email: string; phone: string };
  bookingType: 'transfer' | 'hourly';
  classKey: string;
  fromZone: string;
  toZone?: string;
  hours?: number;
  pickupLocal: string;
  pickupAddress: string;
  dropoffAddress?: string;
  flightNumber?: string;
  passengers: number;
  luggage: number;
  extras: string[];
  vehicleId?: string;
  invoice?: { company: string; vat: string; taxOffice: string; address: string };
  notes?: string;
  priceOverrideCents?: number;
  priceOverrideReason?: string;
  payment: 'link' | 'offline_paid' | 'offline_collect';
  offlineMethod?: 'cash' | 'bank_transfer' | 'on_account';
  emailCustomer: boolean;
};

export async function callInternalBooking(body: OfficeBookingBody, staffUserId: string) {
  return postInternal('/api/internal/bookings', body, staffUserId);
}

export async function callInternalPayment(
  body: {
    idempotencyKey: string;
    reference: string;
    method: 'cash' | 'bank_transfer' | 'on_account';
    note?: string;
    amountCents?: number;
  },
  staffUserId: string,
) {
  return postInternal('/api/internal/payments', body, staffUserId);
}

export async function callInternalDriverInvite(body: { driverId: string }, staffUserId: string) {
  return postInternal('/api/internal/drivers/invite', body, staffUserId);
}

export async function callInternalDriverNotify(
  body: { reference: string; kind: 'assigned' | 'changed' | 'removed' },
  staffUserId: string,
) {
  return postInternal('/api/internal/drivers/notify', body, staffUserId);
}