-- 0003 Bookings, booking extras, payments.

-- Blocked time for a trip: pickup minus buffer to pickup plus duration plus buffer.
-- Interval arithmetic in minutes on timestamptz is in real elapsed time, so DST changes are handled correctly.
create function public.blocked_range_for(p_pickup timestamptz, p_duration_minutes int, p_buffer_minutes int)
returns tstzrange
language sql immutable strict
as $$
  select tstzrange(
    p_pickup - make_interval(mins => p_buffer_minutes),
    p_pickup + make_interval(mins => p_duration_minutes + p_buffer_minutes),
    '[)'
  );
$$;

-- Booking reference: TEM- plus 6 characters without 0, O, 1, I. Not secret (the cancel token is).
create function public.generate_booking_reference()
returns text
language sql volatile
as $$
  select 'TEM-' || string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 6);
$$;

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default public.generate_booking_reference() check (reference ~ '^TEM-[A-HJ-NP-Z2-9]{6}$'),
  booking_type public.booking_type not null,
  class_id uuid not null references public.vehicle_classes(id),
  vehicle_id uuid references public.vehicles(id),          -- set by the office after confirmation
  from_zone_id uuid not null references public.zones(id),
  to_zone_id uuid references public.zones(id),             -- transfers only
  pickup_address text not null,
  dropoff_address text,                                     -- transfers only
  pickup_at timestamptz not null,
  hours int,                                                -- hourly only
  duration_minutes int not null check (duration_minutes > 0),
  blocked_range tstzrange not null,
  passengers int not null check (passengers > 0),
  luggage int not null default 0 check (luggage >= 0),
  flight_number text,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  notes text,
  base_price_cents int not null check (base_price_cents >= 0),   -- zone price or hourly rate x hours, copied at creation
  price_cents int not null check (price_cents >= 0),             -- total including extras
  currency char(3) not null default 'EUR',
  status public.booking_status not null default 'pending',
  hold_expires_at timestamptz,
  payment_status public.payment_status not null default 'unpaid',
  viva_order_code bigint unique,
  invoice_status public.invoice_status not null default 'not_required',
  invoice_company text,
  invoice_vat text,
  invoice_tax_office text,
  invoice_address text,
  invoice_number text,
  vip_security boolean not null default false,              -- kept in step with booking_extras by trigger
  security_notes text,                                      -- agents or partner, entered by the office
  cancel_token_hash text unique,                            -- SHA-256 of the cancel-link token
  reminder_sent_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint bookings_type_fields check (
    (booking_type = 'transfer' and to_zone_id is not null and dropoff_address is not null and hours is null and from_zone_id <> to_zone_id)
    or
    (booking_type = 'hourly' and hours is not null and hours between 1 and 24 and to_zone_id is null and dropoff_address is null
       and duration_minutes = hours * 60)
  ),
  constraint bookings_range_covers_trip check (
    lower(blocked_range) <= pickup_at and upper(blocked_range) >= pickup_at + make_interval(mins => duration_minutes)
  ),
  constraint bookings_price_covers_base check (price_cents >= base_price_cents),
  constraint bookings_no_vehicle_overlap exclude using gist (vehicle_id with =, blocked_range with &&)
    where (vehicle_id is not null and status in ('pending', 'confirmed', 'assigned'))
);
create index bookings_class_range_idx on public.bookings using gist (class_id, blocked_range);
create index bookings_pickup_idx on public.bookings (pickup_at);
create index bookings_status_idx on public.bookings (status);

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger bookings_touch before update on public.bookings for each row execute function public.touch_updated_at();

create table public.booking_extras (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  extra_id uuid not null references public.extras(id),
  quantity int not null default 1 check (quantity > 0),
  price_cents int not null check (price_cents >= 0),      -- copied at creation
  primary key (booking_id, extra_id)
);

-- Keep bookings.vip_security equal to "this booking has the vip-security extra".
create function public.sync_vip_security() returns trigger language plpgsql security definer set search_path = public as $$
declare
  b uuid := coalesce(new.booking_id, old.booking_id);
begin
  update public.bookings
     set vip_security = exists (
       select 1 from public.booking_extras be join public.extras e on e.id = be.extra_id
        where be.booking_id = b and e.code = 'vip-security')
   where id = b;
  return null;
end $$;
create trigger booking_extras_vip after insert or update or delete on public.booking_extras
  for each row execute function public.sync_vip_security();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  kind text not null check (kind in ('payment', 'refund')),
  status text not null check (status in ('pending', 'succeeded', 'failed')),
  amount_cents int not null check (amount_cents > 0),
  viva_order_code bigint,
  viva_transaction_id uuid unique,          -- duplicate webhooks cannot record twice
  idempotency_key text unique,              -- repeated refund requests return the first result
  raw jsonb not null default '{}'::jsonb,   -- verified Viva transaction; never log it
  created_by uuid,                          -- staff user for refunds from the admin
  created_at timestamptz not null default now()
);
create index payments_booking_idx on public.payments (booking_id);

-- Refunds (pending or succeeded) may never exceed what was paid. Locks the booking row to serialise refunds.
create function public.payments_refund_limit() returns trigger language plpgsql as $$
declare
  paid int;
  refunded int;
begin
  if new.kind <> 'refund' or new.status = 'failed' then
    return new;
  end if;
  perform 1 from public.bookings where id = new.booking_id for update;
  select coalesce(sum(amount_cents) filter (where kind = 'payment' and status = 'succeeded'), 0),
         coalesce(sum(amount_cents) filter (where kind = 'refund' and status in ('pending', 'succeeded')
                                             and id is distinct from new.id), 0)
    into paid, refunded
    from public.payments where booking_id = new.booking_id;
  if refunded + new.amount_cents > paid then
    raise exception 'refund_exceeds_paid: paid %, already refunded %, requested %', paid, refunded, new.amount_cents
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger payments_refund_limit before insert or update on public.payments
  for each row execute function public.payments_refund_limit();
