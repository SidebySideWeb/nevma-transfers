import 'server-only';
import {
  createFlightProvider,
  etaMovedEnough,
  normalizeFlightNumber,
  pickupBufferMin,
  shouldPollFlight,
  suggestedPickupAt,
  type FlightLookup,
} from '@tem/flights';
import { features } from '@tem/features';
import { BookingError } from '../booking/types';
import { bookingDb } from './db';
import { sendEmail } from './email';

type FlightSettings = {
  bufferDomestic: number;
  bufferInternational: number;
  dailyCallCap: number;
  emailCustomer: boolean;
};

async function flightSettings(): Promise<FlightSettings> {
  const { rows } = await bookingDb().query<{ key: string; value: unknown }>(
    `select key, value from public.settings
      where key in (
        'flight_buffer_domestic_min',
        'flight_buffer_international_min',
        'flight_daily_call_cap',
        'email_customer_on_flight_change'
      )`,
  );
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    bufferDomestic: Number(map.get('flight_buffer_domestic_min') ?? 15) || 15,
    bufferInternational: Number(map.get('flight_buffer_international_min') ?? 30) || 30,
    dailyCallCap: Number(map.get('flight_daily_call_cap') ?? 200) || 200,
    emailCustomer: map.get('email_customer_on_flight_change') === true,
  };
}

async function providerCallsToday(): Promise<number> {
  const { rows } = await bookingDb().query<{ n: number }>(
    `select count(*)::int as n from public.flight_events
      where at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
        and source <> 'manual'`,
  );
  return rows[0]?.n ?? 0;
}

function provider() {
  return createFlightProvider({
    provider: process.env.FLIGHT_PROVIDER,
    apiKey: process.env.FLIGHT_PROVIDER_KEY,
  });
}

export async function lookupFlight(input: {
  number: string;
  date: string;
}): Promise<FlightLookup & { suggestedPickupAt?: string | null; warning?: string }> {
  if (!features().flightTracking) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'flight_tracking_off',
    });
  }
  const number = normalizeFlightNumber(input.number);
  if (!number || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'invalid_flight_lookup',
    });
  }
  const fs = await flightSettings();
  const used = await providerCallsToday();
  if (process.env.FLIGHT_PROVIDER !== 'manual' && used >= fs.dailyCallCap) {
    return {
      found: false,
      status: 'unknown',
      warning: 'Flight lookup daily limit reached. You can still book.',
    };
  }
  const result = await provider().lookup({ number, date: input.date });
  const buffer = pickupBufferMin(result.originCountry, {
    domestic: fs.bufferDomestic,
    international: fs.bufferInternational,
  });
  const arrival = result.eta || result.schedArr;
  const suggested = arrival ? suggestedPickupAt(arrival, buffer) : null;
  return {
    ...result,
    suggestedPickupAt: suggested?.toISOString() ?? null,
    warning: result.found
      ? undefined
      : "We couldn't find this flight. Check the number; you can still book.",
  };
}

export async function applyFlightLookupToBooking(
  bookingId: string,
  result: FlightLookup,
  source: string,
): Promise<{ shifted: boolean; conflict?: boolean; alert?: string }> {
  const fs = await flightSettings();
  const buffer = pickupBufferMin(result.originCountry, {
    domestic: fs.bufferDomestic,
    international: fs.bufferInternational,
  });

  const { rows: before } = await bookingDb().query<{
    reference: string;
    flight_number: string | null;
    flight_eta: Date | null;
    flight_sched_arr: Date | null;
    flight_status: string | null;
    pickup_at: Date;
    customer_email: string;
  }>(
    `select reference, flight_number, flight_eta, flight_sched_arr, flight_status, pickup_at, customer_email
       from public.bookings where id = $1::uuid`,
    [bookingId],
  );
  const b = before[0];
  if (!b) return { shifted: false };
  const flightLabel = normalizeFlightNumber(b.flight_number) || b.flight_number || 'flight';

  await bookingDb().query(
    `update public.bookings set
       flight_status = $2,
       flight_sched_arr = coalesce($3::timestamptz, flight_sched_arr),
       flight_eta = coalesce($4::timestamptz, flight_eta),
       flight_terminal = coalesce($5, flight_terminal),
       flight_origin = coalesce($6, flight_origin),
       flight_airline = coalesce($7, flight_airline),
       flight_checked_at = now()
     where id = $1::uuid`,
    [
      bookingId,
      result.status || 'unknown',
      result.schedArr,
      result.eta,
      result.terminal,
      result.origin,
      result.airline,
    ],
  );

  await bookingDb().query(
    `insert into public.flight_events (booking_id, status, eta, raw, source)
     values ($1::uuid, $2, $3::timestamptz, $4::jsonb, $5)`,
    [
      bookingId,
      result.status || null,
      result.eta,
      JSON.stringify(result.raw ?? {}),
      source,
    ],
  );

  const status = (result.status || '').toLowerCase();
  if (status === 'cancelled' || status === 'diverted') {
    const alert = `Flight ${flightLabel} ${status}: ${b.reference}. Do not move the booking automatically.`;
    await emailOffice(alert, b.reference);
    return { shifted: false, alert };
  }

  const baseline = b.flight_eta ?? b.flight_sched_arr ?? result.schedArr;
  if (!baseline || !result.eta || !etaMovedEnough(baseline, result.eta, 15)) {
    return { shifted: false };
  }

  const newPickup = suggestedPickupAt(result.eta, buffer);
  if (!newPickup) return { shifted: false };

  const { rows: shiftRows } = await bookingDb().query<{
    j: { ok: boolean; reason?: string; previous_pickup_at?: string; pickup_at?: string };
  }>(`select public.shift_pickup($1::uuid, $2::timestamptz, $3) as j`, [
    bookingId,
    newPickup.toISOString(),
    `flight ${status || 'delay'}`,
  ]);
  const shift = shiftRows[0]?.j;
  if (!shift?.ok) {
    const alert = `Flight ${flightLabel} delay conflict for ${b.reference}: could not move pick-up (${shift?.reason || 'unknown'}).`;
    await emailOffice(alert, b.reference);
    return { shifted: false, conflict: true, alert };
  }

  const prev = formatAthensHm(shift.previous_pickup_at || b.pickup_at);
  const next = formatAthensHm(shift.pickup_at || newPickup);
  const alert = `Flight ${flightLabel} delayed: pick-up moved ${prev} → ${next}, ${b.reference}`;
  await emailOffice(alert, b.reference);

  if (fs.emailCustomer && b.customer_email) {
    await sendEmail({
      to: b.customer_email,
      subject: `Pick-up time updated · ${b.reference}`,
      text: `Your pick-up time moved from ${prev} to ${next} (Athens) because of a flight delay. Reference ${b.reference}.`,
      html: `<p>Your pick-up time moved from <strong>${prev}</strong> to <strong>${next}</strong> (Athens) because of a flight delay.</p><p>Reference ${b.reference}.</p>`,
      tag: 'flight_shift',
      reference: b.reference,
    }).catch(() => undefined);
  }

  if (features().drivers) {
    try {
      const { internalDriverNotify } = await import('./driver-notify');
      await internalDriverNotify({ reference: b.reference, kind: 'changed' });
    } catch {
      /* optional */
    }
  }

  return { shifted: true, alert };
}

function formatAthensHm(iso: string | Date): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Athens',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

async function emailOffice(text: string, reference: string): Promise<void> {
  const to = process.env.OFFICE_EMAIL || process.env.BOOKING_OFFICE_EMAIL;
  if (!to) {
    console.error(JSON.stringify({ level: 'info', code: 'flight_office_alert', reference, text }));
    return;
  }
  await sendEmail({
    to,
    subject: text.slice(0, 120),
    text,
    html: `<p>${text.replace(/</g, '&lt;')}</p>`,
    tag: 'flight_office',
    reference,
  }).catch((e) => {
    console.error(
      JSON.stringify({
        level: 'error',
        code: 'flight_office_email_failed',
        detail: e instanceof Error ? e.message.slice(0, 120) : 'unknown',
      }),
    );
  });
}

/** Cron: poll active flight bookings in the next 24 h. */
export async function runFlightCron(now = new Date()): Promise<{
  checked: number;
  shifted: number;
  skipped: number;
  capped: boolean;
}> {
  if (!features().flightTracking) {
    return { checked: 0, shifted: 0, skipped: 0, capped: false };
  }
  const fs = await flightSettings();
  const used = await providerCallsToday();
  if (process.env.FLIGHT_PROVIDER !== 'manual' && used >= fs.dailyCallCap) {
    console.error(
      JSON.stringify({ level: 'info', code: 'flight_daily_cap', used, cap: fs.dailyCallCap }),
    );
    return { checked: 0, shifted: 0, skipped: 0, capped: true };
  }

  const { rows } = await bookingDb().query<{
    id: string;
    flight_number: string;
    flight_date: string | null;
    flight_status: string | null;
    flight_eta: Date | null;
    flight_sched_arr: Date | null;
    flight_checked_at: Date | null;
    pickup_at: Date;
  }>(
    `select id, flight_number, flight_date::text, flight_status, flight_eta, flight_sched_arr,
            flight_checked_at, pickup_at
       from public.bookings
      where flight_number is not null and trim(flight_number) <> ''
        and status not in ('cancelled', 'expired', 'completed')
        and pickup_at <= $1::timestamptz
        and pickup_at >= $2::timestamptz
      order by pickup_at asc
      limit 100`,
    [new Date(now.getTime() + 24 * 3600_000).toISOString(), now.toISOString()],
  );

  let checked = 0;
  let shifted = 0;
  let skipped = 0;
  const prov = provider();

  for (const row of rows) {
    const arrival = row.flight_eta || row.flight_sched_arr || row.pickup_at;
    const decision = shouldPollFlight({
      flightStatus: row.flight_status,
      arrivalAt: arrival,
      lastCheckedAt: row.flight_checked_at,
      now,
    });
    if (!decision.poll) {
      skipped += 1;
      continue;
    }
    if (process.env.FLIGHT_PROVIDER !== 'manual' && (await providerCallsToday()) >= fs.dailyCallCap) {
      return { checked, shifted, skipped, capped: true };
    }
    const date =
      row.flight_date ||
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' }).format(new Date(row.pickup_at));
    try {
      const result = await prov.lookup({ number: row.flight_number, date });
      checked += 1;
      const out = await applyFlightLookupToBooking(row.id, result, prov.name);
      if (out.shifted) shifted += 1;
    } catch (e) {
      skipped += 1;
      console.error(
        JSON.stringify({
          level: 'error',
          code: 'flight_poll_failed',
          bookingId: row.id,
          detail: e instanceof Error ? e.message.slice(0, 120) : 'unknown',
        }),
      );
    }
  }

  console.error(
    JSON.stringify({
      level: 'info',
      code: 'flight_cron',
      checked,
      shifted,
      skipped,
      providerCalls: await providerCallsToday(),
    }),
  );
  return { checked, shifted, skipped, capped: false };
}

export async function checkBookingFlightNow(bookingId: string): Promise<{
  result: FlightLookup;
  apply: { shifted: boolean; conflict?: boolean; alert?: string };
}> {
  if (!features().flightTracking) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'flight_tracking_off',
    });
  }
  const { rows } = await bookingDb().query<{
    flight_number: string | null;
    flight_date: string | null;
    pickup_at: Date;
  }>(
    `select flight_number, flight_date::text, pickup_at from public.bookings where id = $1::uuid`,
    [bookingId],
  );
  const b = rows[0];
  if (!b?.flight_number) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'no_flight_number',
    });
  }
  const date =
    b.flight_date ||
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' }).format(new Date(b.pickup_at));
  const result = await provider().lookup({ number: b.flight_number, date });
  const apply = await applyFlightLookupToBooking(bookingId, result, provider().name);
  return { result, apply };
}

export async function manualSetDelay(
  bookingId: string,
  newArrivalIso: string,
): Promise<{ shifted: boolean; conflict?: boolean; alert?: string }> {
  if (!features().flightTracking) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'flight_tracking_off',
    });
  }
  const fs = await flightSettings();
  const { rows } = await bookingDb().query<{
    reference: string;
    flight_origin: string | null;
    pickup_at: Date;
    customer_email: string;
  }>(
    `select reference, flight_origin, pickup_at, customer_email from public.bookings where id = $1::uuid`,
    [bookingId],
  );
  const b = rows[0];
  if (!b) return { shifted: false };
  const originCountry =
    b.flight_origin === 'SKG' || b.flight_origin === 'ATH' || b.flight_origin === 'GR' ? 'GR' : null;
  const buffer = pickupBufferMin(originCountry, {
    domestic: fs.bufferDomestic,
    international: fs.bufferInternational,
  });
  const eta = new Date(newArrivalIso).toISOString();
  const newPickup = suggestedPickupAt(eta, buffer);
  if (!newPickup) return { shifted: false };

  await bookingDb().query(
    `update public.bookings set
       flight_status = 'delayed',
       flight_eta = $2::timestamptz,
       flight_checked_at = now()
     where id = $1::uuid`,
    [bookingId, eta],
  );
  await bookingDb().query(
    `insert into public.flight_events (booking_id, status, eta, raw, source)
     values ($1::uuid, 'delayed', $2::timestamptz, $3::jsonb, 'manual')`,
    [bookingId, eta, JSON.stringify({ manualArrival: newArrivalIso })],
  );

  const { rows: shiftRows } = await bookingDb().query<{
    j: { ok: boolean; reason?: string; previous_pickup_at?: string; pickup_at?: string };
  }>(`select public.shift_pickup($1::uuid, $2::timestamptz, 'manual delay') as j`, [
    bookingId,
    newPickup.toISOString(),
  ]);
  const shift = shiftRows[0]?.j;
  if (!shift?.ok) {
    const alert = `Flight delay conflict for ${b.reference}: could not move pick-up (${shift?.reason || 'unknown'}).`;
    await emailOffice(alert, b.reference);
    return { shifted: false, conflict: true, alert };
  }
  const prev = formatAthensHm(shift.previous_pickup_at || b.pickup_at);
  const next = formatAthensHm(shift.pickup_at || newPickup);
  const { rows: numRows } = await bookingDb().query<{ flight_number: string | null }>(
    `select flight_number from public.bookings where id = $1::uuid`,
    [bookingId],
  );
  const flightLabel =
    normalizeFlightNumber(numRows[0]?.flight_number) || numRows[0]?.flight_number || 'flight';
  const alert = `Flight ${flightLabel} delayed: pick-up moved ${prev} → ${next}, ${b.reference}`;
  await emailOffice(alert, b.reference);
  if (features().drivers) {
    try {
      const { internalDriverNotify } = await import('./driver-notify');
      await internalDriverNotify({ reference: b.reference, kind: 'changed' });
    } catch {
      /* optional */
    }
  }
  return { shifted: true, alert };
}

/** After create: stamp flight_date + optional provider snapshot (never shifts pick-up). */
export async function stampFlightAtBooking(
  bookingId: string,
  flightNumber: string | null | undefined,
  pickupAt: Date | string,
): Promise<void> {
  if (!features().flightTracking || !flightNumber?.trim()) return;
  const number = normalizeFlightNumber(flightNumber);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' }).format(
    new Date(pickupAt),
  );
  await bookingDb().query(
    `update public.bookings set flight_number = $2, flight_date = $3::date where id = $1::uuid`,
    [bookingId, number, date],
  );
  try {
    const result = await provider().lookup({ number, date });
    if (!result.found) return;
    await bookingDb().query(
      `update public.bookings set
         flight_status = $2,
         flight_sched_arr = $3::timestamptz,
         flight_eta = $4::timestamptz,
         flight_terminal = $5,
         flight_origin = $6,
         flight_airline = $7,
         flight_checked_at = now()
       where id = $1::uuid`,
      [
        bookingId,
        result.status || 'unknown',
        result.schedArr,
        result.eta || result.schedArr,
        result.terminal,
        result.origin,
        result.airline,
      ],
    );
    await bookingDb().query(
      `insert into public.flight_events (booking_id, status, eta, raw, source)
       values ($1::uuid, $2, $3::timestamptz, $4::jsonb, $5)`,
      [
        bookingId,
        result.status || null,
        result.eta || result.schedArr,
        JSON.stringify(result.raw ?? {}),
        provider().name,
      ],
    );
  } catch (e) {
    console.error(
      JSON.stringify({
        level: 'error',
        code: 'flight_stamp_failed',
        bookingId,
        detail: e instanceof Error ? e.message.slice(0, 120) : 'unknown',
      }),
    );
  }
}
