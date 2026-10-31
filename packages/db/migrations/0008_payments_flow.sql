-- 0008 Payment confirmation flow: record_viva_payment (idempotent webhook recording).

-- Outcomes:
--   confirmed        — payment recorded; booking confirmed + paid
--   duplicate        — same viva_transaction_id already recorded; no further changes
--   late_unavailable — payment recorded as succeeded but slot taken after hold expiry
--   amount_mismatch  — booking found but amount ≠ price_cents; nothing changed
--   unknown_order    — no booking for order_code; nothing changed
--   not_pending      — booking not pending (already confirmed/cancelled/…); payment may still insert

create or replace function public.record_viva_payment(
  p_order_code bigint,
  p_transaction_id uuid,
  p_amount_cents int,
  p_raw jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
as $$
declare
  b public.bookings;
  free int;
  outcome text;
begin
  select * into b from public.bookings where viva_order_code = p_order_code for update;
  if not found then
    return jsonb_build_object('outcome', 'unknown_order');
  end if;

  if p_amount_cents <> b.price_cents then
    return jsonb_build_object(
      'outcome', 'amount_mismatch',
      'reference', b.reference,
      'booking_id', b.id
    );
  end if;

  begin
    insert into public.payments (
      booking_id, kind, status, amount_cents, viva_order_code, viva_transaction_id, raw
    ) values (
      b.id, 'payment', 'succeeded', p_amount_cents, p_order_code, p_transaction_id, coalesce(p_raw, '{}'::jsonb)
    );
  exception
    when unique_violation then
      return jsonb_build_object(
        'outcome', 'duplicate',
        'reference', b.reference,
        'booking_id', b.id
      );
  end;

  if b.status <> 'pending' then
    update public.bookings set payment_status = 'paid' where id = b.id and payment_status = 'unpaid';
    return jsonb_build_object(
      'outcome', 'not_pending',
      'reference', b.reference,
      'booking_id', b.id
    );
  end if;

  if b.hold_expires_at is not null and b.hold_expires_at > now() then
    update public.bookings
       set status = 'confirmed',
           payment_status = 'paid'
     where id = b.id;
    outcome := 'confirmed';
  else
    free := public.class_availability(b.class_id, b.blocked_range, b.id);
    if free > 0 then
      update public.bookings
         set status = 'confirmed',
             payment_status = 'paid'
       where id = b.id;
      outcome := 'confirmed';
    else
      -- Leave pending/paid momentarily; app refunds and cancels.
      update public.bookings set payment_status = 'paid' where id = b.id;
      outcome := 'late_unavailable';
    end if;
  end if;

  return jsonb_build_object(
    'outcome', outcome,
    'reference', b.reference,
    'booking_id', b.id,
    'price_cents', b.price_cents
  );
end $$;
