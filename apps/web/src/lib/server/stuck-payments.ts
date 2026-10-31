import 'server-only';
import { getSiteSettings } from '../sanity/content';
import { bookingDb } from './db';
import { sendEmail } from './email';

export type StuckBooking = {
  reference: string;
  pickup_at: string;
  customer_email: string;
};

/** Bookings that show paid but are still pending (webhook never confirmed). Should be none. */
export async function findStuckPaidPending(): Promise<StuckBooking[]> {
  const { rows } = await bookingDb().query<StuckBooking>(
    `select reference, pickup_at::text, customer_email
       from public.bookings
      where status = 'pending'
        and payment_status = 'paid'
      order by pickup_at asc
      limit 100`,
  );
  return rows;
}

export async function runStuckPaymentsDigest(): Promise<{ count: number; references: string[] }> {
  const rows = await findStuckPaidPending();
  const references = rows.map((r) => r.reference);
  if (rows.length === 0) {
    return { count: 0, references: [] };
  }

  const settings = await getSiteSettings();
  const lines = rows
    .map((r) => `- ${r.reference} · pickup ${r.pickup_at} · ${r.customer_email}`)
    .join('\n');
  const text = `Daily check: ${rows.length} booking(s) are status=pending with payment_status=paid.\n\n${lines}\n\nInvestigate the Viva webhook and /api/booking-status.`;
  const html = `<p>Daily check: <strong>${rows.length}</strong> booking(s) are <code>pending</code> with <code>payment_status=paid</code>.</p><pre>${lines}</pre><p>Investigate the Viva webhook and booking-status poll.</p>`;

  await sendEmail({
    to: settings.bookingNotificationEmail,
    subject: `[TEM] ${rows.length} stuck paid-pending booking(s)`,
    html,
    text,
    tag: 'stuck_paid_pending',
  });

  return { count: rows.length, references };
}
