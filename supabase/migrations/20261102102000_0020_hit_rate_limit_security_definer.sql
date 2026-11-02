-- Drivers call hit_rate_limit with their own session (Driver API v1). The function must
-- bypass rate_limits RLS / table grants (authenticated has no insert).
create or replace function public.hit_rate_limit(
  p_key text,
  p_window_seconds int,
  p_max int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n int;
begin
  insert into public.rate_limits (key, window_start, count)
  values (p_key, w, 1)
  on conflict (key, window_start) do update
    set count = public.rate_limits.count + 1
  returning count into n;
  return n <= p_max;
end $$;

revoke all on function public.hit_rate_limit(text, int, int) from public, anon;
grant execute on function public.hit_rate_limit(text, int, int) to authenticated;
grant execute on function public.hit_rate_limit(text, int, int) to service_role;
