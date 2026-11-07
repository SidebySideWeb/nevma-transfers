-- 0028 Return trips (B6 / BOOKING-V2-PLAN item 4).
-- Kit called this 0020_return_trips; this repo already used 0020–0027.

-- ---------------------------------------------------------------------------
-- bookings: trip group + legs
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists trip_group_id uuid,
  add column if not exists leg smallint,
  add column if not exists return_of uuid references public.bookings(id);

alter table public.bookings
  drop constraint if exists bookings_leg_check;
alter table public.bookings
  add constraint bookings_leg_check check (leg is null or leg in (1, 2));

alter table public.bookings
  drop constraint if exists bookings_trip_group_leg_ck;
alter table public.bookings
  add constraint bookings_trip_group_leg_ck check (
    (trip_group_id is null and leg is null)
    or (trip_group_id is not null and leg is not null)
  );

create index if not exists bookings_trip_group_idx on public.bookings (trip_group_id)
  where trip_group_id is not null;

comment on column public.bookings.trip_group_id is 'Shared id for outbound + return legs (one Viva order).';
comment on column public.bookings.leg is '1 = outbound, 2 = return.';
comment on column public.bookings.return_of is 'Return leg points at the outbound booking.';

-- Return pick-up must be after outbound pick-up + duration.
create or replace function public.enforce_return_leg_timing()
returns trigger
language plpgsql
as $$
declare
  outbound public.bookings;
  outbound_end timestamptz;
begin
  if new.leg is distinct from 2 or new.return_of is null then
    return new;
  end if;
  select * into outbound from public.bookings where id = new.return_of;
  if not found then
    raise exception 'invalid_request: return_of unknown' using errcode = 'check_violation';
  end if;
  outbound_end := outbound.pickup_at
    + make_interval(mins => coalesce(outbound.duration_minutes, 0));
  if new.pickup_at < outbound_end then
    raise exception 'invalid_request: return pickup before outbound ends'
      using errcode = 'check_violation';
  end if;
  if new.trip_group_id is distinct from outbound.trip_group_id then
    raise exception 'invalid_request: trip_group_id mismatch' using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists bookings_return_leg_timing on public.bookings;
create trigger bookings_return_leg_timing
  before insert or update of pickup_at, return_of, leg, trip_group_id, duration_minutes
  on public.bookings
  for each row execute function public.enforce_return_leg_timing();

-- ---------------------------------------------------------------------------
-- quotes: return leg snapshot
-- ---------------------------------------------------------------------------
alter table public.quotes
  add column if not exists return_pickup_at timestamptz,
  add column if not exists return_duration_min int,
  add column if not exists return_distance_km numeric(8, 1),
  add column if not exists return_flight_number text;

alter table public.quotes
  drop constraint if exists quotes_return_duration_ck;
alter table public.quotes
  add constraint quotes_return_duration_ck check (
    return_duration_min is null or return_duration_min > 0
  );

comment on column public.quotes.return_pickup_at is 'Return leg pick-up when FEATURE_RETURN_TRIP quote includes return.';

-- ---------------------------------------------------------------------------
-- bookings.viva_order_code: one order may cover two legs (drop uniqueness)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'bookings_viva_order_code_key'
       and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings drop constraint bookings_viva_order_code_key;
  end if;
end $$;
create index if not exists bookings_viva_order_code_idx
  on public.bookings (viva_order_code)
  where viva_order_code is not null;

-- ---------------------------------------------------------------------------
-- payments: trip group + allow same Viva tx on both legs (share per booking)
-- ---------------------------------------------------------------------------
alter table public.payments
  add column if not exists trip_group_id uuid;

create index if not exists payments_trip_group_idx on public.payments (trip_group_id)
  where trip_group_id is not null;

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'payments_viva_transaction_id_key'
       and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments drop constraint payments_viva_transaction_id_key;
  end if;
end $$;

create unique index if not exists payments_viva_tx_booking_uidx
  on public.payments (viva_transaction_id, booking_id)
  where viva_transaction_id is not null;

-- ---------------------------------------------------------------------------
-- expire_holds: release both legs of a trip group together
-- ---------------------------------------------------------------------------
create or replace function public.expire_holds() returns int
language plpgsql
as $$
declare
  n int;
  g uuid;
begin
  update public.slot_holds set status = 'expired'
   where status = 'active' and expires_at <= now();
  get diagnostics n = row_count;

  -- Collect groups that have at least one expired unpaid pending leg.
  for g in
    select distinct trip_group_id
      from public.bookings
     where status = 'pending'
       and payment_status = 'unpaid'
       and hold_expires_at <= now()
       and trip_group_id is not null
  loop
    update public.bookings
       set status = 'expired'
     where trip_group_id = g
       and status = 'pending'
       and payment_status = 'unpaid';
  end loop;

  update public.bookings set status = 'expired'
   where status = 'pending'
     and payment_status = 'unpaid'
     and hold_expires_at <= now()
     and trip_group_id is null;

  return n;
end $$;

-- ---------------------------------------------------------------------------
-- record_viva_payment: one order may cover a trip group (sum of leg prices)
-- ---------------------------------------------------------------------------
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
  select coalesce(sum(price_cents), 0), count(*)::int, min(trip_group_id)
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

-- ---------------------------------------------------------------------------
-- create_booking_from_quote: optionally create outbound + return in one txn
-- ---------------------------------------------------------------------------
create or replace function public.create_booking_from_quote(
  p_quote_id uuid,
  p_class_key text,
  p_visitor_key text,
  p_pickup_address text,
  p_dropoff_address text,
  p_passengers int,
  p_luggage int,
  p_flight_number text,
  p_notes text,
  p_extra_codes text[],
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_invoice_company text,
  p_invoice_vat text,
  p_invoice_tax_office text,
  p_invoice_address text
) returns jsonb
language plpgsql
as $$
declare
  q public.quotes;
  c public.vehicle_classes;
  h public.slot_holds;
  h2 public.slot_holds;
  class_price jsonb;
  outbound_cents int;
  return_cents int;
  total_cents int;
  base_cents int;
  total int;
  breakdown jsonb;
  return_breakdown jsonb;
  b public.bookings;
  b2 public.bookings;
  r tstzrange;
  r2 tstzrange;
  from_id uuid;
  to_id uuid;
  lines jsonb := '[]'::jsonb;
  extra_code text;
  qty int;
  line_cents int;
  ex public.extras;
  inv public.invoice_status := 'not_required';
  group_id uuid;
  has_return boolean := false;
  ret_duration int;
begin
  select * into q from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'invalid_request: unknown quote';
  end if;
  if q.expires_at <= now() then
    raise exception 'quote_expired';
  end if;

  select * into c from public.vehicle_classes where key = p_class_key and active for update;
  if not found then
    raise exception 'invalid_request: unknown vehicle class %', p_class_key;
  end if;

  class_price := q.prices -> p_class_key;
  if class_price is null or coalesce((class_price->>'available')::boolean, false) is not true then
    raise exception 'unavailable';
  end if;

  has_return := q.return_pickup_at is not null
    and class_price ? 'outbound'
    and class_price ? 'return';

  if has_return then
    outbound_cents := coalesce((class_price->>'outbound')::int, 0);
    return_cents := coalesce((class_price->>'return')::int, 0);
    total_cents := coalesce((class_price->>'total')::int, outbound_cents + return_cents);
    if outbound_cents <= 0 or return_cents <= 0 or total_cents <= 0 then
      raise exception 'no_price';
    end if;
    base_cents := outbound_cents;
    breakdown := coalesce(class_price->'breakdown', '[]'::jsonb);
    return_breakdown := coalesce(class_price->'returnBreakdown', '[]'::jsonb);
    ret_duration := coalesce(q.return_duration_min, q.duration_min);
  else
    base_cents := coalesce((class_price->>'total')::int, 0);
    if base_cents <= 0 then
      raise exception 'no_price';
    end if;
    breakdown := coalesce(class_price->'breakdown', '[]'::jsonb);
  end if;

  if q.mode = 'transfer' then
    select id into from_id from public.zones where code = q.from_zone_code and active;
    select id into to_id from public.zones where code = q.to_zone_code and active;
    if from_id is null or to_id is null or from_id = to_id then
      raise exception 'invalid_request: quote missing zones';
    end if;
  else
    select id into from_id from public.zones where code = q.from_zone_code and active;
    if from_id is null then
      raise exception 'invalid_request: quote missing from zone';
    end if;
    to_id := null;
    if has_return then
      raise exception 'invalid_request: return not offered for hourly';
    end if;
  end if;

  r := public.blocked_range_for(q.pickup_at, q.duration_min, c.buffer_minutes);
  if public.class_availability(c.id, r) < 1 then
    raise exception 'unavailable';
  end if;

  if has_return then
    r2 := public.blocked_range_for(q.return_pickup_at, ret_duration, c.buffer_minutes);
    if public.class_availability(c.id, r2) < 1 then
      raise exception 'unavailable';
    end if;
    group_id := gen_random_uuid();
  end if;

  insert into public.slot_holds (
    class_id, visitor_key, blocked_range, expires_at,
    booking_type, from_zone_id, to_zone_id, hours, duration_minutes, pickup_at
  ) values (
    c.id, p_visitor_key, r,
    now() + make_interval(mins => public.setting_int('hold_minutes')),
    q.mode::public.booking_type, from_id, to_id, q.hours, q.duration_min, q.pickup_at
  ) returning * into h;

  if has_return then
    insert into public.slot_holds (
      class_id, visitor_key, blocked_range, expires_at,
      booking_type, from_zone_id, to_zone_id, hours, duration_minutes, pickup_at
    ) values (
      c.id, p_visitor_key, r2,
      h.expires_at,
      q.mode::public.booking_type, to_id, from_id, null, ret_duration, q.return_pickup_at
    ) returning * into h2;
  end if;

  total := base_cents;
  lines := lines || jsonb_build_array(jsonb_build_object(
    'code', 'base', 'label', c.name, 'cents', base_cents
  ));

  if p_extra_codes is not null then
    for extra_code, qty in
      select x, count(*)::int
        from unnest(p_extra_codes) as t(x)
       where x is not null and x <> ''
       group by x
    loop
      select e.* into ex from public.extras e where e.code = extra_code;
      if not found or not ex.active then
        raise exception 'invalid_request: unknown or inactive extra %', extra_code;
      end if;
      if not (q.mode = any (ex.applies_to)) then
        raise exception 'invalid_request: extra % not offered for %', extra_code, q.mode;
      end if;
      if qty < 1 or qty > ex.max_quantity then
        raise exception 'invalid_request: quantity % for extra % exceeds max %', qty, extra_code, ex.max_quantity;
      end if;
      line_cents := ex.price_cents * qty;
      total := total + line_cents;
      lines := lines || jsonb_build_array(jsonb_build_object(
        'code', ex.code,
        'label', case when qty > 1 then ex.name || ' × ' || qty::text else ex.name end,
        'cents', line_cents
      ));
    end loop;
  end if;

  if p_invoice_company is not null then
    inv := 'requested';
  end if;

  insert into public.bookings (
    booking_type, class_id, from_zone_id, to_zone_id,
    pickup_address, dropoff_address, pickup_at, hours, duration_minutes, blocked_range,
    passengers, luggage, flight_number, customer_name, customer_email, customer_phone, notes,
    base_price_cents, price_cents, status, hold_expires_at, payment_status,
    invoice_status, invoice_company, invoice_vat, invoice_tax_office, invoice_address,
    visitor_key, quote_id, distance_km, duration_min, price_breakdown,
    pickup_place_id, pickup_lat, pickup_lng, dropoff_place_id, dropoff_lat, dropoff_lng,
    trip_group_id, leg
  ) values (
    q.mode::public.booking_type, c.id, from_id, to_id,
    p_pickup_address,
    case when q.mode = 'transfer' then p_dropoff_address else null end,
    q.pickup_at, q.hours, q.duration_min, r,
    p_passengers, p_luggage, p_flight_number, p_customer_name, p_customer_email, p_customer_phone, p_notes,
    base_cents, total, 'pending', h.expires_at, 'unpaid',
    inv, p_invoice_company, p_invoice_vat, p_invoice_tax_office, p_invoice_address,
    p_visitor_key, q.id, q.distance_km, q.duration_min, breakdown,
    q.pickup_place_id, q.pickup_lat, q.pickup_lng, q.dropoff_place_id, q.dropoff_lat, q.dropoff_lng,
    group_id, case when has_return then 1 else null end
  ) returning * into b;

  if p_extra_codes is not null then
    for extra_code, qty in
      select x, count(*)::int
        from unnest(p_extra_codes) as t(x)
       where x is not null and x <> ''
       group by x
    loop
      select e.* into ex from public.extras e where e.code = extra_code;
      insert into public.booking_extras (booking_id, extra_id, quantity, price_cents)
      values (b.id, ex.id, qty, ex.price_cents * qty);
    end loop;
  end if;

  update public.slot_holds
     set status = 'converted', booking_id = b.id
   where id = h.id;

  if has_return then
    insert into public.bookings (
      booking_type, class_id, from_zone_id, to_zone_id,
      pickup_address, dropoff_address, pickup_at, hours, duration_minutes, blocked_range,
      passengers, luggage, flight_number, customer_name, customer_email, customer_phone, notes,
      base_price_cents, price_cents, status, hold_expires_at, payment_status,
      invoice_status, visitor_key, quote_id, distance_km, duration_min, price_breakdown,
      pickup_place_id, pickup_lat, pickup_lng, dropoff_place_id, dropoff_lat, dropoff_lng,
      trip_group_id, leg, return_of
    ) values (
      q.mode::public.booking_type, c.id, to_id, from_id,
      coalesce(p_dropoff_address, p_pickup_address),
      p_pickup_address,
      q.return_pickup_at, null, ret_duration, r2,
      p_passengers, p_luggage, q.return_flight_number, p_customer_name, p_customer_email, p_customer_phone, p_notes,
      return_cents, return_cents, 'pending', h.expires_at, 'unpaid',
      'not_required', p_visitor_key, q.id, q.return_distance_km, ret_duration, return_breakdown,
      q.dropoff_place_id, q.dropoff_lat, q.dropoff_lng, q.pickup_place_id, q.pickup_lat, q.pickup_lng,
      group_id, 2, b.id
    ) returning * into b2;

    update public.slot_holds
       set status = 'converted', booking_id = b2.id
     where id = h2.id;

    lines := lines || jsonb_build_array(jsonb_build_object(
      'code', 'return', 'label', 'Return', 'cents', return_cents
    ));

    return jsonb_build_object(
      'booking_id', b.id,
      'reference', b.reference,
      'return_booking_id', b2.id,
      'return_reference', b2.reference,
      'trip_group_id', group_id,
      'base_cents', b.base_price_cents,
      'price_cents', b.price_cents + b2.price_cents,
      'outbound_cents', b.price_cents,
      'return_cents', b2.price_cents,
      'hold_expires_at', b.hold_expires_at,
      'lines', lines,
      'class_key', c.key,
      'currency', b.currency
    );
  end if;

  return jsonb_build_object(
    'booking_id', b.id,
    'reference', b.reference,
    'base_cents', b.base_price_cents,
    'price_cents', b.price_cents,
    'hold_expires_at', b.hold_expires_at,
    'lines', lines,
    'class_key', c.key,
    'currency', b.currency
  );
end $$;

revoke all on function public.create_booking_from_quote(
  uuid, text, text, text, text, int, int, text, text, text[], text, text, text, text, text, text, text
) from public, anon, authenticated;
