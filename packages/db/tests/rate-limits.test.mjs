import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from './harness.mjs';

describe('0007 rate limits and booking-from-hold', () => {
  it('hit_rate_limit allows up to max then returns false', async () => {
    const db = await createTestDb({ seed: true });
    try {
      assert.equal((await db.pool.query(`select public.hit_rate_limit('t', 60, 2) as ok`)).rows[0].ok, true);
      assert.equal((await db.pool.query(`select public.hit_rate_limit('t', 60, 2) as ok`)).rows[0].ok, true);
      assert.equal((await db.pool.query(`select public.hit_rate_limit('t', 60, 2) as ok`)).rows[0].ok, false);
    } finally {
      await db.drop();
    }
  });

  it('create_booking_from_hold copies prices and converts the hold', async () => {
    const db = await createTestDb({ seed: true });
    try {
      const pickup = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
      const zones = await db.pool.query(
        `select id, code from public.zones where code in ('demo-airport','demo-centre')`,
      );
      const fromId = zones.rows.find((r) => r.code === 'demo-airport').id;
      const toId = zones.rows.find((r) => r.code === 'demo-centre').id;

      const hold = await db.pool.query(
        `select * from public.create_hold(
          'demo-sedan', $1::timestamptz, 45, 'visitor-a',
          'transfer', $2::uuid, $3::uuid, null
        )`,
        [pickup, fromId, toId],
      );
      const holdId = hold.rows[0].id;

      const created = await db.pool.query(
        `select public.create_booking_from_hold(
          $1::uuid, 'visitor-a', 'Street 1', 'Street 2', 2, 2, null, null,
          array['vip-security']::text[],
          'A Customer', 'a@example.com', '+30 6900000000',
          null, null, null, null
        ) as j`,
        [holdId],
      );
      const j = created.rows[0].j;
      assert.equal(j.base_cents > 0, true);
      assert.equal(j.price_cents, j.base_cents + 15000);
      assert.equal(
        (await db.pool.query(`select status from public.slot_holds where id = $1`, [holdId])).rows[0]
          .status,
        'converted',
      );
      assert.equal(
        (await db.pool.query(`select vip_security from public.bookings where id = $1`, [j.booking_id]))
          .rows[0].vip_security,
        true,
      );
    } finally {
      await db.drop();
    }
  });
});
