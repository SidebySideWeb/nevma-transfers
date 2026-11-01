-- 0014 Fields for the fleet and pricing feed (data/fleet-feed.json), decided by the user 1 Nov 2026.
-- Applies on kit 1 + 0011–0013; independent of 0009/0010. Rules: docs/FLEET-FEED.md.

-- Per-row DEMO flag: placeholders until the client confirms. The admin shows a DEMO badge and the launch
-- check (scripts/check-live-demo.mjs) fails while any active row is still DEMO.
alter table public.vehicle_classes add column if not exists is_demo boolean not null default false;
alter table public.vehicles        add column if not exists is_demo boolean not null default false;
alter table public.zones           add column if not exists is_demo boolean not null default false;
alter table public.zone_routes     add column if not exists is_demo boolean not null default false;
alter table public.zone_prices     add column if not exists is_demo boolean not null default false;
alter table public.hourly_rates    add column if not exists is_demo boolean not null default false;
alter table public.extras          add column if not exists is_demo boolean not null default false;

-- Vehicles: registration plate (staff only).
alter table public.vehicles add column if not exists plate text;

-- Zones: what kind of place (used for icons and grouping on the website).
alter table public.zones add column if not exists kind text not null default 'area'
  check (kind in ('airport', 'city', 'port', 'area', 'other'));

-- Extras: which booking types offer them, and how many a customer may add (child seats).
alter table public.extras add column if not exists applies_to text[] not null default array['transfer', 'hourly']
  check (applies_to <@ array['transfer', 'hourly'] and cardinality(applies_to) >= 1);
alter table public.extras add column if not exists max_quantity int not null default 1 check (max_quantity between 1 and 10);

-- Rows labelled DEMO by the kit's seed count as DEMO.
update public.vehicle_classes set is_demo = true where key like 'demo-%';
update public.vehicles set is_demo = true where label like 'DEMO %';
update public.zones set is_demo = true where code like 'demo-%';
update public.extras set is_demo = true where name like 'DEMO %';
update public.zone_routes r set is_demo = true from public.zones z where z.id in (r.from_zone_id, r.to_zone_id) and z.code like 'demo-%';
update public.zone_prices p set is_demo = true from public.vehicle_classes c where c.id = p.class_id and c.key like 'demo-%';
update public.hourly_rates h set is_demo = true from public.vehicle_classes c where c.id = h.class_id and c.key like 'demo-%';

-- What still blocks launch: active rows marked DEMO, by table. Staff only (security invoker).
create view public.demo_rows with (security_invoker = true) as
          select 'vehicle_classes'::text as table_name, count(*)::int as n from public.vehicle_classes where is_demo and active
union all select 'vehicles', count(*)::int from public.vehicles where is_demo and status = 'active'
union all select 'zones', count(*)::int from public.zones where is_demo and active
union all select 'zone_routes', count(*)::int from public.zone_routes where is_demo
union all select 'zone_prices', count(*)::int from public.zone_prices where is_demo
union all select 'hourly_rates', count(*)::int from public.hourly_rates where is_demo
union all select 'extras', count(*)::int from public.extras where is_demo and active
union all select 'settings', count(*)::int from public.settings where is_demo;
revoke all on public.demo_rows from anon;
grant select on public.demo_rows to authenticated;
