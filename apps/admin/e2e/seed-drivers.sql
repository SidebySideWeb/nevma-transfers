-- Two overlapping confirmed bookings for driver assignment e2e.
delete from public.booking_events
 where booking_id in (
   select id from public.bookings where customer_email = 'e2e-drivers-overlap@example.com'
 );
delete from public.bookings where customer_email = 'e2e-drivers-overlap@example.com';

delete from public.driver_shifts
 where driver_id in (select id from public.drivers where email = 'e2e-driver@tem.local');
delete from public.drivers where email = 'e2e-driver@tem.local';

insert into public.bookings (
  booking_type, class_id, from_zone_id, to_zone_id,
  pickup_address, dropoff_address, pickup_at, duration_minutes, blocked_range,
  passengers, luggage, customer_name, customer_email, customer_phone,
  base_price_cents, price_cents, status, payment_status
)
select 'transfer', c.id, za.id, zb.id,
       'Arrivals A', 'Hotel A', '2027-09-10 10:00:00+03'::timestamptz, 45,
       public.blocked_range_for('2027-09-10 10:00:00+03'::timestamptz, 45, c.buffer_minutes),
       2, 1, 'E2E Overlap A', 'e2e-drivers-overlap@example.com', '+306900001001',
       18000, 18000, 'confirmed', 'paid'
  from public.vehicle_classes c
  join public.zones za on za.code = 'demo-airport'
  join public.zones zb on zb.code = 'demo-centre'
 where c.key = 'demo-e-class';

insert into public.bookings (
  booking_type, class_id, from_zone_id, to_zone_id,
  pickup_address, dropoff_address, pickup_at, duration_minutes, blocked_range,
  passengers, luggage, customer_name, customer_email, customer_phone,
  base_price_cents, price_cents, status, payment_status
)
select 'transfer', c.id, za.id, zb.id,
       'Arrivals B', 'Hotel B', '2027-09-10 10:30:00+03'::timestamptz, 45,
       public.blocked_range_for('2027-09-10 10:30:00+03'::timestamptz, 45, c.buffer_minutes),
       2, 1, 'E2E Overlap B', 'e2e-drivers-overlap@example.com', '+306900001002',
       18000, 18000, 'confirmed', 'paid'
  from public.vehicle_classes c
  join public.zones za on za.code = 'demo-airport'
  join public.zones zb on zb.code = 'demo-centre'
 where c.key = 'demo-e-class';
