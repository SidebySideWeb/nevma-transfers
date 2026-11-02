-- Today board / trip status e2e seed (Athens "today").
-- Creates a driver, open shift, and a confirmed booking with that driver + vehicle.

delete from public.booking_events
 where booking_id in (select id from public.bookings where customer_email = 'e2e-today@example.com');
delete from public.bookings where customer_email = 'e2e-today@example.com';
delete from public.driver_shifts
 where driver_id in (select id from public.drivers where email = 'e2e-today-driver@tem.local');
-- Clear recent / open shifts on DEMO E-CLASS-1 so the seed open shift cannot overlap them.
delete from public.driver_shifts
 where vehicle_id = (select id from public.vehicles where label = 'DEMO E-CLASS-1' limit 1)
   and (ended_at is null or started_at > now() - interval '2 days');
delete from public.drivers where email = 'e2e-today-driver@tem.local';

insert into public.drivers (full_name, phone, email, employment, active)
values ('E2E Today Driver', '+306900009902', 'e2e-today-driver@tem.local', 'employee', true);

-- Open shift with first active sedan vehicle.
insert into public.driver_shifts (driver_id, vehicle_id, started_at, source, note)
select d.id, v.id, now() - interval '2 hours', 'office', 'e2e today shift'
  from public.drivers d
  join public.vehicles v on v.label = 'DEMO E-CLASS-1' and v.status = 'active'
 where d.email = 'e2e-today-driver@tem.local'
 limit 1;

-- Booking today (Athens), assigned to that driver and vehicle.
insert into public.bookings (
  booking_type, class_id, from_zone_id, to_zone_id, vehicle_id, driver_id,
  pickup_address, dropoff_address, pickup_at, duration_minutes, blocked_range,
  passengers, luggage, customer_name, customer_email, customer_phone,
  base_price_cents, price_cents, status, payment_status, trip_status
)
select 'transfer', c.id, za.id, zb.id, v.id, d.id,
       'Arrivals Today', 'Hotel Today',
       (date_trunc('day', now() at time zone 'Europe/Athens') + interval '14 hours') at time zone 'Europe/Athens',
       45,
       public.blocked_range_for(
         (date_trunc('day', now() at time zone 'Europe/Athens') + interval '14 hours') at time zone 'Europe/Athens',
         45, c.buffer_minutes),
       2, 1, 'E2E Today', 'e2e-today@example.com', '+306900001003',
       18000, 18000, 'assigned', 'paid', 'scheduled'
  from public.vehicle_classes c
  join public.zones za on za.code = 'demo-airport'
  join public.zones zb on zb.code = 'demo-centre'
  join public.vehicles v on v.label = 'DEMO E-CLASS-1'
  join public.drivers d on d.email = 'e2e-today-driver@tem.local'
 where c.key = 'demo-e-class';
