import 'server-only';
import { z } from 'zod';
import { BookingError } from '../booking/types';
import { getSiteSettings, loadUiStrings } from '../sanity/content';
import { bookingDb } from './db';
import { sendEmail } from './email';
import { driverPasswordResetEmail } from './email-templates';
import { assertRateLimit } from './rate-limit';
import { getServiceClient } from './supabase';

const Body = z.object({ email: z.string().trim().email().max(320) }).strict();

/** Same callback target as invites — always the drivers PWA, never Site URL. */
export function driverAuthCallbackUrl(): string {
  const driverApp = (
    import.meta.env.DRIVER_APP_URL ||
    process.env.DRIVER_APP_URL ||
    ''
  ).trim();
  if (driverApp) {
    const base = driverApp.replace(/\/$/, '');
    return base.endsWith('/auth/callback') ? base : `${base}/auth/callback`;
  }
  const admin = (
    import.meta.env.PUBLIC_ADMIN_URL ||
    process.env.PUBLIC_ADMIN_URL ||
    'http://localhost:4322'
  ).replace(/\/$/, '');
  return `${admin}/driver-welcome`;
}

/**
 * Send a password-reset email that opens on the drivers app.
 * Always returns ok (no email enumeration). Rate-limited per IP + email.
 */
export async function requestDriverPasswordReset(
  raw: unknown,
  opts: { ip: string },
): Promise<{ ok: true }> {
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'invalid_email',
    });
  }
  const email = parsed.data.email.toLowerCase();

  await assertRateLimit(`driver-pwreset:ip:${opts.ip || 'unknown'}`, 3600, 5);
  await assertRateLimit(`driver-pwreset:email:${email}`, 3600, 3);

  const { rows } = await bookingDb().query<{
    full_name: string;
    user_id: string | null;
  }>(
    `select full_name, user_id::text
       from public.drivers
      where lower(email) = $1
      limit 1`,
    [email],
  );
  const driver = rows[0];
  if (!driver?.user_id) {
    return { ok: true };
  }

  const callback = driverAuthCallbackUrl();
  const supabase = getServiceClient();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: callback },
  });
  if (error || !data?.properties?.hashed_token) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: error?.message || 'reset_link_failed',
    });
  }

  // Direct app link with token_hash — avoids Supabase Site URL fallback (www / apex).
  const link = `${callback}?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery`;

  await loadUiStrings();
  const site = await getSiteSettings();
  const parts = driverPasswordResetEmail({
    name: driver.full_name,
    link,
    companyName: site.companyName,
    companyPhone: site.phone,
    companyEmail: site.email,
  });
  await sendEmail({
    to: email,
    subject: parts.subject,
    html: parts.html,
    text: parts.text,
    tag: 'driver_password_reset',
  });

  return { ok: true };
}
