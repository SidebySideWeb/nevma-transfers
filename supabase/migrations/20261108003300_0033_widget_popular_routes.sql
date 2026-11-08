-- 0033 Booking widget: popular routes in the expanded search panel (B4b).
-- Each zone gets a display place (the address the widget fills in when a route is picked).
-- Staff mark zone routes as "featured"; the site lists them with the lowest price.

-- ---------------------------------------------------------------------------
-- zones: the place a featured route fills into Pick-up / Drop-off
-- ---------------------------------------------------------------------------
alter table public.zones
  add column if not exists display_address text,
  add column if not exists display_place_id text,
  add column if not exists display_lat double precision,
  add column if not exists display_lng double precision,
  add column if not exists display_kind text;

alter table public.zones drop constraint if exists zones_display_place_ck;
alter table public.zones add constraint zones_display_place_ck check (
  (display_place_id is null and display_lat is null and display_lng is null)
  or (display_place_id is not null and display_address is not null
      and display_lat between 34 and 42 and display_lng between 19 and 30)
);
alter table public.zones drop constraint if exists zones_display_kind_ck;
alter table public.zones add constraint zones_display_kind_ck check (
  display_kind is null or display_kind in ('airport', 'port', 'station', 'hotel', 'area')
);

comment on column public.zones.display_address is
  'Address shown in the widget when a featured route is picked (e.g. "Athens International Airport (ATH)").';
comment on column public.zones.display_kind is 'Icon in the popular-routes list: airport, port, station, hotel, area.';

-- ---------------------------------------------------------------------------
-- zone_routes: featured flag + order
-- ---------------------------------------------------------------------------
alter table public.zone_routes
  add column if not exists featured boolean not null default false,
  add column if not exists featured_order int not null default 100;

create index if not exists zone_routes_featured_idx
  on public.zone_routes (featured_order) where featured;

-- ---------------------------------------------------------------------------
-- featured_routes: what the site shows (server reads it with the service role)
-- A route is listed only when both zones are active, both have a display place,
-- and at least one active, online class has a price above 0.
-- ---------------------------------------------------------------------------
create or replace view public.featured_routes
with (security_invoker = true) as
select
  r.from_zone_id,
  r.to_zone_id,
  fz.code  as from_code,
  fz.name  as from_name,
  fz.display_address as from_address,
  fz.display_place_id as from_place_id,
  fz.display_lat as from_lat,
  fz.display_lng as from_lng,
  fz.display_kind as from_kind,
  tz.code  as to_code,
  tz.name  as to_name,
  tz.display_address as to_address,
  tz.display_place_id as to_place_id,
  tz.display_lat as to_lat,
  tz.display_lng as to_lng,
  tz.display_kind as to_kind,
  r.duration_minutes,
  r.featured_order,
  min(p.price_cents) as from_price_cents
from public.zone_routes r
join public.zones fz on fz.id = r.from_zone_id and fz.active and fz.display_place_id is not null
join public.zones tz on tz.id = r.to_zone_id and tz.active and tz.display_place_id is not null
join public.zone_prices p on p.from_zone_id = r.from_zone_id and p.to_zone_id = r.to_zone_id and p.price_cents > 0
join public.vehicle_classes c on c.id = p.class_id and c.active
where r.featured
group by r.from_zone_id, r.to_zone_id, fz.code, fz.name, fz.display_address, fz.display_place_id,
         fz.display_lat, fz.display_lng, fz.display_kind, tz.code, tz.name, tz.display_address,
         tz.display_place_id, tz.display_lat, tz.display_lng, tz.display_kind,
         r.duration_minutes, r.featured_order
order by r.featured_order, fz.name, tz.name;

comment on view public.featured_routes is
  'Popular routes for the booking widget (B4b): featured zone routes with the lowest active class price.';

revoke all on public.featured_routes from anon;
grant select on public.featured_routes to authenticated;  -- staff via RLS on the base tables
