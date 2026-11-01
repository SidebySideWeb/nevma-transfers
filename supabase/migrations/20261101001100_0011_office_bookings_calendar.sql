-- 0011 Office (manual) bookings and the fleet calendar (decided by the user 1 Nov 2026).
-- Independent of 0009/0010: applies on kit 1 alone. Rules: docs/OFFICE-BOOKINGS.md.
--
-- Office bookings are created by the web app's signed internal route (POST /api/internal/bookings),
-- never by the admin directly: the server computes the price, holds the class and writes the booking with
-- the service role, exactly like an online booking. Staff choose per booking: a Viva payment link
-- (vehicle held until paid) or "paid offline" / "to collect offline".

-- 1. Booking origin, price override, offline payment method --------------------------------------
alter table public.bookings
  add column source text not null default 'online' check (source in ('online', 'office')),
  add column created_by uuid references public.staff(user_id),
  add column list_price_cents int check (list_price_cents >= 0),        -- price from the price list at creation
  add column price_override_reason text,
  add column payment_method text check (payment_method in ('viva', 'cash', 'bank_transfer', 'on_account'));

-- An office price may differ from the list (discount, special agreement) only with a stated reason.
alter table public.bookings add constraint bookings_override_needs_reason check (
  list_price_cents is null or list_price_cents = price_cents
  or (source = 'office' and coalesce(btrim(price_override_reason), '') <> '')
);
-- Online bookings: price must cover the base. Office bookings may be discounted below it (reason required above).
alter table public.bookings drop constraint bookings_price_covers_base;
alter table public.bookings add constraint bookings_price_covers_base check (source = 'office' or price_cents >= base_price_cents);
alter table public.bookings add constraint bookings_office_has_creator check (source = 'online' or created_by is not null);

-- Offline payments and refunds are recorded without Viva fields.
alter table public.payments
  add column method text not null default 'viva' check (method in ('viva', 'cash', 'bank_transfer', 'on_account')),
  add column note text;
alter table public.payments add constraint payments_viva_fields check (
  method = 'viva' or (viva_transaction_id is null and viva_order_code is null)
);

-- 2. Office holds: longer than the 20-minute online hold, no per-visitor limit -------------------
insert into public.settings (key, value, description, is_demo) values
  ('office_link_hold_minutes', '240', 'Minutes a vehicle stays held while the customer pays an office payment link. Must not exceed the Viva order timeout. DEMO until the office confirms.', true)
on conflict (key) do nothing;

create function public.create_office_hold(p_class_key text, p_pickup timestamptz, p_duration_minutes int, p_staff_user uuid, p_minutes int default null)
returns public.slot_holds
language plpgsql
as $$
declare
  c public.vehicle_classes;
  r tstzrange;
  h public.slot_holds;
begin
  if not exists (select 1 from public.staff where user_id = p_staff_user) then
    raise exception 'forbidden: not staff';
  end if;
  select * into c from public.vehicle_classes where key = p_class_key and active for update;   -- same class lock as create_hold
  if not found then
    raise exception 'invalid_request: unknown vehicle class %', p_class_key;
  end if;
  r := public.blocked_range_for(p_pickup, p_duration_minutes, c.buffer_minutes);
  if public.class_availability(c.id, r) < 1 then
    raise exception 'unavailable';
  end if;
  insert into public.slot_holds (class_id, visitor_key, blocked_range, expires_at)
  values (c.id, 'office:' || p_staff_user, r,
          now() + make_interval(mins => coalesce(p_minutes, public.setting_int('office_link_hold_minutes'))))
  returning * into h;
  return h;
end $$;
revoke all on function public.create_office_hold(text, timestamptz, int, uuid, int) from public, anon, authenticated;

-- 3. Fleet calendar ------------------------------------------------------------------------------
-- One row per thing that occupies time: assigned bookings (on their vehicle), bookings waiting for a
-- vehicle (vehicle_id null, shown in the class's "unassigned" lane), live holds and blocked slots.
-- security_invoker: staff see it through the RLS on the underlying tables; anyone else sees nothing.
create view public.calendar_items with (security_invoker = true) as
  select 'booking'::text as kind, b.id as booking_id, b.reference, b.class_id, b.vehicle_id, b.blocked_range as range,
         b.pickup_at, b.pickup_at + make_interval(mins => b.duration_minutes) as ends_at,
         b.status::text as status, b.booking_type::text as booking_type, b.customer_name as label,
         b.vip_security, b.source, null::text as reason
    from public.bookings b
   where b.status in ('confirmed', 'assigned', 'completed') or (b.status = 'pending' and b.hold_expires_at > now())
  union all
  select 'hold', h.booking_id, null, h.class_id, null, h.blocked_range, lower(h.blocked_range), upper(h.blocked_range),
         'held', null, null, false, case when h.visitor_key like 'office:%' then 'office' else 'online' end, null
    from public.slot_holds h
   where h.status = 'active' and h.expires_at > now() and h.booking_id is null
  union all
  select 'block', null, null, v.class_id, s.vehicle_id, s.range, lower(s.range), upper(s.range),
         'blocked', null, null, false, null, s.reason
    from public.blocked_slots s join public.vehicles v on v.id = s.vehicle_id;
revoke all on public.calendar_items from anon;
grant select on public.calendar_items to authenticated;

-- Free vehicles per class for each hour of an Athens day (the calendar's capacity strip).
create function public.class_free_by_hour(p_class_id uuid, p_day date)
returns table (hour_start timestamptz, free int)
language sql stable
as $$
  select hs, public.class_availability(p_class_id, tstzrange(hs, hs + interval '1 hour', '[)'))
    from generate_series(
           (p_day::timestamp at time zone 'Europe/Athens'),
           ((p_day + 1)::timestamp at time zone 'Europe/Athens') - interval '1 hour',
           interval '1 hour') as hs;
$$;
revoke all on function public.class_free_by_hour(uuid, date) from anon;

-- 4. Customers (kept now for future features: customer pages, history, repeat-booking shortcuts) ----
-- One row per customer, matched by e-mail (case-insensitive). Every booking, online or office, is linked
-- by trigger, so the web app needs no change. Personal data: covered by the privacy text and retention (O10).
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  phone text,
  company text,                 -- last invoice details used, for prefilling
  vat_number text,
  tax_office text,
  address text,
  notes text,                   -- staff only (preferences, VIP notes); never shown to the customer
  bookings_count int not null default 0,
  first_booking_at timestamptz,
  last_booking_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index customers_email_key on public.customers (lower(email));
create trigger customers_touch before update on public.customers for each row execute function public.touch_updated_at();

alter table public.bookings add column customer_id uuid references public.customers(id);
create index bookings_customer_idx on public.bookings (customer_id);

create function public.link_booking_customer() returns trigger language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
begin
  insert into public.customers as c (email, name, phone, company, vat_number, tax_office, address,
                                     bookings_count, first_booking_at, last_booking_at)
  values (lower(btrim(new.customer_email)), new.customer_name, new.customer_phone, new.invoice_company, new.invoice_vat,
          new.invoice_tax_office, new.invoice_address, 1, new.created_at, new.created_at)
  on conflict (lower(email)) do update set
    name = excluded.name,
    phone = coalesce(excluded.phone, c.phone),
    company = coalesce(excluded.company, c.company),
    vat_number = coalesce(excluded.vat_number, c.vat_number),
    tax_office = coalesce(excluded.tax_office, c.tax_office),
    address = coalesce(excluded.address, c.address),
    bookings_count = c.bookings_count + 1,
    last_booking_at = greatest(c.last_booking_at, excluded.last_booking_at)
  returning id into cid;
  new.customer_id := cid;
  return new;
end $$;
create trigger bookings_link_customer before insert on public.bookings
  for each row when (new.customer_id is null) execute function public.link_booking_customer();

-- Backfill bookings made before this migration.
insert into public.customers (email, name, phone, bookings_count, first_booking_at, last_booking_at)
select lower(btrim(customer_email)), (array_agg(customer_name order by created_at desc))[1],
       (array_agg(customer_phone order by created_at desc))[1], count(*), min(created_at), max(created_at)
  from public.bookings group by lower(btrim(customer_email))
on conflict do nothing;
update public.bookings b set customer_id = c.id from public.customers c
 where b.customer_id is null and lower(btrim(b.customer_email)) = lower(c.email);

alter table public.customers enable row level security;
create policy customers_staff_read on public.customers for select to authenticated using (public.is_staff());
create policy customers_staff_update on public.customers for update to authenticated using (public.is_staff()) with check (public.is_staff());
revoke all on public.customers from anon;
revoke insert, update, delete on public.customers from authenticated;
grant select on public.customers to authenticated;
grant update (name, phone, company, vat_number, tax_office, address, notes) on public.customers to authenticated;
