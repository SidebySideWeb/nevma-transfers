-- 0015 Extras quantity and applies_to in create_booking_from_hold (prompt 5 / FLEET-FEED).
-- Callers pass each extra code once per unit (e.g. child-seat twice → quantity 2).
-- Rejects quantity above max_quantity and extras whose applies_to excludes the hold's booking type.

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
  qty int;
  line_cents int;
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
      if not (h.booking_type = any (ex.applies_to)) then
        raise exception 'invalid_request: extra % not offered for %', extra_code, h.booking_type;
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
