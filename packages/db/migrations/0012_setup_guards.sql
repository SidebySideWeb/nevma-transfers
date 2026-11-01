-- 0012 Fleet and setup management from the admin (decided by the user 1 Nov 2026).
-- Staff already have insert/update/delete on vehicle_classes, vehicles, zones, zone_routes, zone_prices,
-- hourly_rates, extras (0005). These guards keep the data the website, Sanity and bookings rely on intact,
-- with messages the admin can show as they are. Rules: docs/FLEET-SETUP.md. Applies on kit 1 alone.

-- Staff-only note on vehicles (model, colour, plate). Table-level grants from the shim / Supabase cover it.
alter table public.vehicles add column if not exists note text;

-- Codes that Sanity and the booking flow refer to cannot change once something uses them.
create function public.guard_class_key() returns trigger language plpgsql as $$
begin
  if new.key is distinct from old.key and (
       exists (select 1 from public.vehicles where class_id = old.id)
    or exists (select 1 from public.zone_prices where class_id = old.id)
    or exists (select 1 from public.hourly_rates where class_id = old.id)
    or exists (select 1 from public.bookings where class_id = old.id)) then
    raise exception 'in_use: the class key "%" is used by vehicles, prices or bookings and cannot change', old.key;
  end if;
  return new;
end $$;
create trigger vehicle_classes_key_guard before update on public.vehicle_classes for each row execute function public.guard_class_key();

create function public.guard_zone_code() returns trigger language plpgsql as $$
begin
  if new.code is distinct from old.code and (
       exists (select 1 from public.zone_routes where from_zone_id = old.id or to_zone_id = old.id)
    or exists (select 1 from public.bookings where from_zone_id = old.id or to_zone_id = old.id)) then
    raise exception 'in_use: the zone code "%" is used by routes or bookings and cannot change', old.code;
  end if;
  return new;
end $$;
create trigger zones_code_guard before update on public.zones for each row execute function public.guard_zone_code();

-- The booking flow refers to these two extras by code.
create function public.guard_extra() returns trigger language plpgsql as $$
begin
  if old.code in ('vip-security', 'night-surcharge') and (tg_op = 'DELETE' or new.code is distinct from old.code) then
    raise exception 'in_use: the extra "%" is built into the booking flow; switch it off instead', old.code;
  end if;
  if tg_op = 'UPDATE' and new.code is distinct from old.code and exists (select 1 from public.booking_extras where extra_id = old.id) then
    raise exception 'in_use: the extra code "%" is used by bookings and cannot change', old.code;
  end if;
  return coalesce(new, old);
end $$;
create trigger extras_guard before update or delete on public.extras for each row execute function public.guard_extra();

-- Things with history are switched off, not deleted.
create function public.guard_delete_in_use() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'vehicle_classes' and (
       exists (select 1 from public.vehicles where class_id = old.id)
    or exists (select 1 from public.bookings where class_id = old.id)) then
    raise exception 'in_use: this class has vehicles or bookings; switch it offline instead';
  elsif tg_table_name = 'vehicles' and exists (select 1 from public.bookings where vehicle_id = old.id) then
    raise exception 'in_use: this vehicle has bookings; set it to retired instead';
  elsif tg_table_name = 'zones' and exists (select 1 from public.bookings where from_zone_id = old.id or to_zone_id = old.id) then
    raise exception 'in_use: this zone has bookings; switch it off instead';
  end if;
  return old;
end $$;
create trigger vehicle_classes_delete_guard before delete on public.vehicle_classes for each row execute function public.guard_delete_in_use();
create trigger vehicles_delete_guard before delete on public.vehicles for each row execute function public.guard_delete_in_use();
create trigger zones_delete_guard before delete on public.zones for each row execute function public.guard_delete_in_use();

-- A vehicle cannot leave service or change class while future bookings are assigned to it.
create function public.guard_vehicle_change() returns trigger language plpgsql as $$
declare
  n int;
begin
  if (new.status <> 'active' and old.status = 'active') or new.class_id is distinct from old.class_id then
    select count(*) into n from public.bookings
     where vehicle_id = old.id and status in ('confirmed', 'assigned') and upper(blocked_range) > now();
    if n > 0 then
      raise exception 'has_future_bookings: % has % future booking(s); move them to another vehicle first', old.label, n;
    end if;
  end if;
  return new;
end $$;
create trigger vehicles_change_guard before update on public.vehicles for each row execute function public.guard_vehicle_change();

-- Vehicle labels are unique (they are how the office talks about vehicles).
create unique index if not exists vehicles_label_key on public.vehicles (lower(label));
