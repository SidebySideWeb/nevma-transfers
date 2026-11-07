-- 0026 Signed quotes + booking quote columns (B3 / BOOKING-V2-PLAN §4).
-- Kit called this 0019_quotes; this repo already used 0019–0025.
-- Hold window: create_hold already uses blocked_range_for(pickup, duration_minutes, buffer).
-- Pass Routes duration_min (or zone slot length) as p_duration_minutes — no SQL change needed.

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('transfer', 'hourly')),
  pickup_place_id text,
  pickup_lat double precision,
  pickup_lng double precision,
  pickup_address text,
  dropoff_place_id text,
  dropoff_lat double precision,
  dropoff_lng double precision,
  dropoff_address text,
  stops jsonb not null default '[]'::jsonb,
  pickup_at timestamptz not null,
  hours int check (hours is null or hours > 0),
  distance_km numeric(8, 1),
  duration_min int not null check (duration_min > 0),
  from_zone_code text,
  to_zone_code text,
  passengers int not null check (passengers > 0),
  luggage int not null check (luggage >= 0),
  prices jsonb not null,
  pricing_version jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  ip_hash text,
  constraint quotes_pickup_place_complete check (
    (pickup_place_id is null and pickup_lat is null and pickup_lng is null)
    or (pickup_place_id is not null and pickup_lat is not null and pickup_lng is not null)
  ),
  constraint quotes_dropoff_place_complete check (
    (dropoff_place_id is null and dropoff_lat is null and dropoff_lng is null)
    or (dropoff_place_id is not null and dropoff_lat is not null and dropoff_lng is not null)
  )
);

create index quotes_expires_idx on public.quotes (expires_at);

comment on table public.quotes is 'Signed fixed-price quotes (TTL from pricing_settings.quote_ttl_min). Server only.';

alter table public.bookings
  add column quote_id uuid references public.quotes(id),
  add column distance_km numeric(8, 1),
  add column duration_min int,
  add column price_breakdown jsonb;

comment on column public.bookings.quote_id is 'Quote this booking was sold from (distance/hybrid checkout).';
comment on column public.bookings.distance_km is 'Route distance when sold with distance pricing.';
comment on column public.bookings.duration_min is 'Driving (or hire) minutes used for the hold window.';
comment on column public.bookings.price_breakdown is 'Snapshot of quote breakdown lines at sale.';

-- Cleanup: delete expired quotes older than 7 days.
create or replace function public.cleanup_expired_quotes() returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  delete from public.quotes
   where expires_at < now() - interval '7 days';
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.cleanup_expired_quotes() from public, anon, authenticated;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'tem-cleanup-quotes',
      '15 3 * * *',
      'select public.cleanup_expired_quotes()'
    );
  end if;
exception when others then
  raise notice 'pg_cron schedule for quotes skipped: %', sqlerrm;
end $cron$;

alter table public.quotes enable row level security;
revoke all on public.quotes from anon, authenticated;
-- Staff may read quotes for support; writes are service_role only.
grant select on public.quotes to authenticated;
create policy quotes_staff_read on public.quotes for select to authenticated
  using (public.is_staff());

-- ---------------------------------------------------------------------------
-- create_booking_from_quote: sell the signed quote total (extras re-priced).
-- Raises: quote_expired, unavailable, no_price, invalid_request
-- Transfer quotes must carry from_zone_code / to_zone_code (zones or hybrid path).
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
  class_price jsonb;
  base_cents int;
  total int;
  breakdown jsonb;
  b public.bookings;
  r tstzrange;
  from_id uuid;
  to_id uuid;
  lines jsonb := '[]'::jsonb;
  extra_code text;
  qty int;
  line_cents int;
  ex public.extras;
  inv public.invoice_status := 'not_required';
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
  base_cents := coalesce((class_price->>'total')::int, 0);
  if base_cents <= 0 then
    raise exception 'no_price';
  end if;
  breakdown := coalesce(class_price->'breakdown', '[]'::jsonb);

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
    pickup_place_id, pickup_lat, pickup_lng, dropoff_place_id, dropoff_lat, dropoff_lng
  ) values (
    q.mode::public.booking_type, c.id, from_id, to_id,
    p_pickup_address,
    case when q.mode = 'transfer' then p_dropoff_address else null end,
    q.pickup_at, q.hours, q.duration_min, r,
    p_passengers, p_luggage, p_flight_number, p_customer_name, p_customer_email, p_customer_phone, p_notes,
    base_cents, total, 'pending', h.expires_at, 'unpaid',
    inv, p_invoice_company, p_invoice_vat, p_invoice_tax_office, p_invoice_address,
    p_visitor_key, q.id, q.distance_km, q.duration_min, breakdown,
    q.pickup_place_id, q.pickup_lat, q.pickup_lng, q.dropoff_place_id, q.dropoff_lat, q.dropoff_lng
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
