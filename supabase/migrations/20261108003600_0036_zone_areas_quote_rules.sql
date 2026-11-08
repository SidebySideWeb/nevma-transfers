-- 0036 Distance-first quotes (FIX-2; kit file was 0034 — this repo already used 0034/0035).
--  a) zones.area: a polygon per zone, so the SERVER decides which zone a place is in.
--     The browser no longer sends zones. A zone without an area never matches, so
--     those trips are priced by distance and time.
--  b) pricing_settings: optional long-distance surcharge and "request a quote" threshold.
--  c) quote_failures: every failed quote is logged with its reason.

-- ---------------------------------------------------------------------------
-- a) zone areas (GeoJSON Polygon, ring of [lng, lat], closed)
-- ---------------------------------------------------------------------------
create or replace function public.geojson_polygon_valid(p jsonb) returns boolean
language plpgsql immutable as $$
declare
  ring jsonb;
  pt jsonb;
  n int;
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) <> 'object' or p->>'type' <> 'Polygon'
     or jsonb_typeof(p->'coordinates') <> 'array'
     or jsonb_array_length(p->'coordinates') < 1 then
    return false;
  end if;
  ring := p->'coordinates'->0;
  if jsonb_typeof(ring) <> 'array' then return false; end if;
  n := jsonb_array_length(ring);
  if n < 4 or n > 2000 then return false; end if;
  for pt in select * from jsonb_array_elements(ring) loop
    if jsonb_typeof(pt) <> 'array' or jsonb_array_length(pt) <> 2
       or jsonb_typeof(pt->0) <> 'number' or jsonb_typeof(pt->1) <> 'number'
       or (pt->>0)::float8 not between 19 and 30      -- lng, Greece
       or (pt->>1)::float8 not between 34 and 42 then -- lat, Greece
      return false;
    end if;
  end loop;
  if ring->0 <> ring->(n - 1) then return false; end if;  -- closed ring
  return true;
end $$;

alter table public.zones add column if not exists area jsonb;
alter table public.zones drop constraint if exists zones_area_ck;
alter table public.zones add constraint zones_area_ck check (public.geojson_polygon_valid(area));

comment on column public.zones.area is
  'GeoJSON Polygon ([lng,lat]). The quote API puts a place in this zone only if the point is inside. '
  'Null = the zone never matches by location (its fixed prices are not used for typed addresses).';

-- ---------------------------------------------------------------------------
-- b) pricing settings: optional keys, validated when present
--    long_distance:      { "over_km": 40, "factor": 1.10 }  or null (off)
--    quote_only_over_km: 80                                  or null (off)
-- ---------------------------------------------------------------------------
create or replace function public.pricing_settings_valid(p jsonb) returns boolean
language plpgsql immutable as $$
declare
  night jsonb;
  waiting jsonb;
  demand jsonb;
  ld jsonb;
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
     or jsonb_typeof(night->'factor') <> 'number'
     or (night->>'factor')::numeric < 1 then
    return false;
  end if;
  if jsonb_typeof(p->'stop_fee') <> 'number' or (p->>'stop_fee')::numeric < 0 then return false; end if;
  waiting := p->'waiting';
  if jsonb_typeof(waiting) <> 'object'
     or jsonb_typeof(waiting->'airport_free_min') <> 'number'
     or jsonb_typeof(waiting->'other_free_min') <> 'number'
     or jsonb_typeof(waiting->'per_min') <> 'number'
     or (waiting->>'airport_free_min')::numeric < 0
     or (waiting->>'other_free_min')::numeric < 0
     or (waiting->>'per_min')::numeric < 0 then
    return false;
  end if;
  if jsonb_typeof(p->'rounding') <> 'number' then return false; end if;
  rounding := (p->>'rounding')::int;
  if rounding is distinct from 1 and rounding is distinct from 5 then return false; end if;
  if jsonb_typeof(p->'return_discount_pct') <> 'number'
     or (p->>'return_discount_pct')::numeric < 0
     or (p->>'return_discount_pct')::numeric > 100 then
    return false;
  end if;
  if jsonb_typeof(p->'quote_ttl_min') <> 'number' or (p->>'quote_ttl_min')::numeric < 1 then return false; end if;
  demand := p->'demand';
  if jsonb_typeof(demand) <> 'object'
     or jsonb_typeof(demand->'enabled') <> 'boolean'
     or jsonb_typeof(demand->'steps') <> 'array'
     or jsonb_typeof(demand->'max') <> 'number'
     or (demand->>'max')::numeric < 1 then
    return false;
  end if;
  for step in select * from jsonb_array_elements(demand->'steps') loop
    if jsonb_typeof(step->'over') <> 'number' or jsonb_typeof(step->'factor') <> 'number'
       or (step->>'over')::numeric < 0 or (step->>'factor')::numeric < 1 then
      return false;
    end if;
  end loop;
  -- optional: long-distance surcharge
  if p ? 'long_distance' and jsonb_typeof(p->'long_distance') <> 'null' then
    ld := p->'long_distance';
    if jsonb_typeof(ld) <> 'object'
       or jsonb_typeof(ld->'over_km') <> 'number' or (ld->>'over_km')::numeric <= 0
       or jsonb_typeof(ld->'factor') <> 'number' or (ld->>'factor')::numeric < 1 then
      return false;
    end if;
  end if;
  -- optional: above this distance the site offers "request a quote" instead of a price
  if p ? 'quote_only_over_km' and jsonb_typeof(p->'quote_only_over_km') <> 'null' then
    if jsonb_typeof(p->'quote_only_over_km') <> 'number' or (p->>'quote_only_over_km')::numeric <= 0 then
      return false;
    end if;
  end if;
  return true;
end $$;

-- New settings version carrying the two keys switched off (keeps every current value).
insert into public.pricing_settings (doc)
select s.doc || jsonb_build_object('long_distance', null, 'quote_only_over_km', null)
  from public.current_pricing_settings s
 where not (s.doc ? 'long_distance');

-- ---------------------------------------------------------------------------
-- c) quote failures (server writes with the service role; staff read)
-- ---------------------------------------------------------------------------
create table if not exists public.quote_failures (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  http_status int not null check (http_status between 400 and 599),
  reason text not null check (reason in (
    'return_before_outbound', 'pickup_too_soon', 'no_route', 'outside_area',
    'quote_only_distance', 'not_priced', 'unavailable', 'routing_failed',
    'pricing_failed', 'invalid_request', 'other'
  )),
  detail text,
  request jsonb not null default '{}'::jsonb,
  distance_km numeric(8, 1),
  duration_min int,
  ip_hash text
);
create index if not exists quote_failures_at_idx on public.quote_failures (at desc);
create index if not exists quote_failures_reason_idx on public.quote_failures (reason, at desc);

comment on table public.quote_failures is
  'Every failed /api/quote with its reason (FIX-2). No names, emails or phones in request.';

alter table public.quote_failures enable row level security;
revoke all on public.quote_failures from anon, authenticated;
grant select on public.quote_failures to authenticated;
drop policy if exists quote_failures_staff_read on public.quote_failures;
create policy quote_failures_staff_read on public.quote_failures
  for select to authenticated using (public.is_staff());

-- Keep 30 days.
create or replace function public.cleanup_quote_failures() returns int
language plpgsql security definer set search_path = public
as $$
declare n int;
begin
  delete from public.quote_failures where at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.cleanup_quote_failures() from public, anon, authenticated;
grant execute on function public.cleanup_quote_failures() to service_role;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('tem-cleanup-quote-failures', '25 3 * * *', 'select public.cleanup_quote_failures()');
  end if;
exception when others then
  raise notice 'pg_cron schedule for quote_failures skipped: %', sqlerrm;
end $cron$;
