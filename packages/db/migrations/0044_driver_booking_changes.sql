-- 0044 Driver booking-change notices (bell) + first-assign silence.
-- Port of IL 0044 (changes stack) with 0049 bell-noise rules applied up front:
-- record vehicle only when old.vehicle_id is not null; badge counts open/cancelled only.

alter table public.bookings
  add column if not exists name_sign text;

comment on column public.bookings.name_sign is 'Text for the driver name-sign board; optional.';

do $$ begin
  create type public.booking_change_kind as enum (
    'pickup_time', 'pickup_place', 'dropoff_place', 'passengers', 'vehicle', 'flight', 'cancelled', 'notes'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.booking_changes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  kind public.booking_change_kind not null,
  summary text not null,
  before jsonb not null default '{}'::jsonb,
  after jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  source text not null default 'office'
    check (source in ('office', 'system', 'flight', 'driver'))
);

create index if not exists booking_changes_booking_idx
  on public.booking_changes (booking_id, created_at desc);

create table if not exists public.booking_change_acks (
  change_id uuid not null references public.booking_changes(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (change_id, driver_id)
);

alter table public.booking_changes enable row level security;
alter table public.booking_change_acks enable row level security;
revoke all on public.booking_changes from anon, authenticated;
revoke all on public.booking_change_acks from anon, authenticated;
grant select on public.booking_changes to authenticated;
grant select on public.booking_change_acks to authenticated;

drop policy if exists booking_changes_staff_select on public.booking_changes;
create policy booking_changes_staff_select on public.booking_changes
  for select to authenticated using (public.is_staff());

drop policy if exists booking_change_acks_staff_select on public.booking_change_acks;
create policy booking_change_acks_staff_select on public.booking_change_acks
  for select to authenticated using (public.is_staff());

create or replace function public.bookings_record_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  src text := case when public.is_staff() then 'office' else 'system' end;
begin
  if tg_op <> 'UPDATE' then return new; end if;

  if new.pickup_at is distinct from old.pickup_at then
    insert into public.booking_changes (booking_id, kind, summary, before, after, source)
    values (new.id, 'pickup_time', 'Pick-up time changed',
            jsonb_build_object('pickup_at', old.pickup_at),
            jsonb_build_object('pickup_at', new.pickup_at), src);
  end if;

  if new.pickup_address is distinct from old.pickup_address
     or new.pickup_place_id is distinct from old.pickup_place_id
     or new.pickup_lat is distinct from old.pickup_lat
     or new.pickup_lng is distinct from old.pickup_lng then
    insert into public.booking_changes (booking_id, kind, summary, before, after, source)
    values (new.id, 'pickup_place', 'Pick-up place changed',
            jsonb_build_object('address', old.pickup_address, 'place_id', old.pickup_place_id),
            jsonb_build_object('address', new.pickup_address, 'place_id', new.pickup_place_id), src);
  end if;

  if new.dropoff_address is distinct from old.dropoff_address
     or new.dropoff_place_id is distinct from old.dropoff_place_id
     or new.dropoff_lat is distinct from old.dropoff_lat
     or new.dropoff_lng is distinct from old.dropoff_lng then
    insert into public.booking_changes (booking_id, kind, summary, before, after, source)
    values (new.id, 'dropoff_place', 'Drop-off place changed',
            jsonb_build_object('address', old.dropoff_address, 'place_id', old.dropoff_place_id),
            jsonb_build_object('address', new.dropoff_address, 'place_id', new.dropoff_place_id), src);
  end if;

  if new.passengers is distinct from old.passengers then
    insert into public.booking_changes (booking_id, kind, summary, before, after, source)
    values (new.id, 'passengers', 'Passenger count changed',
            jsonb_build_object('passengers', old.passengers),
            jsonb_build_object('passengers', new.passengers), src);
  end if;

  -- Real vehicle swaps only (not the first office assignment).
  if new.vehicle_id is distinct from old.vehicle_id and old.vehicle_id is not null then
    insert into public.booking_changes (booking_id, kind, summary, before, after, source)
    values (new.id, 'vehicle', 'Vehicle changed',
            jsonb_build_object('vehicle_id', old.vehicle_id),
            jsonb_build_object('vehicle_id', new.vehicle_id), src);
  end if;

  if new.flight_number is distinct from old.flight_number
     or new.flight_status is distinct from old.flight_status
     or new.flight_eta is distinct from old.flight_eta
     or new.flight_sched_arr is distinct from old.flight_sched_arr then
    insert into public.booking_changes (booking_id, kind, summary, before, after, source)
    values (new.id, 'flight', 'Flight details changed',
            jsonb_build_object('flight_number', old.flight_number, 'flight_status', old.flight_status,
                               'flight_eta', old.flight_eta, 'flight_sched_arr', old.flight_sched_arr),
            jsonb_build_object('flight_number', new.flight_number, 'flight_status', new.flight_status,
                               'flight_eta', new.flight_eta, 'flight_sched_arr', new.flight_sched_arr),
            case when new.flight_status is distinct from old.flight_status
                      or new.flight_eta is distinct from old.flight_eta then 'flight' else src end);
  end if;

  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    insert into public.booking_changes (booking_id, kind, summary, before, after, source)
    values (new.id, 'cancelled', 'Booking cancelled',
            jsonb_build_object('status', old.status),
            jsonb_build_object('status', new.status), src);
  end if;

  if new.notes is distinct from old.notes or new.name_sign is distinct from old.name_sign then
    insert into public.booking_changes (booking_id, kind, summary, before, after, source)
    values (new.id, 'notes', 'Notes updated',
            jsonb_build_object('notes', old.notes, 'name_sign', old.name_sign),
            jsonb_build_object('notes', new.notes, 'name_sign', new.name_sign), src);
  end if;

  return new;
end $$;

drop trigger if exists bookings_record_changes on public.bookings;
create trigger bookings_record_changes
  after update on public.bookings
  for each row execute function public.bookings_record_changes();

create or replace function public.driver_ack_change(p_change_id uuid) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.current_driver_id();
  ch public.booking_changes;
  b_driver uuid;
  ack_at timestamptz;
begin
  if me is null then raise exception 'forbidden: not a driver'; end if;
  select * into ch from public.booking_changes where id = p_change_id;
  if not found then raise exception 'not_found: change %', p_change_id; end if;
  select driver_id into b_driver from public.bookings where id = ch.booking_id;
  if b_driver is distinct from me then raise exception 'forbidden: not your booking'; end if;
  insert into public.booking_change_acks (change_id, driver_id, acknowledged_at)
  values (p_change_id, me, now())
  on conflict (change_id, driver_id) do update set acknowledged_at = excluded.acknowledged_at
  returning acknowledged_at into ack_at;
  return ack_at;
end $$;

revoke all on function public.driver_ack_change(uuid) from public, anon;
grant execute on function public.driver_ack_change(uuid) to authenticated, service_role;

-- Badge: only open / cancelled jobs (not completed history).
create or replace function public.driver_me() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', d.id,
    'fullName', d.full_name,
    'email', d.email,
    'phone', d.phone,
    'shift', (select jsonb_build_object(
                'id', s.id,
                'startedAt', s.started_at,
                'vehicleId', v.id,
                'vehicleLabel', v.label,
                'className', c.name,
                'plate', v.plate
              )
              from public.driver_shifts s
              join public.vehicles v on v.id = s.vehicle_id
              join public.vehicle_classes c on c.id = v.class_id
             where s.driver_id = d.id and s.ended_at is null),
    'unacknowledgedChanges', (
      select count(*)::int
        from public.booking_changes bc
        join public.bookings b on b.id = bc.booking_id
       where b.driver_id = d.id
         and b.status in ('confirmed', 'assigned', 'cancelled')
         and not exists (
           select 1 from public.booking_change_acks a
            where a.change_id = bc.id and a.driver_id = d.id
         )
    )
  )
  from public.drivers d where d.id = public.current_driver_id();
$$;
