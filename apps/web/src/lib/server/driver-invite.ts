import 'server-only';
import { z } from 'zod';
import { BookingError } from '../booking/types';
import { getSiteSettings, loadUiStrings } from '../sanity/content';
import { bookingDb } from './db';
import { sendEmail } from './email';
import { driverInviteEmail } from './email-templates';
import { getServiceClient } from './supabase';

const InviteBody = z.object({ driverId: z.string().uuid() }).strict();

function redirectTo(): string {
  const driverApp = (
    import.meta.env.DRIVER_APP_URL ||
    process.env.DRIVER_APP_URL ||
    ''
  ).trim();
  if (driverApp) return driverApp.replace(/\/$/, '');
  const admin = (
    import.meta.env.PUBLIC_ADMIN_URL ||
    process.env.PUBLIC_ADMIN_URL ||
    'http://localhost:4322'
  ).replace(/\/$/, '');
  return `${admin}/driver-welcome`;
}

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
  const to = redirectTo();

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
    const action = linkData?.properties?.action_link;
    if (!linkErr && action) {
      await sendMagicLink(email, driver.full_name, action);
    }
    return { status: 'linked' };
  }

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: to,
  });
  if (error || !data.user) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: error?.message || 'invite_failed',
    });
  }
  await bookingDb().query(`update public.drivers set user_id = $1::uuid where id = $2::uuid`, [
    data.user.id,
    driverId,
  ]);
  return { status: 'invited' };
}
