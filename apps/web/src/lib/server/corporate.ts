import 'server-only';
import { features, notFoundUnless } from '@tem/features';
import { z } from 'zod';
import { BookingError } from '../booking/types';
import { bookingDb } from './db';
import { fireOnCancelled } from './hooks';
import { fail } from './http';
import { getPaymentProvider } from './payments';
import { getSettings } from './settings';
import { getServiceClient } from './supabase';

export function corporateOff(): Response | null {
  return notFoundUnless(features().corporate);
}

export type CompanyMember = {
  companyId: string;
  userId: string;
  email: string;
  role: 'admin' | 'booker';
  companyName: string;
  payOnAccount: boolean;
  creditLimitCents: number | null;
  discountPct: number;
};

export async function loadCompanyMember(userId: string): Promise<CompanyMember | null> {
  const { rows } = await bookingDb().query<{
    company_id: string;
    user_id: string;
    email: string;
    role: 'admin' | 'booker';
    company_name: string;
    pay_on_account: boolean;
    credit_limit_cents: number | null;
    discount_pct: string;
  }>(
    `select cu.company_id, cu.user_id::text, cu.email, cu.role,
            c.name as company_name, c.pay_on_account, c.credit_limit_cents, c.discount_pct::text
       from public.company_users cu
       join public.companies c on c.id = cu.company_id
      where cu.user_id = $1::uuid and cu.active and c.active`,
    [userId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    companyId: r.company_id,
    userId: r.user_id,
    email: r.email,
    role: r.role,
    companyName: r.company_name,
    payOnAccount: r.pay_on_account,
    creditLimitCents: r.credit_limit_cents,
    discountPct: Number(r.discount_pct) || 0,
  };
}

/** Resolve Bearer access token → company member (or null). */
export async function memberFromRequest(request: Request): Promise<CompanyMember | null> {
  const auth = request.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) return null;
  const supabase = getServiceClient();
  const { data, error } = await supabase.auth.getUser(m[1]!);
  if (error || !data.user) return null;
  return loadCompanyMember(data.user.id);
}

export async function requireMember(request: Request): Promise<CompanyMember> {
  const member = await memberFromRequest(request);
  if (!member) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'unauthorized',
    });
  }
  return member;
}

export async function loadCompanyPriceMap(input: {
  companyId: string;
  bookingType: 'transfer' | 'hourly';
  fromZoneId?: string | null;
  toZoneId?: string | null;
}): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (input.bookingType === 'hourly') {
    const { rows } = await bookingDb().query<{ key: string; price_cents: number }>(
      `select vc.key, cp.price_cents
         from public.company_prices cp
         join public.vehicle_classes vc on vc.id = cp.class_id
        where cp.company_id = $1::uuid and cp.booking_type = 'hourly'`,
      [input.companyId],
    );
    for (const r of rows) out[r.key] = r.price_cents;
    return out;
  }
  if (!input.fromZoneId || !input.toZoneId) return out;
  const { rows } = await bookingDb().query<{ key: string; price_cents: number }>(
    `select vc.key, cp.price_cents
       from public.company_prices cp
       join public.vehicle_classes vc on vc.id = cp.class_id
      where cp.company_id = $1::uuid and cp.booking_type = 'transfer'
        and cp.from_zone_id = $2::uuid and cp.to_zone_id = $3::uuid`,
    [input.companyId, input.fromZoneId, input.toZoneId],
  );
  for (const r of rows) out[r.key] = r.price_cents;
  return out;
}

export async function assertOnAccountAllowed(
  member: Pick<CompanyMember, 'companyId' | 'payOnAccount' | 'creditLimitCents'>,
  addCents: number,
): Promise<void> {
  if (!member.payOnAccount) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'on_account_not_allowed',
    });
  }
  if (member.creditLimitCents == null) return;
  const { rows } = await bookingDb().query<{ n: number }>(
    `select public.company_open_balance_cents($1::uuid) as n`,
    [member.companyId],
  );
  const open = rows[0]?.n ?? 0;
  if (open + addCents > member.creditLimitCents) {
    throw new BookingError('unavailable', {
      stringKey: 'error.unavailable',
      message: 'credit_limit',
    });
  }
}

/** Confirm a pending booking on account (no Viva). */
export async function confirmOnAccount(input: {
  bookingId: string;
  companyId: string;
  bookedBy: string;
  guestName: string;
  guestPhone?: string | null;
  costCenter?: string | null;
  customerEmail: string;
  customerName: string;
}): Promise<{ reference: string }> {
  const { rows } = await bookingDb().query<{
    id: string;
    reference: string;
    price_cents: number;
    status: string;
  }>(
    `select id, reference, price_cents, status::text from public.bookings where id = $1::uuid for update`,
    [input.bookingId],
  );
  const b = rows[0];
  if (!b || b.status !== 'pending') {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'bad_booking',
    });
  }

  await bookingDb().query(
    `update public.bookings set
       company_id = $2::uuid,
       booked_by = $3::uuid,
       guest_name = $4,
       guest_phone = $5,
       cost_center = $6,
       customer_name = coalesce(nullif($7, ''), customer_name),
       customer_email = coalesce(nullif($8, ''), customer_email),
       payment_method = 'on_account',
       payment_status = 'unpaid',
       status = 'confirmed',
       hold_expires_at = null
     where id = $1::uuid`,
    [
      input.bookingId,
      input.companyId,
      input.bookedBy,
      input.guestName,
      input.guestPhone ?? null,
      input.costCenter ?? null,
      input.customerName,
      input.customerEmail,
    ],
  );

  await bookingDb().query(
    `update public.slot_holds set status = 'converted' where booking_id = $1::uuid and status = 'active'`,
    [input.bookingId],
  );

  return { reference: b.reference };
}

export async function sendCorporateMagicLink(email: string, redirectTo: string): Promise<void> {
  const supabase = getServiceClient();
  const normalized = email.trim().toLowerCase();
  const { rows } = await bookingDb().query<{ id: string }>(
    `select cu.id from public.company_users cu
       join public.companies c on c.id = cu.company_id
      where lower(cu.email) = $1 and cu.active and c.active`,
    [normalized],
  );
  if (!rows[0]) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'unknown_business_user',
    });
  }
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: normalized,
    options: { redirectTo },
  });
  if (error) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: error.message.slice(0, 120),
    });
  }
  const action = data.properties?.action_link;
  if (!action) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'magic_link_failed',
    });
  }
  // Email via existing sendEmail when OFFICE configured; always log action for demos.
  const { sendEmail } = await import('./email');
  await sendEmail({
    to: normalized,
    subject: 'Business login · Elite Protection',
    text: `Sign in: ${action}`,
    html: `<p><a href="${action}">Sign in to your business account</a></p>`,
    tag: 'corporate_magic',
  }).catch(() => undefined);
}

export async function inviteCompanyUser(input: {
  companyId: string;
  email: string;
  role: 'admin' | 'booker';
  redirectTo: string;
}): Promise<{ userId: string }> {
  const email = input.email.trim().toLowerCase();
  const supabase = getServiceClient();
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: input.redirectTo,
  });
  // Existing auth users: invite may fail; fall back to generateLink + lookup via company_users insert needing user id.
  let userId = data?.user?.id ?? null;
  if (!userId) {
    const { data: linkData } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: input.redirectTo },
    });
    userId = linkData?.user?.id ?? null;
  }
  if (!userId) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: error?.message || 'invite_failed',
    });
  }
  await bookingDb().query(
    `insert into public.company_users (company_id, user_id, email, role)
     values ($1::uuid, $2::uuid, $3, $4)
     on conflict (company_id, email) do update set
       user_id = excluded.user_id, role = excluded.role, active = true`,
    [input.companyId, userId, email, input.role],
  );
  return { userId };
}

// ---------------------------------------------------------------------------
// Member-facing helpers for /business/app (bookings, statements, users)
// ---------------------------------------------------------------------------

const bad = (message: string) =>
  new BookingError('invalid_request', { stringKey: 'error.invalid_request', message });

export function requireAdmin(member: CompanyMember): void {
  if (member.role !== 'admin') throw bad('forbidden');
}

/** Error response for member routes: 401 without a valid session, 403 for admin-only actions. */
export function failMember(e: unknown): Response {
  if (e instanceof BookingError && e.message === 'unauthorized') return fail(e, 401);
  if (e instanceof BookingError && e.message === 'forbidden') return fail(e, 403);
  return fail(e);
}

/** Body shared by book-on-account and book-card. No price field exists: the server prices from the signed quote. */
export const CorporateBookBody = z
  .object({
    quoteId: z.uuid(),
    signature: z.string().min(16),
    classKey: z.string().min(1),
    guestName: z.string().trim().min(1).max(200),
    guestPhone: z.string().trim().max(40).optional(),
    costCenter: z.string().trim().max(80).optional(),
    flightNumber: z.string().trim().max(40).optional(),
    notes: z.string().trim().max(2000).optional(),
    pickupAddress: z.string().min(1),
    dropoffAddress: z.string().optional(),
    passengers: z.number().int().positive(),
    luggage: z.number().int().nonnegative(),
    extras: z
      .array(
        z.union([
          z.string().min(1),
          z.object({
            code: z.string().min(1),
            quantity: z.number().int().min(1).max(10).optional(),
          }),
        ]),
      )
      .optional(),
  })
  .strict();

export type CorporateBookBody = z.infer<typeof CorporateBookBody>;

/** Map a validated corporate body to the signed-quote checkout request (member email is the contact). */
export function toQuoteCheckout(body: CorporateBookBody, member: CompanyMember) {
  return {
    quoteId: body.quoteId,
    signature: body.signature,
    classKey: body.classKey,
    pickupAddress: body.pickupAddress,
    dropoffAddress: body.dropoffAddress || undefined,
    passengers: body.passengers,
    luggage: body.luggage,
    flightNumber: body.flightNumber || undefined,
    notes: body.notes || undefined,
    extras: body.extras ?? [],
    customer: { name: body.guestName, email: member.email, phone: body.guestPhone || '+30' },
    consent: true as const,
  };
}

/** Tag a card-path booking (still pending, paid through Viva) with the company and guest. */
export async function tagCompanyBooking(
  bookingId: string,
  member: CompanyMember,
  body: Pick<CorporateBookBody, 'guestName' | 'guestPhone' | 'costCenter'>,
): Promise<void> {
  await bookingDb().query(
    `update public.bookings set company_id = $2::uuid, booked_by = $3::uuid,
            guest_name = $4, guest_phone = $5, cost_center = $6
      where id = $1::uuid or trip_group_id = (select trip_group_id from public.bookings where id = $1::uuid)`,
    [
      bookingId,
      member.companyId,
      member.userId,
      body.guestName,
      body.guestPhone ?? null,
      body.costCenter ?? null,
    ],
  );
}

export type CompanyBookingRow = {
  reference: string;
  status: string;
  bookingType: 'transfer' | 'hourly';
  pickupAt: string;
  route: string;
  guestName: string | null;
  costCenter: string | null;
  priceCents: number;
  paymentMethod: string | null;
  paymentStatus: string;
  cancellable: boolean;
};

export async function listCompanyBookings(
  member: CompanyMember,
  opts: { q?: string; when?: 'upcoming' | 'past' | 'all' },
): Promise<CompanyBookingRow[]> {
  const settings = await getSettings();
  const q = (opts.q ?? '').trim().slice(0, 80);
  const { rows } = await bookingDb().query<{
    reference: string;
    status: string;
    booking_type: 'transfer' | 'hourly';
    pickup_at: Date;
    from_name: string | null;
    to_name: string | null;
    hours: number | null;
    guest_name: string | null;
    cost_center: string | null;
    price_cents: number;
    payment_method: string | null;
    payment_status: string;
  }>(
    `select b.reference, b.status::text, b.booking_type::text, b.pickup_at, b.hours,
            zf.name as from_name, zt.name as to_name, b.guest_name, b.cost_center,
            b.price_cents, b.payment_method::text, b.payment_status::text
       from public.bookings b
       left join public.zones zf on zf.id = b.from_zone_id
       left join public.zones zt on zt.id = b.to_zone_id
      where b.company_id = $1::uuid
        and b.status not in ('pending', 'expired')
        and ($2::text = '' or b.reference ilike '%' || $2::text || '%'
             or b.guest_name ilike '%' || $2::text || '%'
             or b.cost_center ilike '%' || $2::text || '%')
        and ($3::text = 'all' or ($3::text = 'upcoming' and b.pickup_at >= now())
             or ($3::text = 'past' and b.pickup_at < now()))
      order by (case when $3::text = 'upcoming' then b.pickup_at end) asc nulls last,
               b.pickup_at desc
      limit 200`,
    [member.companyId, q.replace(/[%_\\]/g, ''), opts.when ?? 'upcoming'],
  );
  const now = Date.now();
  return rows.map((r) => ({
    reference: r.reference,
    status: r.status,
    bookingType: r.booking_type,
    pickupAt: new Date(r.pickup_at).toISOString(),
    route:
      r.booking_type === 'hourly'
        ? `${r.from_name ?? '-'} · ${r.hours ?? '-'} h`
        : `${r.from_name ?? '-'} → ${r.to_name ?? '-'}`,
    guestName: r.guest_name,
    costCenter: r.cost_center,
    priceCents: r.price_cents,
    paymentMethod: r.payment_method,
    paymentStatus: r.payment_status,
    cancellable:
      (r.status === 'confirmed' || r.status === 'assigned') &&
      new Date(r.pickup_at).getTime() - settings.cancelWindowHours * 3600_000 > now,
  }));
}

/** Cancel a company booking by reference with the same window and refund rules as the cancel link. */
export async function cancelCompanyBooking(member: CompanyMember, reference: string) {
  const { rows } = await bookingDb().query<{
    id: string;
    pickup_at: Date;
    price_cents: number;
    payment_status: string;
    status: string;
  }>(
    `select id, pickup_at, price_cents, payment_status::text, status::text
       from public.bookings where reference = $1 and company_id = $2::uuid`,
    [reference, member.companyId],
  );
  const b = rows[0];
  if (!b) throw bad('unknown_booking');
  if (b.status !== 'confirmed' && b.status !== 'assigned') throw bad('not_cancellable');
  const settings = await getSettings();
  if (Date.now() > new Date(b.pickup_at).getTime() - settings.cancelWindowHours * 3600_000) {
    throw new BookingError('invalid_request', {
      stringKey: 'booking.cancel.tooLate',
      message: 'booking.cancel.tooLate',
    });
  }

  let refundCents = 0;
  if (b.payment_status === 'paid' || b.payment_status === 'partially_refunded') {
    refundCents = b.price_cents;
    const { rows: pay } = await bookingDb().query<{ viva_transaction_id: string }>(
      `select viva_transaction_id::text from public.payments
        where booking_id = $1::uuid and kind = 'payment' and status = 'succeeded'
          and viva_transaction_id is not null
        order by created_at asc limit 1`,
      [b.id],
    );
    const txId = pay[0]?.viva_transaction_id;
    if (txId) await getPaymentProvider().refund({ transactionId: txId, amountCents: refundCents });
  }
  await bookingDb().query(
    `update public.bookings
        set status = 'cancelled', cancelled_at = now(), cancel_token_hash = null,
            payment_status = case when payment_status in ('paid', 'partially_refunded')
              then 'refunded'::public.payment_status else payment_status end
      where id = $1::uuid`,
    [b.id],
  );
  await fireOnCancelled(reference, refundCents);
  return { reference, status: 'cancelled' as const, refundCents };
}

export async function listCompanyStatements(member: CompanyMember) {
  const { rows } = await bookingDb().query<{
    id: string;
    period_from: string;
    period_to: string;
    total_cents: number;
    status: string;
  }>(
    `select id::text, period_from::text, period_to::text, total_cents, status
       from public.company_statements
      where company_id = $1::uuid and status in ('sent', 'paid')
      order by period_from desc limit 60`,
    [member.companyId],
  );
  return rows.map((r) => ({
    id: r.id,
    periodFrom: r.period_from,
    periodTo: r.period_to,
    totalCents: r.total_cents,
    status: r.status,
  }));
}

const csvCell = (v: string | number | null) => {
  let s = String(v ?? '');
  // Neutralise spreadsheet formulas in guest-supplied text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

/** CSV of the on-account bookings in a statement period (null when the statement is not this company's). */
export async function companyStatementCsv(member: CompanyMember, statementId: string) {
  const { rows: st } = await bookingDb().query<{ period_from: string; period_to: string }>(
    `select period_from::text, period_to::text from public.company_statements
      where id = $1::uuid and company_id = $2::uuid and status in ('sent', 'paid')`,
    [statementId, member.companyId],
  );
  const s = st[0];
  if (!s) return null;
  const { rows } = await bookingDb().query<{
    reference: string;
    pickup_at: Date;
    guest_name: string | null;
    cost_center: string | null;
    price_cents: number;
  }>(
    `select reference, pickup_at, guest_name, cost_center, price_cents
       from public.bookings
      where company_id = $1::uuid and payment_method = 'on_account'
        and status not in ('cancelled', 'expired')
        and (pickup_at at time zone 'Europe/Athens')::date between $2::date and $3::date
      order by pickup_at`,
    [member.companyId, s.period_from, s.period_to],
  );
  const head = ['Reference', 'Pick-up (Europe/Athens)', 'Guest', 'Cost centre', 'Amount (EUR)'];
  const lines = rows.map((r) =>
    [
      r.reference,
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Athens',
        dateStyle: 'short',
        timeStyle: 'short',
        hour12: false,
      }).format(new Date(r.pickup_at)),
      r.guest_name,
      r.cost_center,
      (r.price_cents / 100).toFixed(2),
    ]
      .map(csvCell)
      .join(','),
  );
  return {
    name: `statement-${s.period_from}-${s.period_to}.csv`,
    csv: [head.map(csvCell).join(','), ...lines].join('\r\n') + '\r\n',
  };
}

export async function listCompanyUsers(member: CompanyMember) {
  const { rows } = await bookingDb().query<{
    id: string;
    email: string;
    role: 'admin' | 'booker';
    active: boolean;
  }>(
    `select id::text, email, role, active from public.company_users
      where company_id = $1::uuid order by email`,
    [member.companyId],
  );
  return rows;
}

/** Deactivate or reactivate a user of the member's own company (never the caller). */
export async function setCompanyUserActive(
  member: CompanyMember,
  userRowId: string,
  active: boolean,
) {
  const { rows } = await bookingDb().query<{ id: string }>(
    `update public.company_users set active = $3
      where id = $1::uuid and company_id = $2::uuid and user_id <> $4::uuid
      returning id`,
    [userRowId, member.companyId, active, member.userId],
  );
  if (!rows[0]) throw bad('unknown_user');
}
