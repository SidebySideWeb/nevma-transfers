-- 0034 Staff RPC to append class_rates (admin Rates / Hourly pages).
-- Plain INSERT can fail under RLS/grants for authenticated; this checks is_staff()
-- then inserts as security definer (append-only; never updates).

create or replace function public.staff_save_class_rate(
  p_class_key text,
  p_base_fare int,
  p_per_km int,
  p_per_min int,
  p_minimum_fare int,
  p_km_per_hour int default 40,
  p_extra_km_rate int default 0
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_class_key is null or btrim(p_class_key) = '' then
    raise exception 'invalid_request: class_key required';
  end if;
  if p_base_fare < 0 or p_per_km < 0 or p_per_min < 0 or p_minimum_fare < 0
     or p_km_per_hour < 1 or p_extra_km_rate < 0 then
    raise exception 'invalid_request: rates must be non-negative (km/h >= 1)';
  end if;
  insert into public.class_rates (
    class_key, base_fare, per_km, per_min, minimum_fare, km_per_hour, extra_km_rate, created_by
  ) values (
    p_class_key, p_base_fare, p_per_km, p_per_min, p_minimum_fare,
    p_km_per_hour, p_extra_km_rate, auth.uid()
  )
  returning id into new_id;
  return new_id;
end $$;

comment on function public.staff_save_class_rate is
  'Staff-only: append a class_rates version (distance / hybrid pricing).';

revoke all on function public.staff_save_class_rate(
  text, int, int, int, int, int, int
) from public, anon;
grant execute on function public.staff_save_class_rate(
  text, int, int, int, int, int, int
) to authenticated;

-- Belt-and-suspenders: keep table INSERT for any other staff tools.
grant select, insert on public.class_rates to authenticated;
grant select on public.current_class_rates to authenticated;
