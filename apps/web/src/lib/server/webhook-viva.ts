import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { bookingDb } from './db';
import { fireOnConfirmed, fireOnLateRefund } from './hooks';
import { getPaymentProvider } from './payments';

const EVENT_PAYMENT_CREATED = 1796;
const EVENT_PAYMENT_FAILED = 1798;

function logOutcome(fields: Record<string, unknown>): void {
  console.error(JSON.stringify({ level: 'info', code: 'viva_webhook', ...fields }));
}

async function storeCancelToken(bookingId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(token, 'utf8').digest('hex');
  await bookingDb().query(
    `update public.bookings set cancel_token_hash = $1 where id = $2::uuid and cancel_token_hash is null`,
    [hash, bookingId],
  );
  return token;
}

export async function handleVivaGet(): Promise<{ Key: string }> {
  const provider = getPaymentProvider();
  if (!provider.getWebhookKey) {
    throw new Error('webhook key unavailable');
  }
  const Key = await provider.getWebhookKey();
  return { Key };
}

export async function handleVivaPost(body: unknown): Promise<{ ok: true }> {
  const event = body as {
    EventTypeId?: number;
    EventData?: {
      TransactionId?: string;
      OrderCode?: number | string;
      Amount?: number;
      StatusId?: string;
    };
  };
  const typeId = event.EventTypeId;
  const data = event.EventData ?? {};

  if (typeId === EVENT_PAYMENT_FAILED) {
    const orderCode = data.OrderCode != null ? String(data.OrderCode) : null;
    const txId = data.TransactionId;
    if (orderCode && txId) {
      await bookingDb().query(
        `insert into public.payments (
           booking_id, kind, status, amount_cents, viva_order_code, viva_transaction_id, raw, trip_group_id
         )
         select b.id, 'payment', 'failed', greatest(b.price_cents, 1), b.viva_order_code, $1::uuid, '{}'::jsonb, b.trip_group_id
           from public.bookings b
          where b.viva_order_code = $2::bigint
            and not exists (
              select 1 from public.payments p
               where p.viva_transaction_id = $1::uuid and p.booking_id = b.id
            )`,
        [txId, orderCode],
      );
      logOutcome({ event: 'failed', orderCode });
    } else {
      logOutcome({ event: 'failed_ignored' });
    }
    return { ok: true };
  }

  if (typeId !== EVENT_PAYMENT_CREATED) {
    logOutcome({ event: 'ignored', typeId });
    return { ok: true };
  }

  const transactionId = data.TransactionId;
  if (!transactionId) {
    logOutcome({ event: 'missing_tx' });
    return { ok: true };
  }

  let txn;
  try {
    txn = await getPaymentProvider().getTransaction(transactionId);
  } catch {
    logOutcome({ event: 'lookup_failed', transactionId: transactionId.slice(0, 8) });
    return { ok: true };
  }

  if (!txn.succeeded || !txn.orderCode) {
    logOutcome({ event: 'not_success', orderCode: txn.orderCode });
    return { ok: true };
  }

  const { rows } = await bookingDb().query<{ j: Record<string, unknown> }>(
    `select public.record_viva_payment($1::bigint, $2::uuid, $3::int, $4::jsonb) as j`,
    [txn.orderCode, transactionId, txn.amountCents, JSON.stringify({ verified: true })],
  );
  const result = rows[0]?.j ?? { outcome: 'unknown' };
  const outcome = String(result.outcome);
  const reference = result.reference != null ? String(result.reference) : undefined;
  const bookingId = result.booking_id != null ? String(result.booking_id) : undefined;

  logOutcome({ event: 'payment_created', outcome, orderCode: txn.orderCode, reference });

  if (outcome === 'confirmed' && reference && bookingId) {
    const { rows: groupRows } = await bookingDb().query<{ id: string; reference: string; leg: number | null }>(
      `select id, reference, leg from public.bookings
        where viva_order_code = $1::bigint
        order by leg nulls first, created_at`,
      [txn.orderCode],
    );
    const legs = groupRows.length ? groupRows : [{ id: bookingId, reference, leg: null }];
    const tokens: { reference: string; token: string }[] = [];
    for (const leg of legs) {
      tokens.push({ reference: leg.reference, token: await storeCancelToken(leg.id) });
    }
    await fireOnConfirmed(tokens[0]!.reference, tokens[0]!.token, {
      siblingTokens: tokens.slice(1),
    });
  }

  if (outcome === 'late_unavailable' && reference && bookingId) {
    const priceCents = Number(result.price_cents);
    try {
      await getPaymentProvider().refund({
        transactionId,
        amountCents: priceCents,
      });
      await bookingDb().query(
        `insert into public.payments (booking_id, kind, status, amount_cents, viva_transaction_id, raw, trip_group_id)
         select id, 'refund', 'succeeded', price_cents, gen_random_uuid(), '{}'::jsonb, trip_group_id
           from public.bookings where viva_order_code = $1::bigint`,
        [txn.orderCode],
      );
      await bookingDb().query(
        `update public.bookings
            set status = 'cancelled',
                cancelled_at = now(),
                payment_status = 'refunded'
          where viva_order_code = $1::bigint`,
        [txn.orderCode],
      );
      await fireOnLateRefund(reference);
    } catch {
      logOutcome({ event: 'late_refund_failed', reference });
    }
  }

  return { ok: true };
}
