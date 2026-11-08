export type ApiError = {
  error: string;
  message: string;
  fields?: Record<string, string>;
  reference?: string;
};

export class BookingApiError extends Error {
  readonly status: number;
  readonly body: ApiError;
  readonly dateHeader: string | null;

  constructor(status: number, body: ApiError, dateHeader: string | null) {
    super(body.message || body.error);
    this.name = 'BookingApiError';
    this.status = status;
    this.body = body;
    this.dateHeader = dateHeader;
  }
}

export type ApiResult<T> = { data: T; dateHeader: string | null };

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        accept: 'application/json',
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new BookingApiError(0, { error: 'invalid_request', message: 'network' }, null);
  }

  const dateHeader = res.headers.get('Date');
  if (res.status === 204) {
    return { data: undefined as T, dateHeader };
  }

  const json = (await res.json().catch(() => null)) as ApiError | T | null;
  if (!res.ok) {
    const body =
      json && typeof json === 'object' && 'error' in json
        ? (json as ApiError)
        : { error: 'invalid_request', message: 'Request failed' };
    throw new BookingApiError(res.status, body, dateHeader);
  }
  return { data: json as T, dateHeader };
}

export const bookingApi = {
  options: () =>
    request<{
      timezone: string;
      minLeadMinutes: number;
      holdMinutes: number;
      kmPerHour: number;
      waitingAirportFreeMin: number;
      returnTrip: boolean;
      flightTracking: boolean;
      zones: { code: string; name: string }[];
      /** Admin zone pairs (zone_routes) for suggestion chips. */
      routes?: { fromCode: string; toCode: string; label: string }[];
      classes: {
        key: string;
        name: string;
        maxPassengers: number;
        maxLuggage: number;
        hourly: { minHours: number; maxHours: number } | null;
        photo: { url: string; alt: string } | null;
        tagline: string | null;
      }[];
      extras: {
        code: string;
        name: string;
        priceCents: number;
        appliesTo: string[];
        maxQuantity: number;
      }[];
    }>('/api/booking-options'),

  quote: (body: unknown, accessToken?: string) =>
    request<{
      pickupAt: string;
      durationMinutes: number;
      currency: string;
      options: {
        classKey: string;
        baseCents: number | null;
        available: boolean;
        reason?: string;
        breakdown?: { code: string; label: string; amount: number }[];
        outbound?: number | null;
        return?: number | null;
        total?: number | null;
        returnDiscountPct?: number;
      }[];
      quoteId?: string;
      expiresAt?: string;
      signature?: string;
      distanceKm?: number | null;
      durationMin?: number;
      returnDiscountPct?: number;
    }>('/api/quote', {
      method: 'POST',
      body: JSON.stringify(body),
      ...(accessToken ? { headers: { authorization: `Bearer ${accessToken}` } } : {}),
    }),

  createHold: (body: unknown) =>
    request<{
      holdId: string;
      expiresAt: string;
      classKey: string;
      baseCents: number;
    }>('/api/holds', { method: 'POST', body: JSON.stringify(body) }),

  releaseHold: (holdId: string) =>
    request<void>(`/api/holds/${encodeURIComponent(holdId)}`, { method: 'DELETE' }),

  /** Ends a pending, unpaid booking and its hold (the review step's Edit buttons). */
  releaseBooking: (reference: string) =>
    request<{ ok: true }>('/api/bookings/release', {
      method: 'POST',
      body: JSON.stringify({ reference }),
    }),

  /** Company member booking (`/business/app`): on account, or card with the company tagged. */
  corporateBookOnAccount: (body: unknown, accessToken: string) =>
    request<{ reference: string; status: string; paymentMethod: string }>(
      '/api/corporate/book-on-account',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      },
    ),

  corporateBookCard: (body: unknown, accessToken: string) =>
    request<{
      reference: string;
      status: string;
      currency: string;
      lines: { label: string; cents: number }[];
      totalCents: number;
      vatRateBp: number;
      vatCents: number;
      holdExpiresAt: string;
      checkoutUrl: string;
    }>('/api/corporate/book-card', {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    }),

  createBooking: (body: unknown) =>
    request<{
      reference: string;
      status: string;
      currency: string;
      lines: { label: string; cents: number }[];
      totalCents: number;
      vatRateBp: number;
      vatCents: number;
      holdExpiresAt: string;
      checkoutUrl: string;
    }>('/api/bookings', { method: 'POST', body: JSON.stringify(body) }),
};
