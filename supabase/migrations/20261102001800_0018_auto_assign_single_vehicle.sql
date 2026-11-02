-- 0018 Automatic vehicle assignment when a class has exactly one active vehicle.
--
-- When a booking becomes confirmed (an online booking whose Viva payment is verified: pending/expired -> confirmed, or an
-- office booking saved as confirmed), and it has no vehicle yet, and its class has exactly ONE vehicle with
-- status 'active', that vehicle is set on the booking, provided it is free for the booking's blocked range
-- (no blocked slot, no other pending/confirmed/assigned booking on it). The booking stays 'confirmed': the office
-- still moves it to 'assigned' when the chauffeur is confirmed, so the customer's "Chauffeur assigned" step and
-- emails do not change. `vehicle_auto_assigned` marks it for the admin ("Auto" badge) and is cleared as soon as
-- staff change the vehicle. It never re-assigns after staff remove a vehicle, and never touches bookings of
-- classes with 0 or 2+ active vehicles. Switch: settings.auto_assign_single_vehicle (default true).

insert into public.settings (key, value, description, is_demo) values
  ('auto_assign_single_vehicle', 'true',
   'When a class has exactly one active vehicle, confirmed bookings of that class get that vehicle automatically.', false)
on conflict (key) do nothing;

alter table public.bookings add column if not exists vehicle_auto_assigned boolean not null default false;
comment on column public.bookings.vehicle_auto_assigned is
  'True when vehicle_id was set by the single-vehicle rule (0018); false once staff change the vehicle.';

-- The class's only active vehicle, if it is free for the range; otherwise null.
create or replace function public.single_free_vehicle(p_class_id uuid, p_range tstzrange, p_booking_id uuid default null)
returns uuid
language sql stable
as $$
  with active as (
    select v.id from public.vehicles v where v.class_id = p_class_id and v.status = 'active'
  )
  select a.id from active a
   where (select count(*) from active) = 1
     and not exists (select 1 from public.blocked_slots s where s.vehicle_id = a.id and s.range && p_range)
     and not exists (
       select 1 from public.bookings b
        where b.vehicle_id = a.id and b.id is distinct from p_booking_id
          and b.status in ('pending', 'confirmed', 'assigned') and b.blocked_range && p_range);
$$;

create or replace function public.auto_assign_enabled() returns boolean language sql stable as $$
  select coalesce((select (value #>> '{}')::boolean from public.settings where key = 'auto_assign_single_vehicle'), true);
$$;

create or replace function public.bookings_auto_assign() returns trigger language plpgsql as $$
begin
  -- Staff (or any caller) changing the vehicle clears the flag, unless the caller set the flag itself (backfill).
  if tg_op = 'UPDATE' and new.vehicle_id is distinct from old.vehicle_id
     and new.vehicle_auto_assigned is not distinct from old.vehicle_auto_assigned then
    new.vehicle_auto_assigned := false;
  end if;

  if new.vehicle_id is null and new.status = 'confirmed'
     and (tg_op = 'INSERT' or old.status in ('pending', 'expired'))   -- paid, or paid late after the hold ended
     and public.auto_assign_enabled() then
    new.vehicle_id := public.single_free_vehicle(new.class_id, new.blocked_range, new.id);
    new.vehicle_auto_assigned := new.vehicle_id is not null;
  end if;
  return new;
end $$;

drop trigger if exists bookings_auto_assign on public.bookings;
create trigger bookings_auto_assign before insert or update of status, vehicle_id on public.bookings
  for each row execute function public.bookings_auto_assign();

-- Assigns the single vehicle to future confirmed bookings that have none (oldest pickup first). Returns how many.
-- Run once below; the admin can call it again after a class drops to one vehicle (Fleet → class → "Assign now").
create or replace function public.auto_assign_backfill(p_class_id uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  vid uuid;
  n int := 0;
begin
  if auth.uid() is not null and not public.is_staff() then   -- signed-in callers must be staff; the server and migrations pass
    raise exception 'forbidden: not staff' using errcode = 'insufficient_privilege';
  end if;
  if not public.auto_assign_enabled() then return 0; end if;
  for r in
    select id, class_id, blocked_range from public.bookings
     where status = 'confirmed' and vehicle_id is null and upper(blocked_range) > now()
       and (p_class_id is null or class_id = p_class_id)
     order by pickup_at
     for update
  loop
    vid := public.single_free_vehicle(r.class_id, r.blocked_range, r.id);
    if vid is not null then
      update public.bookings set vehicle_id = vid, vehicle_auto_assigned = true where id = r.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.auto_assign_backfill(uuid) from public, anon;
grant execute on function public.auto_assign_backfill(uuid) to authenticated, service_role;

-- Calendar bars can show the Auto mark next to auto-assigned bookings.
create or replace view public.calendar_items with (security_invoker = true) as
  select 'booking'::text as kind, b.id as booking_id, b.reference, b.class_id, b.vehicle_id, b.blocked_range as range,
         b.pickup_at, b.pickup_at + make_interval(mins => b.duration_minutes) as ends_at,
         b.status::text as status, b.booking_type::text as booking_type, b.customer_name as label,
         b.vip_security, b.source, null::text as reason, b.vehicle_auto_assigned
    from public.bookings b
   where b.status in ('confirmed', 'assigned', 'completed') or (b.status = 'pending' and b.hold_expires_at > now())
  union all
  select 'hold', h.booking_id, null, h.class_id, null, h.blocked_range, lower(h.blocked_range), upper(h.blocked_range),
         'held', null, null, false, case when h.visitor_key like 'office:%' then 'office' else 'online' end, null, false
    from public.slot_holds h
   where h.status = 'active' and h.expires_at > now() and h.booking_id is null
  union all
  select 'block', null, null, v.class_id, s.vehicle_id, s.range, lower(s.range), upper(s.range),
         'blocked', null, null, false, null, s.reason, false
    from public.blocked_slots s join public.vehicles v on v.id = s.vehicle_id;
revoke all on public.calendar_items from anon;
grant select on public.calendar_items to authenticated;

select public.auto_assign_backfill();
