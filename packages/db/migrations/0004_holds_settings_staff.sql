-- 0004 Holds, settings, staff allow-list, availability and hold functions.

create table public.settings (
  key text primary key,
  value jsonb not null,
  description text,
  is_demo boolean not null default false     -- true until the client confirms the value
);

insert into public.settings (key, value, description, is_demo) values
  ('hold_minutes', '20', 'Minutes a vehicle is held after the customer selects it (decided 17 Oct 2026).', false),
  ('min_lead_minutes', '120', 'Earliest pickup, in minutes from now. DEMO until the client confirms.', true),
  ('cancel_window_hours', '24', 'Customer can cancel online up to this many hours before pickup. DEMO until the client confirms the policy.', true),
  ('max_active_holds_per_visitor', '2', 'Active holds one visitor key may have at once.', false),
  ('timezone', '"Europe/Athens"', 'Time zone used for display and reminder timing.', false);

create function public.setting_int(p_key text) returns int language sql stable as $$
  select (value #>> '{}')::int from public.settings where key = p_key;
$$;

create table public.staff (
  user_id uuid primary key,          -- auth.users.id (Supabase Auth); FK added when auth schema exists
  email text not null unique,
  name text,
  created_at timestamptz not null default now()
);

create table public.slot_holds (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.vehicle_classes(id),
  visitor_key text not null,
  blocked_range tstzrange not null,
  status text not null default 'active' check (status in ('active', 'converted', 'expired', 'released')),
  booking_id uuid references public.bookings(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index slot_holds_class_range_idx on public.slot_holds using gist (class_id, blocked_range) where status = 'active';
create index slot_holds_visitor_idx on public.slot_holds (visitor_key) where status = 'active';

-- Free vehicles in a class for a range. Expired holds and expired pending bookings never count.
-- p_exclude_booking lets a late payment re-check its own booking's slot.
create function public.class_availability(p_class_id uuid, p_range tstzrange, p_exclude_booking uuid default null)
returns int
language sql stable
as $$
  with fleet as (
    select count(*)::int n from public.vehicles v
     where v.class_id = p_class_id and v.status = 'active'
       and not exists (select 1 from public.blocked_slots b where b.vehicle_id = v.id and b.range && p_range)
  ),
  taken_bookings as (
    select count(*)::int n from public.bookings bk
     where bk.class_id = p_class_id and bk.blocked_range && p_range
       and bk.id is distinct from p_exclude_booking
       and (bk.status in ('confirmed', 'assigned') or (bk.status = 'pending' and bk.hold_expires_at > now()))
       -- an assigned booking whose vehicle is blocked is already excluded from fleet; do not count it twice
       and not (bk.vehicle_id is not null and exists (
             select 1 from public.blocked_slots b where b.vehicle_id = bk.vehicle_id and b.range && p_range))
  ),
  taken_holds as (
    select count(*)::int n from public.slot_holds h
     where h.class_id = p_class_id and h.status = 'active' and h.expires_at > now()
       and h.blocked_range && p_range and h.booking_id is null
  )
  select greatest(0, (select n from fleet) - (select n from taken_bookings) - (select n from taken_holds));
$$;

-- Create a 20-minute hold atomically. Locks the class row so two visitors cannot take the last vehicle.
-- Raises 'unavailable' or 'too_many_holds' (errcode P0001) for the API to map to error codes.
create function public.create_hold(p_class_key text, p_pickup timestamptz, p_duration_minutes int, p_visitor_key text)
returns public.slot_holds
language plpgsql
as $$
declare
  c public.vehicle_classes;
  r tstzrange;
  h public.slot_holds;
  active_for_visitor int;
begin
  select * into c from public.vehicle_classes where key = p_class_key and active for update;
  if not found then
    raise exception 'invalid_request: unknown vehicle class %', p_class_key;
  end if;

  select count(*) into active_for_visitor from public.slot_holds
   where visitor_key = p_visitor_key and status = 'active' and expires_at > now();
  if active_for_visitor >= public.setting_int('max_active_holds_per_visitor') then
    raise exception 'too_many_holds';
  end if;

  r := public.blocked_range_for(p_pickup, p_duration_minutes, c.buffer_minutes);
  if public.class_availability(c.id, r) < 1 then
    raise exception 'unavailable';
  end if;

  insert into public.slot_holds (class_id, visitor_key, blocked_range, expires_at)
  values (c.id, p_visitor_key, r, now() + make_interval(mins => public.setting_int('hold_minutes')))
  returning * into h;
  return h;
end $$;

-- Marks ended holds and unpaid pending bookings as expired. Run every minute by pg_cron (0006);
-- correctness does not depend on it because every availability query checks expires_at > now().
create function public.expire_holds() returns int language plpgsql as $$
declare
  n int;
begin
  update public.slot_holds set status = 'expired' where status = 'active' and expires_at <= now();
  get diagnostics n = row_count;
  update public.bookings set status = 'expired'
   where status = 'pending' and payment_status = 'unpaid' and hold_expires_at <= now();
  return n;
end $$;
