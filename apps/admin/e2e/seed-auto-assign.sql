-- Solo class for Prompt 6 e2e (one active vehicle). Idempotent.
insert into public.vehicle_classes (key, name, max_passengers, max_luggage, buffer_minutes, active, sort_order, is_demo)
values ('e2e-solo', 'E2E Solo', 3, 2, 30, true, 90, true)
on conflict (key) do update set active = true, name = excluded.name;

insert into public.vehicles (class_id, label, status, is_demo)
select c.id, 'E2E-SOLO-1', 'active', true
  from public.vehicle_classes c where c.key = 'e2e-solo'
  and not exists (
    select 1 from public.vehicles v where v.class_id = c.id and v.label = 'E2E-SOLO-1'
  );

-- Price airport -> centre for the solo class (reuse DEMO zones).
insert into public.zone_prices (class_id, from_zone_id, to_zone_id, price_cents, currency, is_demo)
select c.id, zf.id, zt.id, 12000, 'EUR', true
  from public.vehicle_classes c
  join public.zones zf on zf.code = 'demo-airport'
  join public.zones zt on zt.code = 'demo-centre'
 where c.key = 'e2e-solo'
on conflict (from_zone_id, to_zone_id, class_id) do nothing;

-- Ensure switch is on for the suite start.
update public.settings set value = 'true'::jsonb where key = 'auto_assign_single_vehicle';
