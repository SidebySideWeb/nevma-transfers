-- 0022 Extend driver_jobs with place columns so the drivers app can open exact Maps links.
-- Must drop first: Postgres cannot change OUT columns with CREATE OR REPLACE.
drop function if exists public.driver_jobs(date, date);

create function public.driver_jobs(p_from date, p_to date)
returns table (
  reference text, booking_type text, status text, trip_status text, pickup_at timestamptz, ends_at timestamptz,
  from_zone text, to_zone text, pickup_address text, dropoff_address text, hours int, flight_number text,
  passengers int, luggage int, customer_name text, customer_phone text, notes text, class_name text,
  vehicle_label text, vip_security boolean, extras text[],
  pickup_place_id text, pickup_lat double precision, pickup_lng double precision,
  dropoff_place_id text, dropoff_lat double precision, dropoff_lng double precision
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if public.current_driver_id() is null then raise exception 'forbidden: not a driver'; end if;
  if p_to < p_from or p_to - p_from > 31 then raise exception 'invalid_request: choose up to 31 days'; end if;
  return query
  select b.reference, b.booking_type::text, b.status::text, b.trip_status, b.pickup_at,
         b.pickup_at + make_interval(mins => b.duration_minutes),
         zf.name, zt.name, b.pickup_address, b.dropoff_address, b.hours, b.flight_number, b.passengers, b.luggage,
         b.customer_name,
         case when now() between b.pickup_at - interval '24 hours' and b.pickup_at + make_interval(mins => b.duration_minutes) + interval '6 hours'
              then b.customer_phone end,
         b.notes, c.name, v.label, b.vip_security,
         coalesce((select array_agg(e.name order by e.name) from public.booking_extras be join public.extras e on e.id = be.extra_id where be.booking_id = b.id), '{}'),
         b.pickup_place_id, b.pickup_lat, b.pickup_lng, b.dropoff_place_id, b.dropoff_lat, b.dropoff_lng
    from public.bookings b
    join public.zones zf on zf.id = b.from_zone_id
    left join public.zones zt on zt.id = b.to_zone_id
    join public.vehicle_classes c on c.id = b.class_id
    left join public.vehicles v on v.id = b.vehicle_id
   where b.driver_id = public.current_driver_id()
     and b.status in ('confirmed', 'assigned', 'completed')
     and (b.pickup_at at time zone 'Europe/Athens')::date between p_from and p_to
   order by b.pickup_at;
end $$;

grant execute on function public.driver_jobs(date, date) to authenticated;
grant execute on function public.driver_jobs(date, date) to service_role;
