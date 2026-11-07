import 'server-only';
import { z } from 'zod';
import { BookingError } from '../booking/types';
import { getPublicEnv } from '../env';
import { bookingDb } from './db';
import { sendEmailResult } from './email';
import { inviteCompanyUser } from './corporate';

const InviteBody = z
  .object({
    companyId: z.string().uuid(),
    email: z.email(),
    role: z.enum(['admin', 'booker']),
  })
  .strict();

const SendBody = z.object({ statementId: z.string().uuid() }).strict();
const PaidBody = z
  .object({ statementId: z.string().uuid(), paidRef: z.string().trim().min(1).max(120) })
  .strict();

const bad = (message: string) =>
  new BookingError('invalid_request', { stringKey: 'error.invalid_request', message });

/** Staff invites a company user (internal route only; the corporate flag is checked by the route). */
export async function internalCompanyInvite(raw: unknown): Promise<{ userId: string }> {
  const parsed = InviteBody.safeParse(raw);
  if (!parsed.success) throw bad(parsed.error.message);
  const { rows } = await bookingDb().query<{ id: string }>(
    `select id::text from public.companies where id = $1::uuid`,
    [parsed.data.companyId],
  );
  if (!rows[0]) throw bad('unknown_company');
  const site = getPublicEnv().PUBLIC_SITE_URL.replace(/\/$/, '');
  return inviteCompanyUser({ ...parsed.data, redirectTo: `${site}/business/app` });
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const eur = (cents: number) => `€ ${(cents / 100).toFixed(2)}`;
const day = (d: Date | string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' }).format(new Date(d));

/** Email the statement to the company billing address and mark it sent. */
export async function internalCompanyStatementSend(
  raw: unknown,
): Promise<{ status: 'sent'; pdfPath: string }> {
  const parsed = SendBody.safeParse(raw);
  if (!parsed.success) throw bad(parsed.error.message);

  const { rows: st } = await bookingDb().query<{
    id: string;
    company_id: string;
    period_from: string;
    period_to: string;
    total_cents: number;
    status: string;
    name: string;
    billing_email: string | null;
    payment_terms_days: number;
  }>(
    `select s.id::text, s.company_id::text, s.period_from::text, s.period_to::text,
            s.total_cents, s.status, c.name, c.billing_email, c.payment_terms_days
       from public.company_statements s
       join public.companies c on c.id = s.company_id
      where s.id = $1::uuid`,
    [parsed.data.statementId],
  );
  const s = st[0];
  if (!s) throw bad('unknown_statement');
  if (s.status === 'paid') throw bad('already_paid');
  if (!s.billing_email) throw bad('no_billing_email');

  const { rows: lines } = await bookingDb().query<{
    reference: string;
    pickup_at: Date;
    guest_name: string | null;
    cost_center: string | null;
    price_cents: number;
  }>(
    `select reference, pickup_at, guest_name, cost_center, price_cents
       from public.bookings
      where company_id = $1::uuid
        and payment_method = 'on_account'
        and status not in ('cancelled', 'expired')
        and (pickup_at at time zone 'Europe/Athens')::date between $2::date and $3::date
      order by pickup_at`,
    [s.company_id, s.period_from, s.period_to],
  );

  const subject = `Statement ${s.period_from} to ${s.period_to} · Elite Protection`;
  const intro = `Statement for ${s.name}, ${s.period_from} to ${s.period_to}. Payment terms: ${s.payment_terms_days} days.`;
  const text = [
    intro,
    '',
    ...lines.map(
      (l) =>
        `${l.reference}  ${day(l.pickup_at)}  ${l.guest_name ?? '-'}  ${l.cost_center ?? '-'}  ${eur(l.price_cents)}`,
    ),
    '',
    `Total: ${eur(s.total_cents)}`,
  ].join('\n');
  const html = `<p>${esc(intro)}</p>
<table cellpadding="6" style="border-collapse:collapse">
<tr><th align="left">Reference</th><th align="left">Pick-up</th><th align="left">Guest</th><th align="left">Cost centre</th><th align="right">Amount</th></tr>
${lines
  .map(
    (l) =>
      `<tr><td>${esc(l.reference)}</td><td>${day(l.pickup_at)}</td><td>${esc(l.guest_name ?? '')}</td><td>${esc(l.cost_center ?? '')}</td><td align="right">${eur(l.price_cents)}</td></tr>`,
  )
  .join('\n')}
<tr><td colspan="4" align="right"><strong>Total</strong></td><td align="right"><strong>${eur(s.total_cents)}</strong></td></tr>
</table>`;

  const sent = await sendEmailResult({
    to: s.billing_email,
    subject,
    html,
    text,
    tag: 'company_statement',
  });
  if (!sent.ok) throw bad('email_failed');

  const pdfPath = `/companies/${s.company_id}/statements/${s.id}/export.csv`;
  await bookingDb().query(
    `update public.company_statements
        set status = 'sent', sent_at = now(), pdf_path = $2
      where id = $1::uuid and status in ('draft', 'sent')`,
    [s.id, pdfPath],
  );
  return { status: 'sent', pdfPath };
}

/**
 * Mark a statement paid and settle its on-account bookings (one `payments` row each, so open
 * balance and refunds stay correct). One SQL statement, so it is atomic; repeating it changes nothing.
 */
export async function internalCompanyStatementPaid(
  raw: unknown,
  staffUserId: string,
): Promise<{ status: 'paid'; settled: number }> {
  const parsed = PaidBody.safeParse(raw);
  if (!parsed.success) throw bad(parsed.error.message);
  const { statementId, paidRef } = parsed.data;
  const { rows } = await bookingDb().query<{ statements: number; settled: number }>(
    `with st as (
       update public.company_statements
          set status = 'paid', paid_ref = $2, paid_at = now()
        where id = $1::uuid and status in ('draft', 'sent')
        returning company_id, period_from, period_to
     ), due as (
       select b.id, b.price_cents
         from public.bookings b
         join st on st.company_id = b.company_id
        where b.payment_method = 'on_account'
          and b.payment_status = 'unpaid'
          and b.status not in ('cancelled', 'expired')
          and (b.pickup_at at time zone 'Europe/Athens')::date between st.period_from and st.period_to
     ), pay as (
       insert into public.payments (
         booking_id, kind, status, amount_cents, method, note, created_by, idempotency_key
       )
       select id, 'payment', 'succeeded', price_cents, 'on_account', $3, $4::uuid,
              'statement:' || $1::text || ':' || id::text
         from due
       on conflict (idempotency_key) do nothing
       returning booking_id
     ), upd as (
       update public.bookings b set payment_status = 'paid'
         from due where b.id = due.id
       returning b.id
     )
     select (select count(*) from st)::int as statements, (select count(*) from upd)::int as settled`,
    [statementId, paidRef, `Statement ${paidRef}`, staffUserId],
  );
  if (!rows[0] || rows[0].statements === 0) throw bad('not_open');
  return { status: 'paid', settled: rows[0].settled };
}
