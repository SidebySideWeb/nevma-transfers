do $$
declare
  c uuid; z1 uuid; z2 uuid;
  b1 uuid; b2 uuid;
  pickup timestamptz := '2026-12-15T10:00:00+02:00';
  rng tstzrange;
begin
  select id into c from vehicle_classes where key = 'demo-e-class';
  select id into z1 from zones where code = 'demo-airport';
  select id into z2 from zones where code = 'demo-centre';
  rng := blocked_range_for(pickup, 45, 30);

  delete from payments where viva_transaction_id in (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
  ) or booking_id in (select id from bookings where reference in ('TEM-ADAAAA', 'TEM-ADAAAB'));
  delete from bookings where reference in ('TEM-ADAAAA', 'TEM-ADAAAB');


  insert into bookings (
    reference, booking_type, class_id, from_zone_id, to_zone_id,
    pickup_address, dropoff_address, pickup_at, duration_minutes, blocked_range,
    passengers, luggage, customer_name, customer_email, customer_phone,
    base_price_cents, price_cents, status, payment_status, vip_security, invoice_status
  ) values (
    'TEM-ADAAAA', 'transfer', c, z1, z2,
    'Airport', 'Centre', pickup, 45, rng,
    2, 2, 'Ada Admin', 'ada@example.com', '+306900000001',
    7000, 7000, 'confirmed', 'paid', true, 'requested'
  ) returning id into b1;

  insert into payments (booking_id, kind, status, amount_cents, viva_transaction_id, viva_order_code)
  values (b1, 'payment', 'succeeded', 7000, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '1000000000000001');

  insert into bookings (
    reference, booking_type, class_id, from_zone_id, to_zone_id,
    pickup_address, dropoff_address, pickup_at, duration_minutes, blocked_range,
    passengers, luggage, customer_name, customer_email, customer_phone,
    base_price_cents, price_cents, status, payment_status, vip_security, invoice_status
  ) values (
    'TEM-ADAAAB', 'transfer', c, z1, z2,
    'Airport', 'Centre', pickup, 45, rng,
    1, 1, 'Bob Overlap', 'bob@example.com', '+306900000002',
    7000, 7000, 'confirmed', 'paid', false, 'not_required'
  ) returning id into b2;

  insert into payments (booking_id, kind, status, amount_cents, viva_transaction_id, viva_order_code)
  values (b2, 'payment', 'succeeded', 7000, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '1000000000000002');
end $$;
