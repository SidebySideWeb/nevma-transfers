-- D4 e2e: driver with plan + completed work so statements have lines.
begin;

-- Unlock approved/paid so line deletes are allowed by driver_statement_lines_guard.
update public.driver_statements set status = 'draft'
 where driver_id in (select id from public.drivers where email = 'e2e-pay@tem.local');
delete from public.driver_statement_lines
 where statement_id in (select id from public.driver_statements where driver_id in (
   select id from public.drivers where email = 'e2e-pay@tem.local'));
delete from public.driver_statements where driver_id in (select id from public.drivers where email = 'e2e-pay@tem.local');
delete from public.driver_pay_adjustments where driver_id in (select id from public.drivers where email = 'e2e-pay@tem.local');
delete from public.driver_pay_rates where plan_id in (
  select id from public.driver_pay_plans where driver_id in (select id from public.drivers where email = 'e2e-pay@tem.local'));
delete from public.driver_pay_plans where driver_id in (select id from public.drivers where email = 'e2e-pay@tem.local');
delete from public.driver_shifts where driver_id in (select id from public.drivers where email = 'e2e-pay@tem.local');
delete from public.booking_events where booking_id in (
  select id from public.bookings where customer_email = 'e2e-pay@example.com');
delete from public.bookings where customer_email = 'e2e-pay@example.com';
delete from public.drivers where email = 'e2e-pay@tem.local';

insert into public.drivers (full_name, phone, email, employment, active)
values ('E2E Pay Driver', '+306900009940', 'e2e-pay@tem.local', 'employee', true);

insert into public.driver_pay_plans (driver_id, valid_from, monthly_salary_cents, hourly_rate_cents, hourly_basis, percent_bp, percent_base, per_transfer_cents)
select id, '2026-10-01', 120000, 500, 'shift', 1000, 'net', 1500
  from public.drivers where email = 'e2e-pay@tem.local';

insert into public.driver_shifts (driver_id, vehicle_id, started_at, ended_at, source)
select d.id, v.id, '2026-10-15 06:00:00+03', '2026-10-15 16:00:00+03', 'office'
  from public.drivers d
  join public.vehicles v on v.label = 'DEMO E-CLASS-1'
 where d.email = 'e2e-pay@tem.local';

insert into public.bookings (
  booking_type, class_id, from_zone_id, to_zone_id, vehicle_id, driver_id,
  pickup_address, dropoff_address, pickup_at, duration_minutes, blocked_range,
  passengers, luggage, customer_name, customer_email, customer_phone,
  base_price_cents, price_cents, status, payment_status, trip_status
)
select 'transfer', c.id, za.id, zb.id, v.id, d.id,
       'Arrivals Pay', 'Hotel Pay',
       '2026-10-15 10:00:00+03'::timestamptz, 60,
       public.blocked_range_for('2026-10-15 10:00:00+03'::timestamptz, 60, c.buffer_minutes),
       1, 1, 'Pay E2E', 'e2e-pay@example.com', '+306900009941',
       18000, 18000, 'completed', 'paid', 'completed'
  from public.vehicle_classes c
  join public.zones za on za.code = 'demo-airport'
  join public.zones zb on zb.code = 'demo-centre'
  join public.vehicles v on v.label = 'DEMO E-CLASS-1'
  join public.drivers d on d.email = 'e2e-pay@tem.local'
 where c.key = 'demo-e-class';

commit;
