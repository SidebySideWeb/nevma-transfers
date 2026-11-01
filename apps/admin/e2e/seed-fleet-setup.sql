-- Fleet setup e2e: a vehicle with a future booking (cannot retire), plus cleanup of prior limo / zone / extra fixtures.
do $$
declare
  c uuid;
  v uuid;
  z1 uuid;
  z2 uuid;
  pickup timestamptz := now() + interval '5 days';
begin
  delete from booking_extras where booking_id in (select id from bookings where reference = 'EP-FLTRG2');
  delete from payments where booking_id in (select id from bookings where reference = 'EP-FLTRG2');
  delete from bookings where reference = 'EP-FLTRG2';
  delete from vehicles where label in ('LIMO-1', 'FLEET-RETIRE');
  delete from hourly_rates where class_id in (select id from vehicle_classes where key = 'limo');
  delete from vehicle_classes where key = 'limo';
  delete from extras where code in ('e2e-towel', 'name-sign');
  delete from zones where code in ('e2e-south', 'e2e-south-renamed');

  select id into c from vehicle_classes where key = 'demo-e-class';
  select id into z1 from zones where code = 'demo-airport';
  select id into z2 from zones where code = 'demo-centre';

  insert into vehicles (class_id, label, status, note)
  values (c, 'FLEET-RETIRE', 'active', 'E2E retire guard')
  returning id into v;

  insert into bookings (
    reference, booking_type, class_id, vehicle_id, from_zone_id, to_zone_id,
    pickup_address, dropoff_address, pickup_at, duration_minutes, blocked_range,
    passengers, luggage, customer_name, customer_email, customer_phone,
    base_price_cents, price_cents, status, payment_status
  ) values (
    'EP-FLTRG2', 'transfer', c, v, z1, z2,
    'Airport', 'Centre', pickup, 45,
    tstzrange(pickup - interval '30 minutes', pickup + interval '75 minutes'),
    1, 1, 'Fleet Guard', 'fleet-guard@example.com', '+306900000088',
    7000, 7000, 'assigned', 'paid'
  );
end $$;
