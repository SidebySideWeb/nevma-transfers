-- Customers e2e: one known customer with a past booking (phone searchable).
do $$
declare
  c uuid;
  cls uuid;
  z1 uuid;
  z2 uuid;
  b uuid;
  pickup timestamptz := '2026-10-01T10:00:00+03:00';
begin
  delete from payments where booking_id in (select id from bookings where reference = 'EP-E2ECUS');
  delete from bookings where reference = 'EP-E2ECUS';
  delete from customers where email = 'e2e-customer@example.com';

  select id into cls from vehicle_classes where key = 'demo-e-class';
  select id into z1 from zones where code = 'demo-airport';
  select id into z2 from zones where code = 'demo-centre';

  insert into customers (email, name, phone, notes)
  values ('e2e-customer@example.com', 'E2E Customer', '+306911112222', 'seed notes')
  returning id into c;

  insert into bookings (
    reference, booking_type, class_id, from_zone_id, to_zone_id, customer_id,
    pickup_address, dropoff_address, pickup_at, duration_minutes, blocked_range,
    passengers, luggage, customer_name, customer_email, customer_phone,
    base_price_cents, price_cents, status, payment_status
  ) values (
    'EP-E2ECUS', 'transfer', cls, z1, z2, c,
    'Airport', 'Centre', pickup, 45,
    tstzrange(pickup - interval '30 minutes', pickup + interval '75 minutes'),
    1, 1, 'E2E Customer', 'e2e-customer@example.com', '+306911112222',
    7000, 7000, 'completed', 'paid'
  ) returning id into b;

  insert into payments (booking_id, kind, status, amount_cents, method)
  values (b, 'payment', 'succeeded', 7000, 'cash');
end $$;
