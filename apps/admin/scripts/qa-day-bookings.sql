-- Called by qa-drivers-full-day.mjs; DRIVER_ID substituted via -v.
\set ON_ERROR_STOP on
insert into public.bookings (
  booking_type, class_id, from_zone_id, to_zone_id, vehicle_id, driver_id,
  pickup_address, dropoff_address, pickup_at, duration_minutes, blocked_range,
  passengers, luggage, customer_name, customer_email, customer_phone,
  base_price_cents, price_cents, status, payment_status, trip_status
)
select 'transfer', c.id, za.id, zb.id, v.id, :'driver_id'::uuid, 'QA A', 'QA B',
       (date_trunc('day', now() at time zone 'Europe/Athens') + interval '1 day' + interval '10 hours' + make_interval(hours => g * 2)) at time zone 'Europe/Athens',
       45,
       public.blocked_range_for(
         (date_trunc('day', now() at time zone 'Europe/Athens') + interval '1 day' + interval '10 hours' + make_interval(hours => g * 2)) at time zone 'Europe/Athens',
         45, c.buffer_minutes),
       1, 1, 'QA Day', 'qa-day@example.com', '+306900009799',
       12000, 12000, 'assigned', 'paid', 'scheduled'
  from generate_series(0, 2) as g
  join public.vehicle_classes c on c.key = 'demo-s-class'
  join public.zones za on za.code = 'demo-airport'
  join public.zones zb on zb.code = 'demo-centre'
  join public.vehicles v on v.label = 'DEMO S-CLASS-1';
