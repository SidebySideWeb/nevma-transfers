-- 0025 Pricing rules for distance/hybrid pricing (B3 / BOOKING-V2-PLAN §3–4).
-- Kit called this 0018_pricing_rules; this repo already used 0018–0024.

-- ---------------------------------------------------------------------------
-- class_rates (append-only versions; current = latest valid_from per class_key)
-- ---------------------------------------------------------------------------
create table public.class_rates (
  id uuid primary key default gen_random_uuid(),
  class_key text not null references public.vehicle_classes(key),
  base_fare int not null check (base_fare >= 0),
  per_km int not null check (per_km >= 0),
  per_min int not null check (per_min >= 0),
  minimum_fare int not null check (minimum_fare >= 0),
  km_per_hour int not null default 40 check (km_per_hour > 0),
  extra_km_rate int not null default 0 check (extra_km_rate >= 0),
  valid_from timestamptz not null default now(),
  created_by uuid references public.staff(user_id),
  created_at timestamptz not null default now()
);

create index class_rates_class_valid_idx on public.class_rates (class_key, valid_from desc);

create view public.current_class_rates as
select distinct on (class_key)
  id, class_key, base_fare, per_km, per_min, minimum_fare, km_per_hour, extra_km_rate,
  valid_from, created_by, created_at
from public.class_rates
order by class_key, valid_from desc, created_at desc;

comment on table public.class_rates is 'Versioned per-class distance rates (cents). Saves insert a new row; never update.';
comment on view public.current_class_rates is 'Latest class_rates row per class_key.';

-- ---------------------------------------------------------------------------
-- pricing_settings (versioned JSON document)
-- ---------------------------------------------------------------------------
create function public.pricing_settings_valid(p jsonb) returns boolean
language plpgsql immutable as $$
declare
  night jsonb;
  waiting jsonb;
  demand jsonb;
  step jsonb;
  rounding int;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  if not (p ? 'night' and p ? 'stop_fee' and p ? 'waiting' and p ? 'rounding'
          and p ? 'return_discount_pct' and p ? 'quote_ttl_min' and p ? 'demand') then
    return false;
  end if;
  night := p->'night';
  if jsonb_typeof(night) <> 'object'
     or coalesce(night->>'from', '') !~ '^\d{2}:\d{2}$'
     or coalesce(night->>'to', '') !~ '^\d{2}:\d{2}$'
     or (night->>'factor')::numeric is null
     or (night->>'factor')::numeric < 1 then
    return false;
  end if;
  if jsonb_typeof(p->'stop_fee') <> 'number' or (p->>'stop_fee')::int < 0 then return false; end if;
  waiting := p->'waiting';
  if jsonb_typeof(waiting) <> 'object'
     or (waiting->>'airport_free_min')::int is null
     or (waiting->>'other_free_min')::int is null
     or (waiting->>'per_min')::int is null
     or (waiting->>'airport_free_min')::int < 0
     or (waiting->>'other_free_min')::int < 0
     or (waiting->>'per_min')::int < 0 then
    return false;
  end if;
  rounding := (p->>'rounding')::int;
  if rounding is distinct from 1 and rounding is distinct from 5 then return false; end if;
  if (p->>'return_discount_pct')::numeric is null
     or (p->>'return_discount_pct')::numeric < 0
     or (p->>'return_discount_pct')::numeric > 100 then
    return false;
  end if;
  if (p->>'quote_ttl_min')::int is null or (p->>'quote_ttl_min')::int < 1 then return false; end if;
  demand := p->'demand';
  if jsonb_typeof(demand) <> 'object'
     or jsonb_typeof(demand->'enabled') <> 'boolean'
     or jsonb_typeof(demand->'steps') <> 'array'
     or (demand->>'max')::numeric is null
     or (demand->>'max')::numeric < 1 then
    return false;
  end if;
  for step in select * from jsonb_array_elements(demand->'steps')
  loop
    if (step->>'over')::numeric is null or (step->>'factor')::numeric is null
       or (step->>'over')::numeric < 0 or (step->>'factor')::numeric < 1 then
      return false;
    end if;
  end loop;
  return true;
end $$;

create table public.pricing_settings (
  id uuid primary key default gen_random_uuid(),
  doc jsonb not null,
  valid_from timestamptz not null default now(),
  created_by uuid references public.staff(user_id),
  created_at timestamptz not null default now(),
  constraint pricing_settings_doc_check check (public.pricing_settings_valid(doc))
);

create view public.current_pricing_settings as
select *
from public.pricing_settings
order by valid_from desc, created_at desc
limit 1;

comment on table public.pricing_settings is 'Versioned pricing JSON (night, stop fee, waiting, rounding, demand, quote TTL).';

-- ---------------------------------------------------------------------------
-- pricing_periods / pricing_areas
-- ---------------------------------------------------------------------------
create table public.pricing_periods (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  starts_on date not null,
  ends_on date not null,
  factor numeric(6, 3) not null check (factor >= 1),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table public.pricing_areas (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  kind text not null check (kind in ('airport', 'port')),
  polygon jsonb not null,
  fee int not null default 0 check (fee >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.pricing_areas is 'Airport/port polygons (GeoJSON ring [lng,lat]) + fee in cents.';

-- ---------------------------------------------------------------------------
-- Seed: zero rates for every class; default settings; Attica airport/ports fee 0
-- ---------------------------------------------------------------------------
insert into public.class_rates (class_key, base_fare, per_km, per_min, minimum_fare, km_per_hour, extra_km_rate)
select key, 0, 0, 0, 0, 40, 0 from public.vehicle_classes;

insert into public.pricing_settings (doc) values (
  jsonb_build_object(
    'night', jsonb_build_object('from', '00:00', 'to', '06:00', 'factor', 1.2),
    'stop_fee', 0,
    'waiting', jsonb_build_object('airport_free_min', 60, 'other_free_min', 15, 'per_min', 0),
    'rounding', 1,
    'return_discount_pct', 0,
    'quote_ttl_min', 20,
    'demand', jsonb_build_object(
      'enabled', false,
      'steps', jsonb_build_array(
        jsonb_build_object('over', 0.7, 'factor', 1.1),
        jsonb_build_object('over', 0.9, 'factor', 1.2)
      ),
      'max', 1.25
    )
  )
);

-- Small mainland boxes (fee 0 until the office sets them). Rings are closed [lng, lat].
insert into public.pricing_areas (label, kind, polygon, fee) values
  ('LGAV', 'airport', '{"type":"Polygon","coordinates":[[[23.90,37.90],[24.00,37.90],[24.00,37.97],[23.90,37.97],[23.90,37.90]]]}'::jsonb, 0),
  ('Piraeus', 'port', '{"type":"Polygon","coordinates":[[[23.60,37.92],[23.68,37.92],[23.68,37.96],[23.60,37.96],[23.60,37.92]]]}'::jsonb, 0),
  ('Rafina', 'port', '{"type":"Polygon","coordinates":[[[24.00,38.00],[24.05,38.00],[24.05,38.04],[24.00,38.04],[24.00,38.00]]]}'::jsonb, 0),
  ('Lavrio', 'port', '{"type":"Polygon","coordinates":[[[24.04,37.70],[24.08,37.70],[24.08,37.73],[24.04,37.73],[24.04,37.70]]]}'::jsonb, 0);

-- ---------------------------------------------------------------------------
-- RLS: staff read/write; anon none
-- ---------------------------------------------------------------------------
alter table public.class_rates enable row level security;
alter table public.pricing_settings enable row level security;
alter table public.pricing_periods enable row level security;
alter table public.pricing_areas enable row level security;

revoke all on public.class_rates, public.pricing_settings, public.pricing_periods, public.pricing_areas from anon;
revoke all on public.current_class_rates, public.current_pricing_settings from anon;

grant select, insert, update, delete on public.class_rates, public.pricing_settings, public.pricing_periods, public.pricing_areas to authenticated;
grant select on public.current_class_rates, public.current_pricing_settings to authenticated;

create policy class_rates_staff_all on public.class_rates for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy pricing_settings_staff_all on public.pricing_settings for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy pricing_periods_staff_all on public.pricing_periods for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy pricing_areas_staff_all on public.pricing_areas for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
