-- 0032 Booking v2 fixes after the review of 0024–0031 (FIX-1).
-- Does not edit earlier migrations. Safe to run once; every step can be re-run.
--
--  1  distance-priced trips without zones (bookings + holds + create_booking_from_quote)
--  2  rate views respect RLS (security_invoker)
--  3  corporate / security-definer functions: no PUBLIC or anon execute
--  4  return trip: outbound hold counted before the return window is checked
--  5  record_viva_payment: per-leg outcomes, worst outcome on top
--  6  shift_pickup: does not touch hold_expires_at
--  7  shift_pickup: respects blocked_slots
--  8  checkout: passengers / luggage checked against class and quote
--  9  return: total must equal outbound + return
-- 10  quotes.company_id; public checkout refuses company quotes
-- 11  tighter airport / port areas (verify on a map before go-live)
-- 12  admin_activity: actor must be the signed-in staff member
-- P3  rates/settings append-only; new classes get zero rates

-- ===========================================================================
-- 1. Bookings and holds may be priced by distance with no zones
-- ===========================================================================
alter table public.bookings alter column from_zone_id drop not null;

alter table public.bookings drop constraint if exists bookings_type_fields;
alter table public.bookings add constraint bookings_type_fields check (
  (
    booking_type = 'transfer' and hours is null and dropoff_address is not null
    and (
      -- zone-priced: both zones, different
      (from_zone_id is not null and to_zone_id is not null and from_zone_id <> to_zone_id)
      -- distance-priced: both ends located and a route distance
      or (distance_km is not null and pickup_lat is not null and dropoff_lat is not null)
    )
  )
  or (
    booking_type = 'hourly' and hours is not null and hours between 1 and 24
    and to_zone_id is null and dropoff_address is null and duration_minutes = hours * 60
    and (from_zone_id is not null or pickup_lat is not null)
  )
);

-- slot_holds zone columns (added in an earlier repo migration) may be NOT NULL.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'slot_holds'
                and column_name = 'from_zone_id' and is_nullable = 'NO') then
    alter table public.slot_holds alter column from_zone_id drop not null;
  end if;
end $$;

-- ===========================================================================
-- 10. Quotes can belong to a company
-- ===========================================================================
alter table public.quotes add column if not exists company_id uuid references public.companies(id);
create index if not exists quotes_company_idx on public.quotes (company_id) where company_id is not null;
comment on column public.quotes.company_id is
  'Set for business-area quotes (company prices). The public checkout refuses these.';

-- ===========================================================================
-- 1, 4, 8, 9, 10. create_booking_from_quote (public checkout)
-- ===========================================================================
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
  by_distance boolean;
begin
  select * into q from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'invalid_request: unknown quote';
  end if;
  if q.expires_at <= now() then
    raise exception 'quote_expired';
  end if;
  -- 10: company quotes are sold only through the business checkout
  if q.company_id is not null then
    raise exception 'invalid_request: company quote';
  end if;

  select * into c from public.vehicle_classes where key = p_class_key and active for update;
  if not found then
    raise exception 'invalid_request: unknown vehicle class %', p_class_key;
  end if;

  -- 8: party size must match the quote and fit the class
  if p_passengers is distinct from q.passengers or p_luggage is distinct from q.luggage then
    raise exception 'invalid_request: passengers or luggage differ from the quote';
  end if;
  if q.passengers > c.max_passengers or q.luggage > c.max_luggage then
    raise exception 'invalid_request: class % takes % passengers and % suitcases',
      c.key, c.max_passengers, c.max_luggage;
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
    -- 9: what the customer saw must be what Viva charges
    if total_cents <> outbound_cents + return_cents then
      raise exception 'no_price: total % <> outbound % + return %', total_cents, outbound_cents, return_cents;
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

  -- 1: zones are optional for distance-priced quotes
  if q.from_zone_code is not null then
    select id into from_id from public.zones where code = q.from_zone_code and active;
  end if;
  if q.to_zone_code is not null then
    select id into to_id from public.zones where code = q.to_zone_code and active;
  end if;

  if q.mode = 'transfer' then
    by_distance := q.distance_km is not null and q.pickup_lat is not null and q.dropoff_lat is not null;
    if not by_distance then
      if from_id is null or to_id is null or from_id = to_id then
        raise exception 'invalid_request: quote missing zones';
      end if;
    elsif from_id is not null and from_id = to_id then
      -- same zone at both ends: keep the addresses, drop the zones
      from_id := null;
      to_id := null;
    end if;
  else
    to_id := null;
    if from_id is null and q.pickup_lat is null then
      raise exception 'invalid_request: quote missing pick-up zone or place';
    end if;
    if has_return then
      raise exception 'invalid_request: return not offered for hourly';
    end if;
  end if;

  r := public.blocked_range_for(q.pickup_at, q.duration_min, c.buffer_minutes);
  if public.class_availability(c.id, r) < 1 then
    raise exception 'unavailable';
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
    r2 := public.blocked_range_for(q.return_pickup_at, ret_duration, c.buffer_minutes);
    -- 4: checked after the outbound hold exists, so it is counted
    if public.class_availability(c.id, r2) < 1 then
      raise exception 'unavailable';
    end if;
    group_id := gen_random_uuid();

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
    q.passengers, q.luggage, p_flight_number, p_customer_name, p_customer_email, p_customer_phone, p_notes,
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
      q.passengers, q.luggage, q.return_flight_number, p_customer_name, p_customer_email, p_customer_phone, p_notes,
      return_cents, return_cents, 'pending', h.expires_at, 'unpaid',
      'not_required', p_visitor_key, q.id, coalesce(q.return_distance_km, q.distance_km), ret_duration, return_breakdown,
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

-- ===========================================================================
-- 2. Rate views run with the caller's rights (staff-only RLS applies)
-- ===========================================================================
alter view public.current_class_rates set (security_invoker = true);
alter view public.current_pricing_settings set (security_invoker = true);

-- ===========================================================================
-- 3. No PUBLIC / anon execute on security-definer helpers
-- ===========================================================================
-- Every security-definer function in public (not trigger functions) that anon
-- can run: anon loses it; signed-in users keep it, so RLS helpers still work.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and p.prorettype <> 'trigger'::regtype
       and has_function_privilege('anon', p.oid, 'execute')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

-- Corporate money functions take any company id: server (service role) only.
revoke all on function public.company_open_balance_cents(uuid) from public, anon, authenticated;
revoke all on function public.company_statement_total_cents(uuid, date, date) from public, anon, authenticated;
grant execute on function public.company_open_balance_cents(uuid) to service_role;
grant execute on function public.company_statement_total_cents(uuid, date, date) to service_role;

-- Balance for the signed-in company only (business area).
create or replace function public.my_company_open_balance_cents() returns int
language sql stable security definer set search_path = public
as $$
  select case when public.current_company_id() is null then null
              else public.company_open_balance_cents(public.current_company_id()) end
$$;
revoke all on function public.my_company_open_balance_cents() from public, anon;
grant execute on function public.my_company_open_balance_cents() to authenticated, service_role;

-- ===========================================================================
-- 5. record_viva_payment: per-leg outcomes
-- ===========================================================================
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
  leg_outcome text;
  outcome text := 'not_pending';
  expected int := 0;
  group_id uuid;
  confirmed_refs text[] := '{}';
  legs jsonb := '[]'::jsonb;
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
    return jsonb_build_object('outcome', 'amount_mismatch', 'reference', b.reference, 'booking_id', b.id);
  end if;

  if exists (
    select 1 from public.payments
     where viva_transaction_id = p_transaction_id and booking_id = b.id
  ) then
    return jsonb_build_object('outcome', 'duplicate', 'reference', b.reference, 'booking_id', b.id);
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
      leg_outcome := 'not_pending';
    elsif b.hold_expires_at is not null and b.hold_expires_at > now() then
      update public.bookings set status = 'confirmed', payment_status = 'paid' where id = b.id;
      leg_outcome := 'confirmed';
    else
      free := public.class_availability(b.class_id, b.blocked_range, b.id);
      if free > 0 then
        update public.bookings set status = 'confirmed', payment_status = 'paid' where id = b.id;
        leg_outcome := 'confirmed';
      else
        update public.bookings set payment_status = 'paid' where id = b.id;
        leg_outcome := 'late_unavailable';
      end if;
    end if;

    -- worst outcome wins: late_unavailable > confirmed > not_pending
    if leg_outcome = 'late_unavailable'
       or (leg_outcome = 'confirmed' and outcome = 'not_pending') then
      outcome := leg_outcome;
    end if;
    if leg_outcome <> 'not_pending' then
      confirmed_refs := confirmed_refs || b.reference;
    end if;
    legs := legs || jsonb_build_array(jsonb_build_object(
      'booking_id', b.id, 'reference', b.reference, 'leg', b.leg, 'outcome', leg_outcome
    ));
    first_ref := coalesce(first_ref, b.reference);
    first_id := coalesce(first_id, b.id);
  end loop;

  return jsonb_build_object(
    'outcome', outcome,
    'reference', first_ref,
    'booking_id', first_id,
    'price_cents', expected,
    'references', to_jsonb(confirmed_refs),
    'legs', legs,
    'trip_group_id', group_id
  );
end $$;

-- ===========================================================================
-- 6, 7. shift_pickup
-- ===========================================================================
create or replace function public.shift_pickup(
  p_booking_id uuid,
  p_new_pickup timestamptz,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  c public.vehicle_classes;
  new_range tstzrange;
  shift_min int;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if b.status in ('cancelled', 'expired', 'completed') then
    return jsonb_build_object('ok', false, 'reason', 'bad_status');
  end if;
  if p_new_pickup is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_pickup');
  end if;

  select * into c from public.vehicle_classes where id = b.class_id;
  new_range := public.blocked_range_for(p_new_pickup, b.duration_minutes, c.buffer_minutes);

  if b.vehicle_id is not null and (
    exists (
      select 1 from public.bookings o
       where o.vehicle_id = b.vehicle_id
         and o.id is distinct from b.id
         and o.status not in ('cancelled', 'expired')
         and o.blocked_range && new_range
    )
    -- 7: vehicle blocked (maintenance, private use)
    or exists (
      select 1 from public.blocked_slots s
       where s.vehicle_id = b.vehicle_id and s.range && new_range
    )
  ) then
    return jsonb_build_object('ok', false, 'reason', 'conflict');
  end if;

  if public.class_availability(b.class_id, new_range, b.id) < 1 then
    return jsonb_build_object('ok', false, 'reason', 'conflict');
  end if;

  if b.original_pickup_at is null then
    update public.bookings set original_pickup_at = pickup_at where id = b.id;
    b.original_pickup_at := b.pickup_at;
  end if;

  shift_min := greatest(
    0,
    round(extract(epoch from (p_new_pickup - coalesce(b.original_pickup_at, b.pickup_at))) / 60.0)::int
  );

  -- 6: hold_expires_at (time left to pay) is not changed
  update public.bookings
     set pickup_at = p_new_pickup,
         blocked_range = new_range,
         pickup_shift_min = shift_min
   where id = b.id;

  update public.slot_holds
     set blocked_range = new_range,
         pickup_at = p_new_pickup,
         duration_minutes = b.duration_minutes
   where booking_id = b.id
     and status in ('active', 'converted');

  insert into public.booking_events (booking_id, kind, source, note)
  values (
    b.id,
    'pickup_shifted',
    'system',
    coalesce(p_reason, 'pickup_shifted')
      || ' · '
      || to_char(b.pickup_at at time zone 'Europe/Athens', 'HH24:MI')
      || ' → '
      || to_char(p_new_pickup at time zone 'Europe/Athens', 'HH24:MI')
  );

  return jsonb_build_object(
    'ok', true,
    'pickup_at', p_new_pickup,
    'previous_pickup_at', b.pickup_at,
    'original_pickup_at', coalesce(b.original_pickup_at, b.pickup_at),
    'shift_min', shift_min
  );
end $$;

revoke all on function public.shift_pickup(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.shift_pickup(uuid, timestamptz, text) to service_role;

-- ===========================================================================
-- 11. Tighter airport / port areas (approximate: check each on a map)
--     LGAV: terminal + forecourt only (Spata / Markopoulo homes stay outside)
--     Piraeus: passenger port gates along the basin (city blocks stay outside)
-- ===========================================================================
update public.pricing_areas set polygon =
  '{"type":"Polygon","coordinates":[[[23.9380,37.9310],[23.9520,37.9310],[23.9520,37.9420],[23.9380,37.9420],[23.9380,37.9310]]]}'::jsonb
 where label = 'LGAV';
update public.pricing_areas set polygon =
  '{"type":"Polygon","coordinates":[[[23.6200,37.9370],[23.6420,37.9370],[23.6420,37.9520],[23.6200,37.9520],[23.6200,37.9370]]]}'::jsonb
 where label = 'Piraeus';
update public.pricing_areas set polygon =
  '{"type":"Polygon","coordinates":[[[24.0050,38.0180],[24.0160,38.0180],[24.0160,38.0250],[24.0050,38.0250],[24.0050,38.0180]]]}'::jsonb
 where label = 'Rafina';
update public.pricing_areas set polygon =
  '{"type":"Polygon","coordinates":[[[24.0540,37.7070],[24.0660,37.7070],[24.0660,37.7160],[24.0540,37.7160],[24.0540,37.7070]]]}'::jsonb
 where label = 'Lavrio';

-- ===========================================================================
-- 12. Audit log: the signed-in staff member only
-- ===========================================================================
drop policy if exists admin_activity_staff_select on public.admin_activity;
drop policy if exists admin_activity_staff_insert on public.admin_activity;
create policy admin_activity_staff_select on public.admin_activity
  for select to authenticated using (public.is_staff());
create policy admin_activity_staff_insert on public.admin_activity
  for insert to authenticated
  with check (public.is_staff() and actor_id = auth.uid());

-- ===========================================================================
-- P3. Rates and settings are append-only; new classes get zero rates
-- ===========================================================================
revoke update, delete on public.class_rates, public.pricing_settings from authenticated;

-- A class that was never used can still be renamed or deleted (setup guards in 0012):
-- its rate rows follow it.
alter table public.class_rates drop constraint if exists class_rates_class_key_fkey;
alter table public.class_rates add constraint class_rates_class_key_fkey
  foreign key (class_key) references public.vehicle_classes(key) on update cascade on delete cascade;

create or replace function public.seed_class_rates() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.class_rates (class_key, base_fare, per_km, per_min, minimum_fare, km_per_hour, extra_km_rate)
  select new.key, 0, 0, 0, 0, 40, 0
   where not exists (select 1 from public.class_rates where class_key = new.key);
  return new;
end $$;

drop trigger if exists vehicle_classes_seed_rates on public.vehicle_classes;
create trigger vehicle_classes_seed_rates
  after insert on public.vehicle_classes
  for each row execute function public.seed_class_rates();

comment on column public.bookings.duration_min is
  'Copy of duration_minutes written by quote checkout. duration_minutes is the source of truth.';
