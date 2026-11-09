-- 0037 Saved places and saved routes (fewer Google calls). (Kit name: 0035; renumbered for this repo.)
--  saved_places       our own address library. Only PUBLIC places (airports, ports, hotels,
--                     areas, approved by the office) are ever suggested to customers.
--                     Places learnt from quotes and bookings stay PRIVATE: used for route
--                     look-ups only, never shown to anyone else.
--  saved_routes       place -> place, distance (km), use count, featured flag.
--  saved_route_times  driving time per time band (weekday_peak, weekday_normal, night, weekend).
-- The quote API asks the library first and calls Google only for what is missing, then
-- stores the answer (record_route). Confirmed bookings raise usage counts (trigger).

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function public.geo_distance_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8 language sql immutable parallel safe as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;

-- Athens local time bands. Night wins over weekend; weekend wins over rush hours.
create or replace function public.time_band(p_at timestamptz)
returns text language plpgsql stable as $$
declare
  local_ts timestamp := p_at at time zone 'Europe/Athens';
  h int := extract(hour from local_ts);
  dow int := extract(isodow from local_ts);
begin
  if h >= 23 or h < 6 then return 'night'; end if;
  if dow in (6, 7) then return 'weekend'; end if;
  if (h >= 7 and h < 10) or (h >= 16 and h < 20) then return 'weekday_peak'; end if;
  return 'weekday_normal';
end $$;

-- ---------------------------------------------------------------------------
-- saved_places
-- ---------------------------------------------------------------------------
create table if not exists public.saved_places (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(label) between 1 and 200),
  address text not null check (length(address) between 1 and 300),
  place_id text unique,
  lat double precision not null check (lat between 34 and 42),
  lng double precision not null check (lng between 19 and 30),
  kind text not null default 'address'
    check (kind in ('airport', 'port', 'station', 'hotel', 'area', 'venue', 'address')),
  is_public boolean not null default false,
  pinned boolean not null default false,
  hidden boolean not null default false,
  source text not null default 'quote' check (source in ('office', 'zone', 'quote', 'booking')),
  use_count int not null default 0 check (use_count >= 0),
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- an "address" (a home, a villa) can never be public
  constraint saved_places_public_kind check (not is_public or kind <> 'address')
);
create index if not exists saved_places_latlng_idx on public.saved_places (lat, lng);
create index if not exists saved_places_public_idx on public.saved_places (is_public, hidden)
  where is_public and not hidden;
create index if not exists saved_places_label_idx on public.saved_places (lower(label) text_pattern_ops);

comment on table public.saved_places is
  'Address library. Public places are suggested in the widget; private ones (from quotes and bookings) are only used to find saved routes.';

-- Nearest saved place within p_max_m metres (private ones included: used for routing only).
create or replace function public.nearest_saved_place(p_lat float8, p_lng float8, p_max_m float8 default 150)
returns uuid language sql stable as $$
  select id from public.saved_places
   where not hidden
     and lat between p_lat - p_max_m / 111000.0 and p_lat + p_max_m / 111000.0
     and lng between p_lng - p_max_m / 88000.0  and p_lng + p_max_m / 88000.0
     and public.geo_distance_m(p_lat, p_lng, lat, lng) <= p_max_m
   order by public.geo_distance_m(p_lat, p_lng, lat, lng)
   limit 1
$$;

-- Find or create the place for a picked address. Match: same Google place ID, else a saved
-- place within p_snap_m metres, else a new PRIVATE place. Returns its id.
create or replace function public.resolve_place(
  p_place_id text, p_address text, p_lat float8, p_lng float8,
  p_source text default 'quote', p_snap_m float8 default 150
) returns uuid language plpgsql as $$
declare
  pid uuid;
begin
  if p_place_id is not null then
    select id into pid from public.saved_places where place_id = p_place_id;
  end if;
  if pid is null then
    pid := public.nearest_saved_place(p_lat, p_lng, p_snap_m);
  end if;
  if pid is null then
    insert into public.saved_places (label, address, place_id, lat, lng, kind, source)
    values (left(coalesce(nullif(split_part(p_address, ',', 1), ''), p_address), 200), left(p_address, 300),
            p_place_id, p_lat, p_lng, 'address', p_source)
    on conflict (place_id) do update set last_used_at = now()
    returning id into pid;
  else
    update public.saved_places set last_used_at = now() where id = pid;
  end if;
  return pid;
end $$;

-- Widget suggestions: PUBLIC places only. Prefix match on label or address words.
create or replace function public.search_saved_places(p_q text, p_limit int default 8)
returns table (id uuid, label text, address text, place_id text, lat float8, lng float8, kind text)
language sql stable as $$
  select p.id, p.label, p.address, p.place_id, p.lat, p.lng, p.kind
    from public.saved_places p
   where p.is_public and not p.hidden
     and length(trim(coalesce(p_q, ''))) >= 2
     and (lower(p.label) like lower(trim(p_q)) || '%'
          or lower(p.label) like '% ' || lower(trim(p_q)) || '%'
          or lower(p.address) like '%' || lower(trim(p_q)) || '%')
   order by p.pinned desc,
            (lower(p.label) like lower(trim(p_q)) || '%') desc,
            p.use_count desc, p.label
   limit greatest(1, least(coalesce(p_limit, 8), 20))
$$;

-- ---------------------------------------------------------------------------
-- saved_routes + saved_route_times
-- ---------------------------------------------------------------------------
create table if not exists public.saved_routes (
  id uuid primary key default gen_random_uuid(),
  from_place uuid not null references public.saved_places(id) on delete cascade,
  to_place uuid not null references public.saved_places(id) on delete cascade,
  distance_km numeric(8, 1) check (distance_km is null or distance_km > 0),
  use_count int not null default 0 check (use_count >= 0),
  featured boolean not null default false,
  featured_order int not null default 100,
  hidden boolean not null default false,
  last_used_at timestamptz not null default now(),
  distance_refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (from_place, to_place),
  check (from_place <> to_place)
);
create index if not exists saved_routes_from_idx on public.saved_routes (from_place, use_count desc);

create table if not exists public.saved_route_times (
  route_id uuid not null references public.saved_routes(id) on delete cascade,
  band text not null check (band in ('weekday_peak', 'weekday_normal', 'night', 'weekend')),
  duration_min int not null check (duration_min > 0),
  source text not null default 'google' check (source in ('google', 'office', 'booking')),
  refreshed_at timestamptz not null default now(),
  primary key (route_id, band)
);

comment on table public.saved_routes is 'Saved place-to-place routes: distance, usage, featured flag.';
comment on table public.saved_route_times is 'Driving time per time band for a saved route.';

-- Store (or refresh) what Google returned for a route and band. Returns the route id.
create or replace function public.record_route(
  p_from uuid, p_to uuid, p_band text, p_distance_km numeric, p_duration_min int,
  p_source text default 'google'
) returns uuid language plpgsql as $$
declare
  rid uuid;
begin
  insert into public.saved_routes (from_place, to_place, distance_km, distance_refreshed_at)
  values (p_from, p_to, round(p_distance_km, 1), case when p_distance_km is null then null else now() end)
  on conflict (from_place, to_place) do update
     set distance_km = coalesce(round(excluded.distance_km, 1), public.saved_routes.distance_km),
         distance_refreshed_at = case when excluded.distance_km is null
                                      then public.saved_routes.distance_refreshed_at else now() end
  returning id into rid;

  if p_band is not null and p_duration_min is not null then
    insert into public.saved_route_times (route_id, band, duration_min, source, refreshed_at)
    values (rid, p_band, p_duration_min, p_source, now())
    on conflict (route_id, band) do update
       set duration_min = case
             -- an office value is never overwritten by Google or a booking
             when public.saved_route_times.source = 'office' and excluded.source <> 'office'
               then public.saved_route_times.duration_min
             else excluded.duration_min end,
           source = case
             when public.saved_route_times.source = 'office' and excluded.source <> 'office'
               then 'office' else excluded.source end,
           refreshed_at = now();
  end if;
  return rid;
end $$;

-- What the quote API asks first. No row = unknown route (call Google, then record_route).
--   has_band  = a time for this band is stored (no Google call needed)
--   fallback_min = the longest stored time of any band (used only if Google fails)
--   stale     = distance or this band older than p_max_age_days (refresh in the nightly job)
create or replace function public.route_estimate(
  p_from uuid, p_to uuid, p_pickup timestamptz, p_max_age_days int default 60
) returns table (route_id uuid, distance_km numeric, band text, duration_min int,
                 has_band boolean, fallback_min int, stale boolean)
language sql stable as $$
  with r as (
    select * from public.saved_routes
     where from_place = p_from and to_place = p_to and not hidden
  ), b as (select public.time_band(p_pickup) as band)
  select r.id, r.distance_km, b.band, t.duration_min,
         (t.duration_min is not null and r.distance_km is not null) as has_band,
         (select max(x.duration_min) from public.saved_route_times x where x.route_id = r.id) as fallback_min,
         (r.distance_refreshed_at is null
          or r.distance_refreshed_at < now() - make_interval(days => p_max_age_days)
          or t.refreshed_at is null
          or t.refreshed_at < now() - make_interval(days => p_max_age_days)) as stale
    from r cross join b
    left join public.saved_route_times t on t.route_id = r.id and t.band = b.band
$$;

-- "Popular from <place>" for the To field: destinations that are PUBLIC places.
create or replace function public.popular_destinations(p_from uuid, p_limit int default 8)
returns table (route_id uuid, to_place uuid, label text, address text, place_id text,
               lat float8, lng float8, kind text, distance_km numeric, normal_min int)
language sql stable as $$
  select r.id, p.id, p.label, p.address, p.place_id, p.lat, p.lng, p.kind, r.distance_km,
         (select t.duration_min from public.saved_route_times t
           where t.route_id = r.id and t.band = 'weekday_normal')
    from public.saved_routes r
    join public.saved_places p on p.id = r.to_place and p.is_public and not p.hidden
   where r.from_place = p_from and not r.hidden
   order by r.featured desc, r.featured_order, r.use_count desc, p.label
   limit greatest(1, least(coalesce(p_limit, 8), 20))
$$;

-- Popular routes for an empty field: both ends PUBLIC.
create or replace function public.popular_routes(p_limit int default 8)
returns table (route_id uuid, from_place uuid, from_label text, from_address text, from_place_id text,
               from_lat float8, from_lng float8, from_kind text,
               to_place uuid, to_label text, to_address text, to_place_id text,
               to_lat float8, to_lng float8, to_kind text,
               distance_km numeric, normal_min int)
language sql stable as $$
  select r.id, f.id, f.label, f.address, f.place_id, f.lat, f.lng, f.kind,
         t.id, t.label, t.address, t.place_id, t.lat, t.lng, t.kind,
         r.distance_km,
         (select x.duration_min from public.saved_route_times x
           where x.route_id = r.id and x.band = 'weekday_normal')
    from public.saved_routes r
    join public.saved_places f on f.id = r.from_place and f.is_public and not f.hidden
    join public.saved_places t on t.id = r.to_place and t.is_public and not t.hidden
   where not r.hidden
   order by r.featured desc, r.featured_order, r.use_count desc
   limit greatest(1, least(coalesce(p_limit, 8), 20))
$$;

-- Routes the nightly job should fill or refresh: most used first, capped.
create or replace function public.routes_to_refresh(p_limit int default 50, p_max_age_days int default 60)
returns table (route_id uuid, from_place uuid, to_place uuid, band text)
language sql stable as $$
  select r.id, r.from_place, r.to_place, b.band
    from public.saved_routes r
    cross join (values ('weekday_peak'), ('weekday_normal'), ('night'), ('weekend')) as b(band)
    left join public.saved_route_times t on t.route_id = r.id and t.band = b.band
   where not r.hidden
     and r.use_count >= 2
     and (t.route_id is null
          or (t.source <> 'office' and t.refreshed_at < now() - make_interval(days => p_max_age_days)))
   order by r.featured desc, r.use_count desc, (t.route_id is null) desc
   limit greatest(1, least(coalesce(p_limit, 50), 500))
$$;

-- ---------------------------------------------------------------------------
-- Confirmed bookings raise usage (places and route), and teach distance/time.
-- ---------------------------------------------------------------------------
create or replace function public.saved_routes_learn_from_booking()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  fp uuid;
  tp uuid;
  rid uuid;
begin
  if new.status <> 'confirmed' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'confirmed' then return new; end if;
  if new.pickup_lat is null then return new; end if;

  fp := public.resolve_place(new.pickup_place_id, new.pickup_address, new.pickup_lat, new.pickup_lng, 'booking');
  update public.saved_places set use_count = use_count + 1, last_used_at = now() where id = fp;

  if new.booking_type = 'transfer' and new.dropoff_lat is not null then
    tp := public.resolve_place(new.dropoff_place_id, new.dropoff_address, new.dropoff_lat, new.dropoff_lng, 'booking');
    update public.saved_places set use_count = use_count + 1, last_used_at = now() where id = tp;
    if tp is distinct from fp then
      -- distance/time only from a distance-priced quote (real route data)
      if new.quote_id is not null and new.distance_km is not null and new.duration_min is not null then
        rid := public.record_route(fp, tp, public.time_band(new.pickup_at), new.distance_km, new.duration_min, 'booking');
      else
        rid := public.record_route(fp, tp, null, null, null, 'booking');
      end if;
      update public.saved_routes set use_count = use_count + 1, last_used_at = now() where id = rid;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists bookings_saved_routes_learn on public.bookings;
create trigger bookings_saved_routes_learn
  after insert or update of status on public.bookings
  for each row execute function public.saved_routes_learn_from_booking();

-- ---------------------------------------------------------------------------
-- Seed: zones with a widget address (0033) become public pinned places;
-- featured zone routes become featured saved routes (distance filled on first use).
-- ---------------------------------------------------------------------------
do $seed$
begin
  -- only when the widget migration (zones.display_*, zone_routes.featured) has run
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'zones' and column_name = 'display_place_id')
     and exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'zone_routes' and column_name = 'featured') then
    execute $q$
      insert into public.saved_places (label, address, place_id, lat, lng, kind, is_public, pinned, source)
      select z.name, z.display_address, z.display_place_id, z.display_lat, z.display_lng,
             coalesce(nullif(z.display_kind, ''), 'area'), true, true, 'zone'
        from public.zones z
       where z.active and z.display_place_id is not null
      on conflict (place_id) do nothing
    $q$;
    execute $q$
      insert into public.saved_routes (from_place, to_place, featured, featured_order)
      select fp.id, tp.id, true, r.featured_order
        from public.zone_routes r
        join public.zones fz on fz.id = r.from_zone_id
        join public.zones tz on tz.id = r.to_zone_id
        join public.saved_places fp on fp.place_id = fz.display_place_id
        join public.saved_places tp on tp.place_id = tz.display_place_id
       where r.featured and fp.id <> tp.id
      on conflict (from_place, to_place) do nothing
    $q$;
  else
    raise notice 'zones.display_* not found: seed from zones skipped (use the seed script instead)';
  end if;
end $seed$;

-- ---------------------------------------------------------------------------
-- Clean-up: private places never booked and unused for 90 days go (their routes too).
-- ---------------------------------------------------------------------------
create or replace function public.cleanup_saved_places() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.saved_places
   where not is_public and not pinned and use_count = 0
     and last_used_at < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end $$;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('tem-cleanup-saved-places', '35 3 * * *', 'select public.cleanup_saved_places()');
  end if;
exception when others then
  raise notice 'pg_cron schedule for saved_places skipped: %', sqlerrm;
end $cron$;

-- ---------------------------------------------------------------------------
-- RLS and grants: staff manage in the admin; the website server uses the service role.
-- ---------------------------------------------------------------------------
alter table public.saved_places enable row level security;
alter table public.saved_routes enable row level security;
alter table public.saved_route_times enable row level security;
revoke all on public.saved_places, public.saved_routes, public.saved_route_times from anon, authenticated;
grant select, insert, update, delete on public.saved_places, public.saved_routes, public.saved_route_times to authenticated;

drop policy if exists saved_places_staff_all on public.saved_places;
drop policy if exists saved_routes_staff_all on public.saved_routes;
drop policy if exists saved_route_times_staff_all on public.saved_route_times;
create policy saved_places_staff_all on public.saved_places for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy saved_routes_staff_all on public.saved_routes for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy saved_route_times_staff_all on public.saved_route_times for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

do $$
declare f text;
begin
  foreach f in array array[
    'public.nearest_saved_place(double precision, double precision, double precision)',
    'public.resolve_place(text, text, double precision, double precision, text, double precision)',
    'public.search_saved_places(text, integer)',
    'public.record_route(uuid, uuid, text, numeric, integer, text)',
    'public.route_estimate(uuid, uuid, timestamptz, integer)',
    'public.popular_destinations(uuid, integer)',
    'public.popular_routes(integer)',
    'public.routes_to_refresh(integer, integer)',
    'public.cleanup_saved_places()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
