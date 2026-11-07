-- DEMO seed for development and staging only. Every row is labelled DEMO / demo-.
-- Fleet, zones and figures follow the Elite Protection V2 design (design/v2): five vehicles, the airport route
-- prices and hourly rates shown there. They are still DEMO until the client confirms them (O1–O3, O18:
-- the design shows prices before VAT; the site shows final prices). pnpm check:placeholders fails until then.
-- One pair (demo-north -> demo-port for demo-sprinter) has no price on purpose, to exercise error no_price.

insert into public.vehicle_classes (key, name, max_passengers, max_luggage, buffer_minutes, sort_order) values
  ('demo-e-class',  'DEMO E-Class',  3,  2, 30, 10),
  ('demo-s-class',  'DEMO S-Class',  3,  2, 30, 20),
  ('demo-v-class',  'DEMO V-Class',  7,  6, 30, 30),
  ('demo-vito',     'DEMO Vito',     8,  6, 30, 40),
  ('demo-sprinter', 'DEMO Sprinter', 12, 10, 45, 50);

-- Zero distance rates (0025 may have run before these DEMO classes existed).
insert into public.class_rates (class_key, base_fare, per_km, per_min, minimum_fare, km_per_hour, extra_km_rate)
select c.key, 0, 0, 0, 0, 40, 0
  from public.vehicle_classes c
 where not exists (select 1 from public.class_rates r where r.class_key = c.key);

insert into public.vehicles (class_id, label)
select c.id, 'DEMO ' || upper(replace(c.key, 'demo-', '')) || '-' || n
  from public.vehicle_classes c cross join generate_series(1, 2) n
 where c.key like 'demo-%';

insert into public.zones (code, name, sort_order) values
  ('demo-airport', 'DEMO Athens International Airport (AIA)', 10),
  ('demo-centre',  'DEMO Athens',                             20),
  ('demo-port',    'DEMO Piraeus port',                       30),
  ('demo-north',   'DEMO Northern suburbs',                   40);

-- Directed routes in both directions with the same duration.
with pairs(a, b, mins) as (values
  ('demo-airport', 'demo-centre', 45), ('demo-airport', 'demo-port', 55), ('demo-airport', 'demo-north', 40),
  ('demo-centre', 'demo-port', 30), ('demo-centre', 'demo-north', 30), ('demo-port', 'demo-north', 50)),
both_ways as (select a, b, mins from pairs union all select b, a, mins from pairs)
insert into public.zone_routes (from_zone_id, to_zone_id, duration_minutes)
select za.id, zb.id, p.mins from both_ways p
  join public.zones za on za.code = p.a
  join public.zones zb on zb.code = p.b;

-- DEMO price: the design's airport <-> Athens price for the class (45 minutes), scaled by route duration,
-- rounded to 5 euros, never below 60% of the airport price.
with airport(key, cents) as (values
  ('demo-e-class', 15000), ('demo-s-class', 18000), ('demo-v-class', 18000), ('demo-vito', 15000), ('demo-sprinter', 18000))
insert into public.zone_prices (from_zone_id, to_zone_id, class_id, price_cents)
select r.from_zone_id, r.to_zone_id, c.id,
       (round(greatest(a.cents * 0.6, a.cents * r.duration_minutes / 45.0) / 500.0) * 500)::int
  from public.zone_routes r
  cross join public.vehicle_classes c
  join airport a on a.key = c.key
 where not (c.key = 'demo-sprinter'
            and r.from_zone_id = (select id from public.zones where code = 'demo-north')
            and r.to_zone_id   = (select id from public.zones where code = 'demo-port'));

-- Hourly rates and minimum hours from the design.
insert into public.hourly_rates (class_id, price_per_hour_cents, min_hours, max_hours)
select c.id, h.cents, h.min_hours, 12
  from public.vehicle_classes c
  join (values ('demo-e-class', 6000, 3), ('demo-s-class', 9000, 4), ('demo-v-class', 9000, 4),
               ('demo-vito', 7000, 4), ('demo-sprinter', 9000, 4)) h(key, cents, min_hours) on h.key = c.key;

insert into public.extras (code, name, price_cents) values
  ('night-surcharge', 'DEMO Night surcharge', 1500),
  ('vip-security',    'DEMO VIP security',    15000);
