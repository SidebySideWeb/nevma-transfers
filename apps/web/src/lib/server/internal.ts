import 'server-only';
import { z } from 'zod';
import { BookingError } from '../booking/types';
import { bookingDb } from './db';
import { fireOnCancelled } from './hooks';
import { getPaymentProvider } from './payments';

const RefundBody = z
  .object({
    reference: z.string().min(1),
    amountCents: z.number().int().positive(),
    reason: z.string().min(1),
    idempotencyKey: z.uuid(),
  })
  .strict();

const CancelBody = z
  .object({
    reference: z.string().min(1),
    refund: z.union([
      z.literal('full'),
      z.literal('none'),
      z.object({ amountCents: z.number().int().positive() }).strict(),
    ]),
    reason: z.string().min(1),
    idempotencyKey: z.uuid(),
  })
  .strict();

async function paidAndRefunded(bookingId: string): Promise<{ paid: number; refunded: number }> {
  const { rows } = await bookingDb().query<{ paid: number; refunded: number }>(
    `select
       coalesce(sum(amount_cents) filter (where kind = 'payment' and status = 'succeeded'), 0)::int as paid,
       coalesce(sum(amount_cents) filter (where kind = 'refund' and status in ('pending','succeeded')), 0)::int as refunded
     from public.payments where booking_id = $1::uuid`,
    [bookingId],
  );
  return rows[0] ?? { paid: 0, refunded: 0 };
}

async function paymentStatusFor(paid: number, refunded: number): Promise<string> {
  if (refunded <= 0) return 'paid';
  if (refunded >= paid) return 'refunded';
  return 'partially_refunded';
}

async function originalTransactionId(bookingId: string): Promise<string | null> {
  const { rows } = await bookingDb().query<{ viva_transaction_id: string }>(
    `select viva_transaction_id::text
       from public.payments
      where booking_id = $1::uuid and kind = 'payment' and status = 'succeeded'
        and viva_transaction_id is not null
      order by created_at asc
      limit 1`,
    [bookingId],
  );
  return rows[0]?.viva_transaction_id ?? null;
}

export async function internalRefund(raw: unknown, staffUserId: string) {
  const parsed = RefundBody.safeParse(raw);
  if (!parsed.success) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: parsed.error.message,
    });
  }
  const body = parsed.data;

  const { rows: bookings } = await bookingDb().query<{
    id: string;
    payment_status: string;
  }>(`select id, payment_status from public.bookings where reference = $1`, [body.reference]);
  const booking = bookings[0];
  if (!booking) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'unknown_booking',
    });
  }

  // Idempotent: existing key → return stored result without calling Viva again.
  const existing = await bookingDb().query<{
    id: string;
    amount_cents: number;
    status: string;
  }>(
    `select id, amount_cents, status from public.payments where idempotency_key = $1`,
    [body.idempotencyKey],
  );
  if (existing.rows[0]) {
    const { paid, refunded } = await paidAndRefunded(booking.id);
    const paymentStatus = await paymentStatusFor(paid, refunded);
    return {
      refundedCents: existing.rows[0].amount_cents,
      refundableCents: Math.max(0, paid - refunded),
      paymentStatus,
    };
  }

  let refundRow: { id: string };
  try {
    const ins = await bookingDb().query<{ id: string }>(
      `insert into public.payments (
         booking_id, kind, status, amount_cents, idempotency_key, created_by
       ) values ($1::uuid, 'refund', 'pending', $2::int, $3, $4::uuid)
       returning id`,
      [booking.id, body.amountCents, body.idempotencyKey, staffUserId],
    );
    refundRow = ins.rows[0]!;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('refund_exceeds_paid')) {
      throw new BookingError('invalid_request', {
        stringKey: 'error.invalid_request',
        message: 'refund_exceeds_paid',
      });
    }
    // Race on idempotency key
    if (msg.includes('unique') || msg.includes('duplicate')) {
      const again = await bookingDb().query<{ amount_cents: number }>(
        `select amount_cents from public.payments where idempotency_key = $1`,
        [body.idempotencyKey],
      );
      const { paid, refunded } = await paidAndRefunded(booking.id);
      return {
        refundedCents: again.rows[0]?.amount_cents ?? body.amountCents,
        refundableCents: Math.max(0, paid - refunded),
        paymentStatus: await paymentStatusFor(paid, refunded),
      };
    }
    throw e;
  }

  const { rows: payMethodRows } = await bookingDb().query<{ method: string }>(
    `select method from public.payments
      where booking_id = $1::uuid and kind = 'payment' and status = 'succeeded'
      order by created_at asc limit 1`,
    [booking.id],
  );
  const payMethod = payMethodRows[0]?.method ?? 'viva';

  if (payMethod !== 'viva') {
    // Offline refund: no Viva call.
    await bookingDb().query(
      `update public.payments set status = 'succeeded', method = $1 where id = $2::uuid`,
      [payMethod, refundRow.id],
    );
  } else {
    const txId = await originalTransactionId(booking.id);
    if (!txId) {
      await bookingDb().query(`update public.payments set status = 'failed' where id = $1::uuid`, [
        refundRow.id,
      ]);
      throw new BookingError('payment_failed', {
        stringKey: 'error.payment_failed',
        message: 'no_transaction',
      });
    }

    try {
      await getPaymentProvider().refund({
        transactionId: txId,
        amountCents: body.amountCents,
      });
      await bookingDb().query(`update public.payments set status = 'succeeded' where id = $1::uuid`, [
        refundRow.id,
      ]);
    } catch {
      await bookingDb().query(`update public.payments set status = 'failed' where id = $1::uuid`, [
        refundRow.id,
      ]);
      throw new BookingError('payment_failed', {
        stringKey: 'error.payment_failed',
        message: 'refund_failed',
      });
    }
  }

  const { paid, refunded } = await paidAndRefunded(booking.id);
  const paymentStatus = await paymentStatusFor(paid, refunded);
  await bookingDb().query(
    `update public.bookings set payment_status = $1::public.payment_status where id = $2::uuid`,
    [paymentStatus, booking.id],
  );

  void body.reason;
  return {
    refundedCents: body.amountCents,
    refundableCents: Math.max(0, paid - refunded),
    paymentStatus,
  };
}

export async function internalCancel(raw: unknown, staffUserId: string) {
  const parsed = CancelBody.safeParse(raw);
  if (!parsed.success) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: parsed.error.message,
    });
  }
  const body = parsed.data;

  const { rows } = await bookingDb().query<{
    id: string;
    status: string;
    price_cents: number;
  }>(`select id, status, price_cents from public.bookings where reference = $1`, [body.reference]);
  const booking = rows[0];
  if (!booking) {
    throw new BookingError('invalid_request', {
      stringKey: 'error.invalid_request',
      message: 'unknown_booking',
    });
  }

  let refundCents = 0;
  if (body.refund !== 'none') {
    const { paid, refunded } = await paidAndRefunded(booking.id);
    const want =
      body.refund === 'full' ? Math.max(0, paid - refunded) : body.refund.amountCents;
    if (want > 0) {
      const result = await internalRefund(
        {
          reference: body.reference,
          amountCents: want,
          reason: body.reason,
          idempotencyKey: body.idempotencyKey,
        },
        staffUserId,
      );
      refundCents = result.refundedCents;
    }
  }

  await bookingDb().query(
    `update public.bookings
        set status = 'cancelled',
            cancelled_at = now(),
            cancel_token_hash = null
      where id = $1::uuid and status <> 'cancelled'`,
    [booking.id],
  );

  await fireOnCancelled(body.reference, refundCents);

  return { status: 'cancelled' as const, refundedCents: refundCents };
}
