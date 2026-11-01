-- Cleanup for office-bookings.spec.ts: removes what earlier runs created (marked 'e2e-office' in notes).
delete from public.payments where booking_id in (select id from public.bookings where notes like 'e2e-office%');
delete from public.booking_extras where booking_id in (select id from public.bookings where notes like 'e2e-office%');
delete from public.slot_holds where booking_id in (select id from public.bookings where notes like 'e2e-office%');
delete from public.bookings where notes like 'e2e-office%';
-- Holds left by link bookings that have no booking row any more, and the e2e blocks.
delete from public.slot_holds where visitor_key like 'office:%' and booking_id is null;
delete from public.blocked_slots where reason = 'e2e-office-block';
delete from public.customers c where c.email like 'e2e-office-%@example.com'
  and not exists (select 1 from public.bookings b where b.customer_id = c.id);

-- Both demo sedans blocked on 22 Dec 2026, 10:00-12:00 Athens: the class has 0 free at that hour.
insert into public.blocked_slots (vehicle_id, range, reason, created_by)
select v.id, tstzrange('2026-12-22T10:00:00+02:00', '2026-12-22T12:00:00+02:00', '[)'), 'e2e-office-block',
       (select user_id from public.staff limit 1)
  from public.vehicles v join public.vehicle_classes c on c.id = v.class_id
 where c.key = 'demo-e-class' and v.status = 'active';
