import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { BookingError } from '../booking/types';
import { sendManageLinkEmail } from './booking-emails';
import { hashCancelToken, requireTurnstile } from './booking-service';
import { bookingDb } from './db';
import { assertRateLimit } from './rate-limit';
import { rejectMoneyFields } from '../booking/validation';

const REFERENCE_RE = /^(EP|TEM)-[A-HJ-NP-Z2-9]{6}$/;

const LookupRequest = z.object({
  reference: z
    .string()
    .trim()
    .toUpperCase()
    .regex(REFERENCE_RE, 'invalid_request'),
  email: z.string().trim().email().max(254),
  turnstileToken: z.string().min(1).optional(),
  // Form posts may use cf-turnstile-response
  'cf-turnstile-response': z.string().min(1).optional(),
});

function siteUrl(): string {
  return (
    import.meta.env.PUBLIC_SITE_URL ||
    process.env.PUBLIC_SITE_URL ||
    'http://localhost:4321'
  ).replace(/\/$/, '');
}

/**
 * AC-35: always `{ ok: true }` with equal work whether or not a booking matched.
 * Match → rotate cancel_token_hash and email manage link.
 */
export async function lookupBooking(raw: unknown, ip?: string): Promise<{ ok: true }> {
  rejectMoneyFields(raw);
  const parsed = LookupRequest.safeParse(raw);
  if (!parsed.success) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: parsed.error.message,
    });
  }
  const body = parsed.data;
  const turnstile = body.turnstileToken || body['cf-turnstile-response'];
  await requireTurnstile(turnstile, ip);

  if (ip) {
    await assertRateLimit(`lookup-ip:${ip}`, 3600, 5);
  }
  await assertRateLimit(`lookup-ref:${body.reference}`, 3600, 3);

  // Equal crypto work on every request.
  const token = randomBytes(32).toString('base64url');
  const hash = hashCancelToken(token);

  const { rows } = await bookingDb().query<{
    id: string;
    reference: string;
    customer_email: string;
    status: string;
  }>(
    `select id, reference, customer_email, status
       from public.bookings
      where upper(reference) = $1
        and lower(customer_email) = lower($2)
        and status in ('confirmed', 'assigned')
      limit 1`,
    [body.reference, body.email],
  );

  const match = rows[0];
  if (match) {
    await bookingDb().query(
      `update public.bookings set cancel_token_hash = $1 where id = $2::uuid`,
      [hash, match.id],
    );
    const manageUrl = `${siteUrl()}/booking/manage/${token}`;
    await sendManageLinkEmail({
      to: match.customer_email,
      reference: match.reference,
      manageUrl,
    });
  } else {
    // Equal DB work when nothing matches (dummy hash lookup).
    await bookingDb().query(
      `select 1 as n from public.bookings where cancel_token_hash = $1 limit 1`,
      [hash],
    );
    // Touch the hash so timing is closer (avoid unused variable elision).
    void createHash('sha256').update(hash).digest('hex');
  }

  return { ok: true };
}

export { REFERENCE_RE };
