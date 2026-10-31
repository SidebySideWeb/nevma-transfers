-- DEMO seed for development and staging only. Every row is labelled DEMO / demo-.
-- Replace with the client's zones, prices, fleet and extras before launch (pnpm check:placeholders fails until then).
-- Prices are invented. One pair (demo-north -> demo-port for demo-van) has no price on purpose, to exercise error no_price.

insert into public.vehicle_classes (key, name, max_passengers, max_luggage, buffer_minutes, sort_order) values
  ('demo-sedan', 'DEMO Executive sedan', 3, 3, 30, 10),
  ('demo-suv',   'DEMO Premium SUV',     4, 4, 30, 20),
  ('demo-van',   'DEMO Executive van',   7, 7, 30, 30);

insert into public.vehicles (class_id, label)
select c.id, 'DEMO ' || upper(replace(c.key, 'demo-', '')) || '-' || n
  from public.vehicle_classes c cross join generate_series(1, 2) n
 where c.key like 'demo-%';

insert into public.zones (code, name, sort_order) values
  ('demo-airport', 'DEMO Athens International Airport', 10),
  ('demo-centre',  'DEMO Athens city centre',           20),
  ('demo-port',    'DEMO Piraeus port',                 30),
  ('demo-north',   'DEMO Northern suburbs',             40);

-- Directed routes in both directions with the same duration.
with pairs(a, b, mins) as (values
  ('demo-airport', 'demo-centre', 45), ('demo-airport', 'demo-port', 55), ('demo-airport', 'demo-north', 40),
  ('demo-centre', 'demo-port', 30), ('demo-centre', 'demo-north', 30), ('demo-port', 'demo-north', 50)),
both_ways as (select a, b, mins from pairs union all select b, a, mins from pairs)
insert into public.zone_routes (from_zone_id, to_zone_id, duration_minutes)
select za.id, zb.id, p.mins from both_ways p
  join public.zones za on za.code = p.a
  join public.zones zb on zb.code = p.b;

-- DEMO price = class base + duration x per-minute rate, rounded to 5 euros.
insert into public.zone_prices (from_zone_id, to_zone_id, class_id, price_cents)
select r.from_zone_id, r.to_zone_id, c.id,
       (round((case c.key when 'demo-sedan' then 4000 + r.duration_minutes * 60
                          when 'demo-suv'   then 5000 + r.duration_minutes * 70
                          else                   6000 + r.duration_minutes * 80 end) / 500.0) * 500)::int
  from public.zone_routes r
  cross join public.vehicle_classes c
 where c.key like 'demo-%'
   and not (c.key = 'demo-van'
            and r.from_zone_id = (select id from public.zones where code = 'demo-north')
            and r.to_zone_id   = (select id from public.zones where code = 'demo-port'));

insert into public.hourly_rates (class_id, price_per_hour_cents, min_hours, max_hours)
select id, case key when 'demo-sedan' then 5500 when 'demo-suv' then 6500 else 7500 end, 3, 12
  from public.vehicle_classes where key like 'demo-%';

insert into public.extras (code, name, price_cents) values
  ('night-surcharge', 'DEMO Night surcharge', 1500),
  ('vip-security',    'DEMO VIP security',    15000);
