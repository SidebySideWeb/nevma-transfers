-- 0007 Rate limits, trip fields on holds, create_booking_from_hold.
-- Source: packages/db/migrations (sync to supabase/migrations with a later timestamp).

-- ---------------------------------------------------------------------------
-- Rate limits (fixed window). Service role only; no anon/staff policies.
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0 check (count >= 0),
  primary key (key, window_start)
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Returns true when the call is allowed; false when the limit is exceeded.
create or replace function public.hit_rate_limit(
  p_key text,
  p_window_seconds int,
  p_max int
) returns boolean
language plpgsql
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n int;
begin
  insert into public.rate_limits (key, window_start, count)
  values (p_key, w, 1)
  on conflict (key, window_start) do update
    set count = public.rate_limits.count + 1
  returning count into n;
  return n <= p_max;
end $$;

-- ---------------------------------------------------------------------------
-- Trip snapshot on holds so /api/bookings cannot change the search.
-- ---------------------------------------------------------------------------
alter table public.slot_holds
  add column if not exists booking_type public.booking_type,
  add column if not exists from_zone_id uuid references public.zones(id),
  add column if not exists to_zone_id uuid references public.zones(id),
  add column if not exists hours int,
  add column if not exists pickup_at timestamptz,
  add column if not exists duration_minutes int;

-- Replace create_hold (drop 4-arg form so the extended signature is unique).
drop function if exists public.create_hold(text, timestamptz, int, text);

create function public.create_hold(
  p_class_key text,
  p_pickup timestamptz,
  p_duration_minutes int,
  p_visitor_key text,
  p_booking_type public.booking_type default null,
  p_from_zone_id uuid default null,
  p_to_zone_id uuid default null,
  p_hours int default null
) returns public.slot_holds
language plpgsql
as $$
declare
  c public.vehicle_classes;
  r tstzrange;
  h public.slot_holds;
  active_for_visitor int;
begin
  select * into c from public.vehicle_classes where key = p_class_key and active for update;
  if not found then
    raise exception 'invalid_request: unknown vehicle class %', p_class_key;
  end if;

  select count(*) into active_for_visitor from public.slot_holds
   where visitor_key = p_visitor_key and status = 'active' and expires_at > now();
  if active_for_visitor >= public.setting_int('max_active_holds_per_visitor') then
    raise exception 'too_many_holds';
  end if;

  r := public.blocked_range_for(p_pickup, p_duration_minutes, c.buffer_minutes);
  if public.class_availability(c.id, r) < 1 then
    raise exception 'unavailable';
  end if;

  insert into public.slot_holds (
    class_id, visitor_key, blocked_range, expires_at,
    booking_type, from_zone_id, to_zone_id, hours, pickup_at, duration_minutes
  ) values (
    c.id, p_visitor_key, r, now() + make_interval(mins => public.setting_int('hold_minutes')),
    p_booking_type, p_from_zone_id, p_to_zone_id, p_hours, p_pickup, p_duration_minutes
  )
  returning * into h;
  return h;
end $$;

-- Visitor key on bookings (for /api/bookings/pay ownership checks).
alter table public.bookings
  add column if not exists visitor_key text;

create index if not exists bookings_visitor_idx on public.bookings (visitor_key);

-- ---------------------------------------------------------------------------
-- One-transaction booking creation from an active hold.
-- Returns jsonb: { booking_id, reference, base_cents, price_cents, hold_expires_at,
--   lines: [{ code, label, cents }], class_key, currency }
-- ---------------------------------------------------------------------------
create or replace function public.create_booking_from_hold(
  p_hold_id uuid,
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
  h public.slot_holds;
  c public.vehicle_classes;
  base int;
  total int;
  b public.bookings;
  lines jsonb := '[]'::jsonb;
  extra_code text;
  ex public.extras;
  inv public.invoice_status := 'not_required';
  rate public.hourly_rates;
begin
  select * into h from public.slot_holds where id = p_hold_id for update;
  if not found then
    raise exception 'invalid_request: hold not found';
  end if;
  if h.visitor_key is distinct from p_visitor_key then
    raise exception 'invalid_request: hold not yours';
  end if;
  if h.status <> 'active' or h.expires_at <= now() then
    raise exception 'invalid_request: hold ended';
  end if;
  if h.booking_type is null or h.from_zone_id is null or h.pickup_at is null or h.duration_minutes is null then
    raise exception 'invalid_request: hold missing trip data';
  end if;

  select * into c from public.vehicle_classes where id = h.class_id for update;
  if not found or not c.active then
    raise exception 'invalid_request: class unavailable';
  end if;

  if h.booking_type = 'transfer' then
    select zp.price_cents into base
      from public.zone_prices zp
     where zp.from_zone_id = h.from_zone_id
       and zp.to_zone_id = h.to_zone_id
       and zp.class_id = c.id;
    if base is null then
      raise exception 'no_price';
    end if;
  else
    select * into rate from public.hourly_rates where class_id = c.id;
    if not found then
      raise exception 'no_price';
    end if;
    if h.hours is null or h.hours < rate.min_hours or h.hours > rate.max_hours then
      raise exception 'invalid_request: hours out of range';
    end if;
    base := rate.price_per_hour_cents * h.hours;
  end if;

  total := base;
  lines := lines || jsonb_build_array(jsonb_build_object(
    'code', 'base',
    'label', c.name,
    'cents', base
  ));

  if p_extra_codes is not null then
    for extra_code in select distinct x from unnest(p_extra_codes) as t(x) where x is not null and x <> ''
    loop
      select e.* into ex from public.extras e where e.code = extra_code;
      if not found or not ex.active then
        raise exception 'invalid_request: unknown or inactive extra %', extra_code;
      end if;
      total := total + ex.price_cents;
      lines := lines || jsonb_build_array(jsonb_build_object(
        'code', ex.code,
        'label', ex.name,
        'cents', ex.price_cents
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
    visitor_key, cancel_token_hash
  ) values (
    h.booking_type, c.id, h.from_zone_id, h.to_zone_id,
    p_pickup_address,
    case when h.booking_type = 'transfer' then p_dropoff_address else null end,
    h.pickup_at, h.hours, h.duration_minutes, h.blocked_range,
    p_passengers, p_luggage, p_flight_number, p_customer_name, p_customer_email, p_customer_phone, p_notes,
    base, total, 'pending', h.expires_at, 'unpaid',
    inv, p_invoice_company, p_invoice_vat, p_invoice_tax_office, p_invoice_address,
    p_visitor_key, null
  ) returning * into b;

  if p_extra_codes is not null then
    for extra_code in select distinct x from unnest(p_extra_codes) as t(x) where x is not null and x <> ''
    loop
      select e.* into ex from public.extras e where e.code = extra_code;
      insert into public.booking_extras (booking_id, extra_id, quantity, price_cents)
      values (b.id, ex.id, 1, ex.price_cents);
    end loop;
  end if;

  update public.slot_holds
     set status = 'converted', booking_id = b.id
   where id = h.id;

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
