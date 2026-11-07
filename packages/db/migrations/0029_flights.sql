-- 0029 Flight tracking (B7 / BOOKING-V2-PLAN item 6).
-- Kit called this 0021_flights; this repo already used 0021–0028.

-- ---------------------------------------------------------------------------
-- bookings: flight tracking columns (flight_number already exists)
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists flight_date date,
  add column if not exists flight_status text,
  add column if not exists flight_sched_arr timestamptz,
  add column if not exists flight_eta timestamptz,
  add column if not exists flight_terminal text,
  add column if not exists flight_checked_at timestamptz,
  add column if not exists pickup_shift_min int not null default 0,
  add column if not exists original_pickup_at timestamptz,
  add column if not exists flight_origin text,
  add column if not exists flight_airline text;

alter table public.bookings drop constraint if exists bookings_flight_status_ck;
alter table public.bookings
  add constraint bookings_flight_status_ck check (
    flight_status is null
    or flight_status in ('scheduled', 'delayed', 'landed', 'cancelled', 'diverted', 'unknown')
  );

comment on column public.bookings.flight_date is 'Local flight date used for provider lookup.';
comment on column public.bookings.original_pickup_at is 'First pick-up before any flight delay shift.';
comment on column public.bookings.pickup_shift_min is 'Minutes added to original_pickup_at (ETA buffer shifts).';

-- ---------------------------------------------------------------------------
-- flight_events
-- ---------------------------------------------------------------------------
create table if not exists public.flight_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  at timestamptz not null default now(),
  status text,
  eta timestamptz,
  raw jsonb not null default '{}'::jsonb,
  source text not null default 'system'
);
create index if not exists flight_events_booking_idx on public.flight_events (booking_id, at desc);

alter table public.flight_events enable row level security;
revoke all on public.flight_events from anon, authenticated;
grant select on public.flight_events to authenticated;
create policy flight_events_staff_read on public.flight_events for select to authenticated
  using (public.is_staff());

-- ---------------------------------------------------------------------------
-- booking_events: allow pickup_shifted
-- ---------------------------------------------------------------------------
alter table public.booking_events drop constraint if exists booking_events_kind_check;
alter table public.booking_events
  add constraint booking_events_kind_check check (
    kind in (
      'driver_assigned', 'driver_removed', 'on_way', 'arrived', 'on_board',
      'completed', 'no_show', 'scheduled', 'pickup_shifted'
    )
  );

-- ---------------------------------------------------------------------------
-- settings seeds for flight tracking
-- ---------------------------------------------------------------------------
insert into public.settings (key, value, description) values
  ('flight_buffer_domestic_min', '15'::jsonb, 'Minutes after scheduled/ETA arrival before pick-up (domestic origin).'),
  ('flight_buffer_international_min', '30'::jsonb, 'Minutes after scheduled/ETA arrival before pick-up (international origin).'),
  ('flight_daily_call_cap', '200'::jsonb, 'Max provider flight lookups per UTC day.'),
  ('email_customer_on_flight_change', 'false'::jsonb, 'Email the customer when a flight delay moves pick-up (default off).')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- shift_pickup: move pickup + hold; refuse on vehicle clash
-- Returns jsonb: { ok: true, pickup_at, shift_min } | { ok: false, reason: 'conflict'|'not_found'|… }
-- ---------------------------------------------------------------------------
create or replace function public.shift_pickup(
  p_booking_id uuid,
  p_new_pickup timestamptz,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  c public.vehicle_classes;
  new_range tstzrange;
  shift_min int;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if b.status in ('cancelled', 'expired', 'completed') then
    return jsonb_build_object('ok', false, 'reason', 'bad_status');
  end if;
  if p_new_pickup is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_pickup');
  end if;

  select * into c from public.vehicle_classes where id = b.class_id;
  new_range := public.blocked_range_for(p_new_pickup, b.duration_minutes, c.buffer_minutes);

  if b.vehicle_id is not null and exists (
    select 1 from public.bookings o
     where o.vehicle_id = b.vehicle_id
       and o.id is distinct from b.id
       and o.status not in ('cancelled', 'expired')
       and o.blocked_range && new_range
  ) then
    return jsonb_build_object('ok', false, 'reason', 'conflict');
  end if;

  -- Class capacity: another overlapping hold/booking for the class with no free vehicle.
  if public.class_availability(b.class_id, new_range, b.id) < 1 then
    return jsonb_build_object('ok', false, 'reason', 'conflict');
  end if;

  if b.original_pickup_at is null then
    update public.bookings set original_pickup_at = pickup_at where id = b.id;
    b.original_pickup_at := b.pickup_at;
  end if;

  shift_min := greatest(
    0,
    round(extract(epoch from (p_new_pickup - coalesce(b.original_pickup_at, b.pickup_at))) / 60.0)::int
  );

  update public.bookings
     set pickup_at = p_new_pickup,
         blocked_range = new_range,
         pickup_shift_min = shift_min,
         hold_expires_at = case
           when hold_expires_at is not null and status = 'pending'
             then hold_expires_at + (p_new_pickup - b.pickup_at)
           else hold_expires_at
         end
   where id = b.id;

  -- Move active/converted slot hold if linked.
  update public.slot_holds
     set blocked_range = new_range,
         pickup_at = p_new_pickup,
         duration_minutes = b.duration_minutes
   where booking_id = b.id
     and status in ('active', 'converted');

  insert into public.booking_events (booking_id, kind, source, note)
  values (
    b.id,
    'pickup_shifted',
    'system',
    coalesce(p_reason, 'pickup_shifted')
      || ' · '
      || to_char(b.pickup_at at time zone 'Europe/Athens', 'HH24:MI')
      || ' → '
      || to_char(p_new_pickup at time zone 'Europe/Athens', 'HH24:MI')
  );

  return jsonb_build_object(
    'ok', true,
    'pickup_at', p_new_pickup,
    'previous_pickup_at', b.pickup_at,
    'original_pickup_at', coalesce(b.original_pickup_at, b.pickup_at),
    'shift_min', shift_min
  );
end $$;

revoke all on function public.shift_pickup(uuid, timestamptz, text) from public, anon, authenticated;
