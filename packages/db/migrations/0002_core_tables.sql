-- 0002 Reference data: vehicle classes, vehicles, zones, routes, prices, hourly rates, extras, blocked slots.
-- Money is integer cents. Edits here never change existing bookings (prices are copied at creation).

create table public.vehicle_classes (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),   -- joins Sanity vehicleClass.key
  name text not null,                                                    -- internal name; public copy lives in Sanity
  max_passengers int not null check (max_passengers > 0),
  max_luggage int not null check (max_luggage >= 0),
  buffer_minutes int not null default 30 check (buffer_minutes between 0 and 240),
  sort_order int not null default 100,
  active boolean not null default true
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.vehicle_classes(id),
  label text not null,                       -- for example a plate or a fleet number
  status text not null default 'active' check (status in ('active', 'maintenance', 'retired'))
);
create index vehicles_class_idx on public.vehicles (class_id) where status = 'active';

create table public.zones (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  sort_order int not null default 100,
  active boolean not null default true
);

-- Directed: A->B and B->A are separate rows (durations and prices may differ).
create table public.zone_routes (
  from_zone_id uuid not null references public.zones(id),
  to_zone_id uuid not null references public.zones(id),
  duration_minutes int not null check (duration_minutes > 0),
  primary key (from_zone_id, to_zone_id),
  check (from_zone_id <> to_zone_id)
);

-- A price needs a route. A route without a price for a class means "no online price" (error no_price).
create table public.zone_prices (
  from_zone_id uuid not null,
  to_zone_id uuid not null,
  class_id uuid not null references public.vehicle_classes(id),
  price_cents int not null check (price_cents >= 0),
  currency char(3) not null default 'EUR',
  primary key (from_zone_id, to_zone_id, class_id),
  foreign key (from_zone_id, to_zone_id) references public.zone_routes(from_zone_id, to_zone_id) on delete cascade
);

create table public.hourly_rates (
  class_id uuid primary key references public.vehicle_classes(id),
  price_per_hour_cents int not null check (price_per_hour_cents >= 0),
  min_hours int not null default 3,
  max_hours int not null default 12,
  currency char(3) not null default 'EUR',
  check (min_hours >= 1 and max_hours >= min_hours and max_hours <= 24)
);

-- Extras, including 'night-surcharge' and 'vip-security'. One fixed price per booking.
create table public.extras (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  price_cents int not null check (price_cents >= 0),
  active boolean not null default true
);

create table public.blocked_slots (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  range tstzrange not null check (not isempty(range) and lower(range) is not null and upper(range) is not null),
  reason text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index blocked_slots_range_idx on public.blocked_slots using gist (vehicle_id, range);
