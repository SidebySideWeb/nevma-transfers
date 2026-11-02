import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '@tem/db-harness';
import { hasDatabaseUrl } from '../../test/has-database';
import { BookingError } from '../booking/types';
import { dbFromPool, setBookingDb } from './db';
import { driverAssignmentEmail } from './email-templates';
import { fail } from './http';
import { sign, verifySignature } from './signing';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const SECRET = 'test-signing-secret-for-drivers';

vi.mock('./email', () => ({
  sendEmail: vi.fn(async () => undefined),
  sendEmailResult: vi.fn(async () => ({ ok: true })),
}));

vi.mock('../sanity/content', () => ({
  loadUiStrings: vi.fn(async () => undefined),
  getSiteSettings: vi.fn(async () => ({
    companyName: 'Elite Protection',
    phone: '+30 1',
    email: 'office@example.com',
    bookingNotificationEmail: 'office@example.com',
  })),
}));

const inviteUserByEmail = vi.fn();
const generateLink = vi.fn();

vi.mock('./supabase', () => ({
  getServiceClient: () => ({
    auth: {
      admin: {
        inviteUserByEmail,
        generateLink,
      },
    },
  }),
}));

describe('driver assignment email (no prices)', () => {
  it('body and subject contain no money wording', () => {
    const parts = driverAssignmentEmail({
      kind: 'assigned',
      reference: 'ELP-TEST01',
      pickupAtLocal: 'Mon 1 Jun 2027, 10:00',
      routeOrHours: 'Airport → Centre',
      pickupAddress: 'Arrivals',
      passengers: 2,
      driverName: 'Alex',
      companyName: 'Elite Protection',
      companyPhone: '+30 1',
      companyEmail: 'a@b.c',
    });
    const blob = `${parts.subject}\n${parts.text}\n${parts.html}`;
    expect(blob).not.toMatch(/€|EUR|\bprice\b|\bcents?\b|\bvat\b/i);
    expect(blob).toContain('ELP-TEST01');
    expect(blob).toContain('Arrivals');
  });
});

describe.skipIf(!hasDatabaseUrl)('driver invite / notify internals', () => {
  let db: TestDb;
  let staffId: string;

  beforeEach(async () => {
    process.env.ADMIN_TO_WEB_SIGNING_SECRET = SECRET;
    inviteUserByEmail.mockReset();
    generateLink.mockReset();
    generateLink.mockResolvedValue({
      data: { properties: { action_link: 'https://example.com/magic' } },
      error: null,
    });
    db = await createTestDb({ seed: true });
    setBookingDb(dbFromPool(db.pool));
    staffId = randomUUID();
    await db.pool.query(`insert into auth.users (id, email) values ($1, 'staff-drv@example.com')`, [
      staffId,
    ]);
    await db.pool.query(
      `insert into public.staff (user_id, email, name) values ($1, 'staff-drv@example.com', 'Staff')`,
      [staffId],
    );
  });

  afterEach(async () => {
    setBookingDb(null);
    await db?.drop();
  });

  it('invite: signature required', async () => {
    const body = JSON.stringify({ driverId: randomUUID() });
    const now = Math.floor(Date.now() / 1000);
    const bad = new Request('http://localhost/api/internal/drivers/invite', {
      method: 'POST',
      headers: {
        'x-tem-timestamp': String(now),
        'x-tem-signature': '00'.repeat(32),
        'x-tem-staff': staffId,
      },
      body,
    });
    await expect(verifySignature(bad)).rejects.toMatchObject({ message: 'bad_signature' });
    expect(
      fail(
        new BookingError('invalid_request', {
          stringKey: 'error.invalid_request',
          message: 'bad_signature',
        }),
        401,
      ).status,
    ).toBe(401);

    const good = new Request('http://localhost/api/internal/drivers/invite', {
      method: 'POST',
      headers: {
        'x-tem-timestamp': String(now),
        'x-tem-signature': sign(body, now),
        'x-tem-staff': staffId,
      },
      body,
    });
    await expect(verifySignature(good)).resolves.toMatchObject({ staffUserId: staffId });
  });

  it('invite: existing auth user is linked; staff e-mail refused with 409', async () => {
    const { internalDriverInvite } = await import('./driver-invite');

    const staffDriverId = randomUUID();
    await db.pool.query(
      `insert into public.drivers (id, full_name, phone, email, employment, active)
       values ($1, 'Staff Dup', '+306900000001', 'staff-drv@example.com', 'employee', true)`,
      [staffDriverId],
    );
    await expect(internalDriverInvite({ driverId: staffDriverId })).rejects.toMatchObject({
      message: 'staff_email',
    });
    expect(
      fail(
        new BookingError('unavailable', {
          stringKey: 'error.unavailable',
          message: 'staff_email',
        }),
        409,
      ).status,
    ).toBe(409);

    const existingUser = randomUUID();
    await db.pool.query(`insert into auth.users (id, email) values ($1, 'driver-link@example.com')`, [
      existingUser,
    ]);
    const driverId = randomUUID();
    await db.pool.query(
      `insert into public.drivers (id, full_name, phone, email, employment, active)
       values ($1, 'Link Me', '+306900000002', 'driver-link@example.com', 'freelancer', true)`,
      [driverId],
    );
    const result = await internalDriverInvite({ driverId });
    expect(result).toEqual({ status: 'linked' });
    const row = await db.pool.query(`select user_id::text from public.drivers where id = $1`, [
      driverId,
    ]);
    expect(row.rows[0].user_id).toBe(existingUser);
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('notify: skipped without login; no prices when sent', async () => {
    const { internalDriverNotify } = await import('./driver-notify');
    const { sendEmail } = await import('./email');

    const pickup = new Date(Date.now() + 2 * 24 * 3600_000).toISOString();
    const b = await db.pool.query(
      `insert into public.bookings (
         booking_type, class_id, from_zone_id, to_zone_id,
         pickup_address, dropoff_address, pickup_at, duration_minutes, blocked_range,
         passengers, luggage, customer_name, customer_email, customer_phone,
         base_price_cents, price_cents, status, payment_status
       )
       select 'transfer', c.id, za.id, zb.id,
              'Arrivals hall', 'Hotel', $1::timestamptz, 45,
              public.blocked_range_for($1::timestamptz, 45, c.buffer_minutes),
              2, 1, 'Cust', 'c@example.com', '+30 1',
              99999, 99999, 'confirmed', 'paid'
         from public.vehicle_classes c
         join public.zones za on za.code = 'demo-airport'
         join public.zones zb on zb.code = 'demo-centre'
        where c.key = 'demo-e-class'
       returning id, reference`,
      [pickup],
    );
    const booking = b.rows[0] as { id: string; reference: string };

    const skip = await internalDriverNotify({ reference: booking.reference, kind: 'assigned' });
    expect(skip).toEqual({ status: 'skipped', reason: 'no_login' });

    const userId = randomUUID();
    await db.pool.query(`insert into auth.users (id, email) values ($1, 'drv-mail@example.com')`, [
      userId,
    ]);
    const driverId = randomUUID();
    await db.pool.query(
      `insert into public.drivers (id, full_name, phone, email, employment, active, user_id)
       values ($1, 'Mail Driver', '+306900000003', 'drv-mail@example.com', 'employee', true, $2)`,
      [driverId, userId],
    );
    await db.pool.query(`update public.bookings set driver_id = $1 where id = $2`, [
      driverId,
      booking.id,
    ]);

    vi.mocked(sendEmail).mockClear();
    const sent = await internalDriverNotify({ reference: booking.reference, kind: 'assigned' });
    expect(sent).toEqual({ status: 'sent' });
    expect(sendEmail).toHaveBeenCalledOnce();
    const arg = vi.mocked(sendEmail).mock.calls[0]![0] as {
      subject: string;
      text: string;
      html: string;
    };
    const blob = `${arg.subject}\n${arg.text}\n${arg.html}`;
    expect(blob).not.toMatch(/€|EUR|\bprice\b|99999|\bcents?\b|\bvat\b/i);
    expect(blob).toContain(booking.reference);
  });
});
