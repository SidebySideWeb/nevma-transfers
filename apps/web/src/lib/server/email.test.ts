import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '@tem/db-harness';
import { hasDatabaseUrl } from '../../test/has-database';
import { sendConfirmationEmails, runReminderCron } from './booking-emails';
import { dbFromPool, setBookingDb } from './db';
import { setEmailTransport, type SendEmailInput } from './email';
import {
  cancelledCustomerEmail,
  confirmationEmail,
  lateRefundEmail,
  officeNewEmail,
  reminderEmail,
} from './email-templates';
import { fireOnConfirmed } from './hooks';
import { clearSettingsCache } from './settings';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const company = {
  companyName: 'TEM Protection',
  companyPhone: '+30 210 000 0000 (DEMO)',
  companyEmail: 'hello@example.com',
};

const baseConfirm = {
  reference: 'TEM-ABCDEF',
  bookingType: 'transfer' as const,
  pickupAtLocal: 'Mon 1 Dec 2026, 10:00',
  routeOrHours: 'DEMO Athens International Airport → DEMO Athens city centre',
  className: 'DEMO Executive sedan',
  passengers: 2,
  extras: [{ label: 'DEMO VIP security', cents: 15000 }],
  totalCents: 22000,
  vipSecurity: true,
  invoiceRequested: true,
  cancelUrl: 'https://example.com/booking/cancel/tok_demo_only',
  cancelWindowHours: 24,
  ...company,
};

describe('emails (prompt 08)', () => {
  let sent: SendEmailInput[];

  beforeEach(() => {
    sent = [];
    setEmailTransport(async (input) => {
      sent.push(input);
      return { ok: true, status: 200 };
    });
  });

  afterEach(() => {
    setEmailTransport(null);
  });

  it('AC-13: each template text renders DEMO strings and placeholders', () => {
    const conf = confirmationEmail(baseConfirm);
    expect(conf.subject).toContain('TEM-ABCDEF');
    expect(conf.text).toMatchInlineSnapshot(`
      "Thank you for booking with us. Your booking TEM-ABCDEF is confirmed for Mon 1 Dec 2026, 10:00 (Athens).

      Type: Transfer
      Pick-up: Mon 1 Dec 2026, 10:00 (Athens)
      Route: DEMO Athens International Airport → DEMO Athens city centre
      Vehicle: DEMO Executive sedan
      Passengers: 2
      Extras:
      DEMO VIP security: € 150.00
      Total: € 220.00

      VIP security is included in this booking. The office will contact you with the details.

      Invoice requested.

      To see, manage or cancel your booking, use this secure link: https://example.com/booking/cancel/tok_demo_only
      You can cancel online until 24 hours before pick-up.

      TEM Protection · +30 210 000 0000 (DEMO) · hello@example.com"
    `);
    expect(conf.text).toContain('/booking/cancel/tok_demo_only');
    expect(conf.text).not.toMatch(/\d{13,19}/); // no full card numbers

    const office = officeNewEmail({
      ...baseConfirm,
      customerName: 'A Customer',
      customerEmail: 'a@example.com',
      customerPhone: '+30 6900000000',
      notes: 'Gate B',
      flightNumber: 'A3 123',
      invoiceCompany: 'Co',
      invoiceVat: 'EL123',
      invoiceTaxOffice: 'Athens',
      invoiceAddress: 'Street 1',
      adminUrl: 'https://admin.example.com/bookings/TEM-ABCDEF',
    });
    expect(office.text).toContain('VIP SECURITY');
    expect(office.text).toContain('a@example.com');
    expect(office.subject).toContain('TEM-ABCDEF');

    const rem = reminderEmail({
      reference: 'TEM-ABCDEF',
      pickupAtLocal: 'Mon 1 Dec 2026, 10:00',
      ...company,
    });
    expect(rem.text).toMatchInlineSnapshot(`
      "This is a reminder of your booking TEM-ABCDEF on Mon 1 Dec 2026, 10:00 (Athens).

      TEM Protection · +30 210 000 0000 (DEMO) · hello@example.com"
    `);

    const cancelled = cancelledCustomerEmail({
      reference: 'TEM-ABCDEF',
      refundCents: 22000,
      ...company,
    });
    expect(cancelled.text).toContain('€ 220.00');
    expect(cancelled.text).toContain('TEM-ABCDEF');

    const late = lateRefundEmail({ reference: 'TEM-ABCDEF', ...company });
    expect(late.text).toMatchInlineSnapshot(`
      "Your payment arrived after the vehicle hold ended and the vehicle was no longer free, so we refunded it in full.
      Reference: TEM-ABCDEF

      TEM Protection · +30 210 000 0000 (DEMO) · hello@example.com"
    `);
  });

  it('AC-09: VIP lines only when flagged', () => {
    const withVip = confirmationEmail({ ...baseConfirm, vipSecurity: true });
    const without = confirmationEmail({ ...baseConfirm, vipSecurity: false, extras: [] });
    expect(withVip.text).toContain('VIP security is included');
    expect(without.text).not.toContain('VIP security is included');

    const officeVip = officeNewEmail({
      ...baseConfirm,
      vipSecurity: true,
      customerName: 'A',
      customerEmail: 'a@example.com',
      customerPhone: '+30 1',
      adminUrl: 'https://admin.example.com/bookings/TEM-ABCDEF',
    });
    const officeNo = officeNewEmail({
      ...baseConfirm,
      vipSecurity: false,
      customerName: 'A',
      customerEmail: 'a@example.com',
      customerPhone: '+30 1',
      adminUrl: 'https://admin.example.com/bookings/TEM-ABCDEF',
    });
    expect(officeVip.text).toContain('VIP SECURITY');
    expect(officeNo.text).not.toContain('VIP SECURITY');
  });

  it.skipIf(!hasDatabaseUrl)('AC-13: Resend failure after payment does not change booking status', async () => {
    const db = await createTestDb({ seed: true });
    setBookingDb(dbFromPool(db.pool));
    clearSettingsCache();
    try {
      const pickup = new Date(Date.now() + 48 * 3600_000).toISOString();
      const ins = await db.pool.query(
        `insert into public.bookings (
           booking_type, class_id, from_zone_id, to_zone_id,
           pickup_address, dropoff_address, pickup_at, duration_minutes, blocked_range,
           passengers, luggage, customer_name, customer_email, customer_phone,
           base_price_cents, price_cents, status, payment_status
         )
         select 'transfer', c.id, za.id, zb.id,
                'A', 'B', $1::timestamptz, 45,
                public.blocked_range_for($1::timestamptz, 45, c.buffer_minutes),
                2, 2, 'C', 'c@example.com', '+30 1',
                7000, 7000, 'confirmed', 'paid'
           from public.vehicle_classes c
           join public.zones za on za.code = 'demo-airport'
           join public.zones zb on zb.code = 'demo-centre'
          where c.key = 'demo-e-class'
         returning reference`,
        [pickup],
      );
      const reference = ins.rows[0].reference as string;

      setEmailTransport(async () => ({ ok: false, status: 503 }));
      await fireOnConfirmed(reference, 'cancel-token-plain');
      expect(
        (await db.pool.query(`select status, payment_status from public.bookings where reference = $1`, [
          reference,
        ])).rows[0],
      ).toMatchObject({ status: 'confirmed', payment_status: 'paid' });
    } finally {
      setBookingDb(null);
      clearSettingsCache();
      await db.drop();
    }
  });
});

describe.skipIf(!hasDatabaseUrl)('AC-13 reminder cron', () => {
  let db: TestDb;

  beforeEach(async () => {
    process.env.CRON_SECRET = 'cron-test-secret';
    db = await createTestDb({ seed: true });
    setBookingDb(dbFromPool(db.pool));
    clearSettingsCache();
    setEmailTransport(async () => ({ ok: true, status: 200 }));
  });

  afterEach(async () => {
    setBookingDb(null);
    setEmailTransport(null);
    clearSettingsCache();
    await db?.drop();
  });

  it('AC-13: two concurrent reminder runs send exactly one email per booking; cron without secret → 401', async () => {
    const sent: string[] = [];
    setEmailTransport(async (input) => {
      sent.push(input.reference ?? '');
      return { ok: true, status: 200 };
    });

    const pickup = new Date(Date.now() + 24 * 3600_000).toISOString();
    await db.pool.query(
      `insert into public.bookings (
         booking_type, class_id, from_zone_id, to_zone_id,
         pickup_address, dropoff_address, pickup_at, duration_minutes, blocked_range,
         passengers, luggage, customer_name, customer_email, customer_phone,
         base_price_cents, price_cents, status, payment_status
       )
       select 'transfer', c.id, za.id, zb.id,
              'A', 'B', $1::timestamptz, 45,
              public.blocked_range_for($1::timestamptz, 45, c.buffer_minutes),
              2, 2, 'C', 'c@example.com', '+30 1',
              7000, 7000, 'confirmed', 'paid'
         from public.vehicle_classes c
         join public.zones za on za.code = 'demo-airport'
         join public.zones zb on zb.code = 'demo-centre'
        where c.key = 'demo-e-class'`,
      [pickup],
    );

    const [a, b] = await Promise.all([runReminderCron(), runReminderCron()]);
    const claimed = [...a, ...b];
    expect(claimed).toHaveLength(1);
    expect(sent).toHaveLength(1);

    const { GET } = await import('../../pages/api/cron/reminders');
    const unauthorized = await GET({
      request: new Request('http://localhost/api/cron/reminders'),
    } as Parameters<typeof GET>[0]);
    expect(unauthorized.status).toBe(401);

    const ok = await GET({
      request: new Request('http://localhost/api/cron/reminders', {
        headers: { authorization: 'Bearer cron-test-secret' },
      }),
    } as Parameters<typeof GET>[0]);
    expect(ok.status).toBe(200);
  });

  it('AC-13: confirmation send includes cancel link in text', async () => {
    const sent: SendEmailInput[] = [];
    setEmailTransport(async (input) => {
      sent.push(input);
      return { ok: true, status: 200 };
    });
    const pickup = new Date(Date.now() + 48 * 3600_000).toISOString();
    const ins = await db.pool.query(
      `insert into public.bookings (
         booking_type, class_id, from_zone_id, to_zone_id,
         pickup_address, dropoff_address, pickup_at, duration_minutes, blocked_range,
         passengers, luggage, customer_name, customer_email, customer_phone,
         base_price_cents, price_cents, status, payment_status, vip_security
       )
       select 'transfer', c.id, za.id, zb.id,
              'A', 'B', $1::timestamptz, 45,
              public.blocked_range_for($1::timestamptz, 45, c.buffer_minutes),
              2, 2, 'C', 'c@example.com', '+30 1',
              7000, 22000, 'confirmed', 'paid', true
         from public.vehicle_classes c
         join public.zones za on za.code = 'demo-airport'
         join public.zones zb on zb.code = 'demo-centre'
        where c.key = 'demo-e-class'
       returning id, reference`,
      [pickup],
    );
    await db.pool.query(
      `insert into public.booking_extras (booking_id, extra_id, quantity, price_cents)
       select $1::uuid, e.id, 1, e.price_cents from public.extras e where e.code = 'vip-security'`,
      [ins.rows[0].id],
    );

    await sendConfirmationEmails(ins.rows[0].reference, 'plain-cancel-token');
    const customer = sent.find((s) => s.tag === 'confirmation');
    expect(customer?.text).toContain('/booking/cancel/plain-cancel-token');
    expect(customer?.text).toContain('VIP security is included');
    const office = sent.find((s) => s.tag === 'office_new');
    expect(office?.text).toContain('VIP SECURITY');
  });
});
