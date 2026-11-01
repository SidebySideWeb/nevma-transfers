import 'server-only';
import { quoteHourly, quoteTransfer } from '../booking/pricing';
import { BookingError } from '../booking/types';
import { bookingDb, type BookingDb } from './db';

export type TripClassRow = {
  id: string;
  key: string;
  name: string;
  max_passengers: number;
  max_luggage: number;
  buffer_minutes: number;
  rate_cents: number | null;
  min_hours: number | null;
  max_hours: number | null;
};

export type TripQuote = {
  classRow: TripClassRow;
  fromId: string;
  toId: string | null;
  durationMinutes: number;
  hours: number | null;
  baseCents: number;
};

function db(): BookingDb {
  return bookingDb();
}

export async function zoneByCode(code: string): Promise<{ id: string; code: string; name: string }> {
  const { rows } = await db().query<{ id: string; code: string; name: string }>(
    `select id, code, name from public.zones where code = $1 and active`,
    [code],
  );
  if (!rows[0]) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: `unknown zone ${code}`,
      field: code.includes('from') ? 'fromZone' : 'toZone',
    });
  }
  return rows[0];
}

export async function routeDuration(fromId: string, toId: string): Promise<number> {
  const { rows } = await db().query<{ duration_minutes: number }>(
    `select duration_minutes from public.zone_routes where from_zone_id = $1 and to_zone_id = $2`,
    [fromId, toId],
  );
  if (!rows[0]) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'unknown route',
    });
  }
  return rows[0].duration_minutes;
}

export async function loadActiveClass(classKey: string): Promise<TripClassRow> {
  const classRow = (
    await db().query<TripClassRow>(
      `select c.id, c.key, c.name, c.max_passengers, c.max_luggage, c.buffer_minutes,
              h.price_per_hour_cents as rate_cents, h.min_hours, h.max_hours
         from public.vehicle_classes c
         left join public.hourly_rates h on h.class_id = c.id
        where c.key = $1 and c.active`,
      [classKey],
    )
  ).rows[0];
  if (!classRow) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'unknown class',
      field: 'classKey',
    });
  }
  return classRow;
}

export function assertClassCapacity(
  classRow: TripClassRow,
  passengers: number,
  luggage: number,
): void {
  if (classRow.max_passengers < passengers || classRow.max_luggage < luggage) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'class too small',
      field: 'classKey',
    });
  }
}

/** Server-side trip price + duration (shared by online holds and office bookings). */
export async function quoteTrip(input: {
  type: 'transfer' | 'hourly';
  classKey: string;
  fromZone: string;
  toZone?: string;
  hours?: number;
  passengers: number;
  luggage: number;
}): Promise<TripQuote> {
  const classRow = await loadActiveClass(input.classKey);
  assertClassCapacity(classRow, input.passengers, input.luggage);
  const from = await zoneByCode(input.fromZone);

  if (input.type === 'transfer') {
    if (!input.toZone) {
      throw new BookingError('invalid_request', {
        stringKey: 'error.invalid_request',
        message: 'toZone required',
        field: 'toZone',
      });
    }
    if (input.fromZone === input.toZone) {
      throw new BookingError('invalid_request', {
        stringKey: 'error.invalid_request',
        message: 'from and to must differ',
        field: 'toZone',
      });
    }
    const to = await zoneByCode(input.toZone);
    const durationMinutes = await routeDuration(from.id, to.id);
    const { rows: prices } = await db().query<{ price_cents: number }>(
      `select price_cents from public.zone_prices
        where from_zone_id = $1 and to_zone_id = $2 and class_id = $3`,
      [from.id, to.id, classRow.id],
    );
    if (!prices[0]) {
      throw new BookingError('no_price', { stringKey: 'error.no_price', message: 'no_price' });
    }
    return {
      classRow,
      fromId: from.id,
      toId: to.id,
      durationMinutes,
      hours: null,
      baseCents: quoteTransfer({ zonePriceCents: prices[0].price_cents }),
    };
  }

  const hours = input.hours;
  if (hours == null) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'hours required',
      field: 'hours',
    });
  }
  if (classRow.rate_cents == null || classRow.min_hours == null || classRow.max_hours == null) {
    throw new BookingError('no_price', { stringKey: 'error.no_price', message: 'no_price' });
  }
  return {
    classRow,
    fromId: from.id,
    toId: null,
    durationMinutes: hours * 60,
    hours,
    baseCents: quoteHourly({
      rateCents: classRow.rate_cents,
      minHours: classRow.min_hours,
      maxHours: classRow.max_hours,
      hours,
    }),
  };
}

export async function sumExtras(codes: string[]): Promise<{
  totalCents: number;
  lines: { code: string; label: string; cents: number; id: string }[];
  vipSecurity: boolean;
}> {
  const unique = [...new Set(codes.filter(Boolean))];
  if (!unique.length) return { totalCents: 0, lines: [], vipSecurity: false };
  const { rows } = await db().query<{
    id: string;
    code: string;
    name: string;
    price_cents: number;
  }>(
    `select id, code, name, price_cents from public.extras where code = any($1::text[]) and active`,
    [unique],
  );
  if (rows.length !== unique.length) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'unknown or inactive extra',
      field: 'extras',
    });
  }
  return {
    totalCents: rows.reduce((s, r) => s + r.price_cents, 0),
    lines: rows.map((r) => ({ code: r.code, label: r.name, cents: r.price_cents, id: r.id })),
    vipSecurity: rows.some((r) => r.code === 'vip-security'),
  };
}
