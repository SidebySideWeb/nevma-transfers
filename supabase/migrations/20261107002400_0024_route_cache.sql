-- 0024 Route distance/time cache (Google Routes, FEATURE_DISTANCE_PRICING / B2).
-- Keyed by rounded coordinates (5 decimals), stops and departure time rounded to 15 min.
-- Service role only; TTL 24 h (memory cache in @tem/places is 15 min). Kit name was 0018a.

create table public.route_cache (
  cache_key text primary key,
  distance_km numeric(8, 1) not null check (distance_km >= 0),
  duration_min int not null check (duration_min >= 0),
  source text not null default 'google',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index route_cache_expires_idx on public.route_cache (expires_at);

comment on table public.route_cache is 'Cached Google Routes distance/duration for distance pricing (0024 / B2).';
comment on column public.route_cache.cache_key is 'origin|destination|stops|departAt15m with coords to 5 decimals.';

alter table public.route_cache enable row level security;
revoke all on public.route_cache from anon, authenticated;
