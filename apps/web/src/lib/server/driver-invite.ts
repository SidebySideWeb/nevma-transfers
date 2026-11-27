import 'server-only';
import { z } from 'zod';
import { BookingError } from '../booking/types';
import { getSiteSettings, loadUiStrings } from '../sanity/content';
import { bookingDb } from './db';
import { sendEmail } from './email';
import { driverAuthCallbackUrl } from './driver-password-reset';
import { driverInviteEmail } from './email-templates';
import { getServiceClient } from './supabase';

const InviteBody = z.object({ driverId: z.string().uuid() }).strict();

export type InviteResult = { status: 'invited' | 'linked' };

async function sendMagicLink(email: string, name: string, link: string): Promise<void> {
  await loadUiStrings();
  const site = await getSiteSettings();
  const parts = driverInviteEmail({
    name,
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
    tag: 'driver_invite',
  });
}

/** Invite or link a driver Auth user. Never links a staff e-mail (409). */
export async function internalDriverInvite(raw: unknown): Promise<InviteResult> {
  const parsed = InviteBody.safeParse(raw);
  if (!parsed.success) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: parsed.error.message,
    });
  }
  const { driverId } = parsed.data;

  const { rows: drivers } = await bookingDb().query<{
    id: string;
    email: string;
    full_name: string;
    user_id: string | null;
  }>(
    `select id::text, email, full_name, user_id::text from public.drivers where id = $1::uuid`,
    [driverId],
  );
  const driver = drivers[0];
  if (!driver) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'unknown_driver',
    });
  }

  const email = driver.email.trim().toLowerCase();
  const { rows: staffRows } = await bookingDb().query<{ user_id: string }>(
    `select user_id::text from public.staff where lower(email) = $1`,
    [email],
  );
  if (staffRows[0]) {
    throw new BookingError('unavailable', {
      stringKey: 'error.unavailable',
      message: 'staff_email',
    });
  }

  const { rows: existing } = await bookingDb().query<{ id: string }>(
    `select id::text from auth.users where lower(email) = $1 limit 1`,
    [email],
  );

  const supabase = getServiceClient();
  const to = driverAuthCallbackUrl();

  if (existing[0]) {
    const userId = existing[0].id;
    const { rows: staffById } = await bookingDb().query<{ user_id: string }>(
      `select user_id::text from public.staff where user_id = $1::uuid`,
      [userId],
    );
    if (staffById[0]) {
      throw new BookingError('unavailable', {
        stringKey: 'error.unavailable',
        message: 'staff_email',
      });
    }
    await bookingDb().query(`update public.drivers set user_id = $1::uuid where id = $2::uuid`, [
      userId,
      driverId,
    ]);
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: to },
    });
    const token = linkData?.properties?.hashed_token;
    if (!linkErr && token) {
      // Direct drivers-app link — avoids Supabase Site URL (www / apex).
      await sendMagicLink(
        email,
        driver.full_name,
        `${to}?token_hash=${encodeURIComponent(token)}&type=magiclink`,
      );
    }
    return { status: 'linked' };
  }

  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: to },
  });
  if (error || !data?.user || !data.properties?.hashed_token) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: error?.message || 'invite_failed',
    });
  }
  await bookingDb().query(`update public.drivers set user_id = $1::uuid where id = $2::uuid`, [
    data.user.id,
    driverId,
  ]);
  await sendMagicLink(
    email,
    driver.full_name,
    `${to}?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=invite`,
  );
  return { status: 'invited' };
}
