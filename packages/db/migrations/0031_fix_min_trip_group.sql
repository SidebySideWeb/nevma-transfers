-- 0031: record_viva_payment used min(trip_group_id); PostgreSQL has no min(uuid).

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
  outcome text := 'not_pending';
  expected int := 0;
  group_id uuid;
  confirmed_refs text[] := '{}';
  first_ref text;
  first_id uuid;
  leg_count int := 0;
begin
  perform 1 from public.bookings where viva_order_code = p_order_code for update;
  select coalesce(sum(price_cents), 0), count(*)::int,
         (array_agg(trip_group_id order by leg nulls first, created_at)
           filter (where trip_group_id is not null))[1]
    into expected, leg_count, group_id
    from public.bookings
   where viva_order_code = p_order_code;

  if leg_count = 0 then
    return jsonb_build_object('outcome', 'unknown_order');
  end if;

  select * into b from public.bookings
   where viva_order_code = p_order_code
   order by leg nulls first, created_at
   limit 1;

  if p_amount_cents <> expected then
    return jsonb_build_object(
      'outcome', 'amount_mismatch',
      'reference', b.reference,
      'booking_id', b.id
    );
  end if;

  if exists (
    select 1 from public.payments
     where viva_transaction_id = p_transaction_id
       and booking_id = b.id
  ) then
    return jsonb_build_object(
      'outcome', 'duplicate',
      'reference', b.reference,
      'booking_id', b.id
    );
  end if;

  for b in
    select * from public.bookings
     where viva_order_code = p_order_code
     order by leg nulls first, created_at
  loop
    insert into public.payments (
      booking_id, kind, status, amount_cents, viva_order_code, viva_transaction_id, raw, trip_group_id
    ) values (
      b.id, 'payment', 'succeeded', b.price_cents, p_order_code, p_transaction_id,
      coalesce(p_raw, '{}'::jsonb), b.trip_group_id
    );

    if b.status <> 'pending' then
      update public.bookings set payment_status = 'paid' where id = b.id and payment_status = 'unpaid';
      first_ref := coalesce(first_ref, b.reference);
      first_id := coalesce(first_id, b.id);
      continue;
    end if;

    if b.hold_expires_at is not null and b.hold_expires_at > now() then
      update public.bookings
         set status = 'confirmed', payment_status = 'paid'
       where id = b.id;
      outcome := 'confirmed';
    else
      free := public.class_availability(b.class_id, b.blocked_range, b.id);
      if free > 0 then
        update public.bookings
           set status = 'confirmed', payment_status = 'paid'
         where id = b.id;
        outcome := 'confirmed';
      else
        update public.bookings set payment_status = 'paid' where id = b.id;
        outcome := 'late_unavailable';
      end if;
    end if;
    confirmed_refs := confirmed_refs || b.reference;
    first_ref := coalesce(first_ref, b.reference);
    first_id := coalesce(first_id, b.id);
  end loop;

  return jsonb_build_object(
    'outcome', outcome,
    'reference', first_ref,
    'booking_id', first_id,
    'price_cents', expected,
    'references', to_jsonb(confirmed_refs),
    'trip_group_id', group_id
  );
end $$;
