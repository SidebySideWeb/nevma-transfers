-- 0019 Drivers (kit file 0015; repo number 0019 — 0015 already used) and dispatch module (decided by the user 1 Nov 2026). Rules: docs/DRIVERS.md.
-- Adds drivers, the driver on each booking, shifts (start of day with a vehicle), a trip status timeline,
-- driver pay plans, adjustments, statements and reports, and the functions behind the driver API (v1).
-- Additive only: no existing column, constraint or behaviour changes. Applies on kit 1 + 0011–0014.
-- No GPS: "where is every vehicle and driver" comes from shifts, assignments and trip statuses.

-- 1. Drivers ---------------------------------------------------------------------------------------
create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique,                          -- auth.users.id, set when the driver accepts the invitation
  full_name text not null,
  email text not null,
  phone text not null,
  employment text not null default 'employee' check (employment in ('employee', 'freelancer')),
  active boolean not null default true,
  licence_number text,
  licence_expires_on date,
  permit_expires_on date,                       -- professional driver permit
  notes text,                                   -- staff only
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index drivers_email_key on public.drivers (lower(email));
create trigger drivers_touch before update on public.drivers for each row execute function public.touch_updated_at();

-- The signed-in user's driver id (active drivers only); null for everyone else.
create function public.current_driver_id() returns uuid
language sql stable security definer set search_path = public
as $$ select id from public.drivers where user_id = auth.uid() and active $$;
revoke all on function public.current_driver_id() from public, anon;
grant execute on function public.current_driver_id() to authenticated;

-- 2. Driver and trip status on bookings ----------------------------------------------------------
alter table public.bookings
  add column driver_id uuid references public.drivers(id),
  add column trip_status text not null default 'scheduled'
    check (trip_status in ('scheduled', 'on_way', 'arrived', 'on_board', 'completed', 'no_show'));
create index bookings_driver_idx on public.bookings (driver_id, pickup_at);
-- The same driver can never be on two overlapping bookings (same rule as vehicles).
alter table public.bookings add constraint bookings_no_driver_overlap exclude using gist (driver_id with =, blocked_range with &&)
  where (driver_id is not null and status in ('pending', 'confirmed', 'assigned'));
grant update (driver_id) on public.bookings to authenticated;          -- staff only, through bookings_staff_update

create table public.booking_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  kind text not null check (kind in ('driver_assigned', 'driver_removed', 'on_way', 'arrived', 'on_board', 'completed', 'no_show', 'scheduled')),
  driver_id uuid references public.drivers(id),
  source text not null check (source in ('driver', 'office', 'system')),
  note text,
  created_by uuid,
  at timestamptz not null default now()
);
create index booking_events_booking_idx on public.booking_events (booking_id, at);

-- Assigning a driver: only active drivers; every change is recorded.
create function public.bookings_driver_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.driver_id is not distinct from old.driver_id then return new; end if;
  if new.driver_id is not null and not exists (select 1 from public.drivers where id = new.driver_id and active) then
    raise exception 'driver_inactive: this driver is not active';
  end if;
  if old.driver_id is not null then
    insert into public.booking_events (booking_id, kind, driver_id, source, created_by) values (new.id, 'driver_removed', old.driver_id, case when public.is_staff() then 'office' else 'system' end, auth.uid());
  end if;
  if new.driver_id is not null then
    insert into public.booking_events (booking_id, kind, driver_id, source, created_by) values (new.id, 'driver_assigned', new.driver_id, case when public.is_staff() then 'office' else 'system' end, auth.uid());
    new.trip_status := 'scheduled';
  end if;
  return new;
end $$;
create trigger bookings_driver_change before update of driver_id on public.bookings for each row execute function public.bookings_driver_change();

-- 3. Shifts: a driver starts the day by choosing a vehicle -----------------------------------------
create table public.driver_shifts (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id),
  vehicle_id uuid not null references public.vehicles(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  start_odometer int check (start_odometer >= 0),
  end_odometer int check (end_odometer >= 0),
  source text not null default 'driver' check (source in ('driver', 'office')),
  note text,
  check (ended_at is null or ended_at > started_at),
  check (end_odometer is null or start_odometer is null or end_odometer >= start_odometer),
  -- one open (or overlapping) shift per driver and per vehicle
  constraint driver_shifts_driver_overlap exclude using gist (driver_id with =, tstzrange(started_at, coalesce(ended_at, 'infinity'::timestamptz)) with &&),
  constraint driver_shifts_vehicle_overlap exclude using gist (vehicle_id with =, tstzrange(started_at, coalesce(ended_at, 'infinity'::timestamptz)) with &&)
);
create index driver_shifts_driver_idx on public.driver_shifts (driver_id, started_at);

-- 4. Trip status (driver app or office) -----------------------------------------------------------
-- Order: scheduled → on_way → arrived → on_board → completed; no_show from on_way or arrived.
-- Drivers: only their own bookings, only forward, and only while on shift. Staff: any status.
-- Completed (or no-show) ends the booking as today: status completed.
create function public.set_trip_status(p_reference text, p_status text, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
  me uuid := public.current_driver_id();
  staff boolean := public.is_staff();
  rank_of constant jsonb := '{"scheduled":0,"on_way":1,"arrived":2,"on_board":3,"completed":4,"no_show":4}';
begin
  if p_status not in ('scheduled', 'on_way', 'arrived', 'on_board', 'completed', 'no_show') then
    raise exception 'invalid_request: unknown trip status %', p_status;
  end if;
  select * into b from public.bookings where reference = upper(p_reference) for update;
  if not found then raise exception 'not_found: booking %', p_reference; end if;
  if not staff then
    if me is null or b.driver_id is distinct from me then raise exception 'forbidden: not your booking'; end if;
    if not exists (select 1 from public.driver_shifts where driver_id = me and ended_at is null) then
      raise exception 'no_shift: start your day with a vehicle first';
    end if;
    if (rank_of ->> p_status)::int <= (rank_of ->> b.trip_status)::int then
      raise exception 'invalid_transition: % to %', b.trip_status, p_status;
    end if;
    if p_status = 'no_show' and b.trip_status not in ('on_way', 'arrived') then
      raise exception 'invalid_transition: % to no_show', b.trip_status;
    end if;
  end if;
  if b.status not in ('confirmed', 'assigned', 'completed') then
    raise exception 'invalid_transition: the booking is %', b.status;
  end if;
  update public.bookings
     set trip_status = p_status,
         status = case when p_status in ('completed', 'no_show') and status in ('confirmed', 'assigned') then 'completed'::public.booking_status else status end
   where id = b.id;
  insert into public.booking_events (booking_id, kind, driver_id, source, note, created_by)
  values (b.id, p_status, b.driver_id, case when staff then 'office' else 'driver' end, p_note, auth.uid());
  return p_status;
end $$;

-- 5. Driver API functions (v1). The REST API in apps/admin calls these with the driver's own session. ----
create function public.driver_me() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', d.id, 'fullName', d.full_name, 'email', d.email, 'phone', d.phone,
    'shift', (select jsonb_build_object('id', s.id, 'startedAt', s.started_at, 'vehicleId', v.id, 'vehicleLabel', v.label, 'className', c.name)
                from public.driver_shifts s join public.vehicles v on v.id = s.vehicle_id join public.vehicle_classes c on c.id = v.class_id
               where s.driver_id = d.id and s.ended_at is null))
  from public.drivers d where d.id = public.current_driver_id();
$$;

-- Vehicles a driver can start the day with: active, not in another open shift.
create function public.driver_vehicles() returns table (id uuid, label text, class_name text, plate text)
language sql stable security definer set search_path = public as $$
  select v.id, v.label, c.name, v.plate from public.vehicles v join public.vehicle_classes c on c.id = v.class_id
   where public.current_driver_id() is not null and v.status = 'active'
     and not exists (select 1 from public.driver_shifts s where s.vehicle_id = v.id and s.ended_at is null)
   order by c.sort_order, v.label;
$$;

create function public.driver_start_shift(p_vehicle_id uuid, p_odometer int default null) returns public.driver_shifts
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.current_driver_id();
  s public.driver_shifts;
begin
  if me is null then raise exception 'forbidden: not a driver'; end if;
  if exists (select 1 from public.driver_shifts where driver_id = me and ended_at is null) then raise exception 'already_on_shift: end your current day first'; end if;
  if not exists (select 1 from public.vehicles where id = p_vehicle_id and status = 'active') then raise exception 'vehicle_unavailable: this vehicle is not in service'; end if;
  if exists (select 1 from public.driver_shifts where vehicle_id = p_vehicle_id and ended_at is null) then raise exception 'vehicle_in_use: another driver has this vehicle'; end if;
  insert into public.driver_shifts (driver_id, vehicle_id, start_odometer, source) values (me, p_vehicle_id, p_odometer, 'driver') returning * into s;
  return s;
end $$;

create function public.driver_end_shift(p_odometer int default null) returns public.driver_shifts
language plpgsql security definer set search_path = public as $$
declare
  s public.driver_shifts;
begin
  update public.driver_shifts set ended_at = now(), end_odometer = p_odometer
   where driver_id = public.current_driver_id() and ended_at is null returning * into s;
  if not found then raise exception 'no_shift: you have not started a day'; end if;
  return s;
end $$;

-- The driver's jobs between two Athens dates (at most 31 days). No prices or payment data. The customer's
-- phone is shown only from 24 hours before pick-up until 6 hours after the trip ends.
create function public.driver_jobs(p_from date, p_to date)
returns table (reference text, booking_type text, status text, trip_status text, pickup_at timestamptz, ends_at timestamptz,
               from_zone text, to_zone text, pickup_address text, dropoff_address text, hours int, flight_number text,
               passengers int, luggage int, customer_name text, customer_phone text, notes text, class_name text,
               vehicle_label text, vip_security boolean, extras text[])
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if public.current_driver_id() is null then raise exception 'forbidden: not a driver'; end if;
  if p_to < p_from or p_to - p_from > 31 then raise exception 'invalid_request: choose up to 31 days'; end if;
  return query
  select b.reference, b.booking_type::text, b.status::text, b.trip_status, b.pickup_at, b.pickup_at + make_interval(mins => b.duration_minutes),
         zf.name, zt.name, b.pickup_address, b.dropoff_address, b.hours, b.flight_number, b.passengers, b.luggage, b.customer_name,
         case when now() between b.pickup_at - interval '24 hours' and b.pickup_at + make_interval(mins => b.duration_minutes) + interval '6 hours'
              then b.customer_phone end,
         b.notes, c.name, v.label, b.vip_security,
         coalesce((select array_agg(e.name order by e.name) from public.booking_extras be join public.extras e on e.id = be.extra_id where be.booking_id = b.id), '{}')
    from public.bookings b
    join public.zones zf on zf.id = b.from_zone_id
    left join public.zones zt on zt.id = b.to_zone_id
    join public.vehicle_classes c on c.id = b.class_id
    left join public.vehicles v on v.id = b.vehicle_id
   where b.driver_id = public.current_driver_id()
     and b.status in ('confirmed', 'assigned', 'completed')
     and (b.pickup_at at time zone 'Europe/Athens')::date between p_from and p_to
   order by b.pickup_at;
end $$;

-- 6. "Now": every vehicle and every active driver, from shifts, assignments and trip statuses ------
create view public.fleet_now with (security_invoker = true) as
select v.id as vehicle_id, v.label as vehicle_label, c.name as class_name, v.status as vehicle_status,
       s.id as shift_id, s.started_at as shift_started_at, d.id as driver_id, d.full_name as driver_name,
       cur.reference as current_reference, cur.trip_status as current_trip_status, cur.pickup_at as current_pickup_at,
       nxt.reference as next_reference, nxt.pickup_at as next_pickup_at,
       greatest(s.started_at, (select max(e.at) from public.booking_events e join public.bookings bb on bb.id = e.booking_id where bb.vehicle_id = v.id)) as last_update_at
  from public.vehicles v
  join public.vehicle_classes c on c.id = v.class_id
  left join public.driver_shifts s on s.vehicle_id = v.id and s.ended_at is null
  left join public.drivers d on d.id = s.driver_id
  left join lateral (select b.reference, b.trip_status, b.pickup_at from public.bookings b
                      where b.vehicle_id = v.id and b.status in ('confirmed', 'assigned') and b.trip_status in ('on_way', 'arrived', 'on_board')
                      order by b.pickup_at limit 1) cur on true
  left join lateral (select b.reference, b.pickup_at from public.bookings b
                      where b.vehicle_id = v.id and b.status in ('confirmed', 'assigned') and b.trip_status = 'scheduled' and b.pickup_at >= now() - interval '1 hour'
                      order by b.pickup_at limit 1) nxt on true
 where v.status <> 'retired';

create view public.drivers_now with (security_invoker = true) as
select d.id as driver_id, d.full_name, d.phone, d.active, s.id as shift_id, s.started_at as shift_started_at, v.label as vehicle_label,
       cur.reference as current_reference, cur.trip_status as current_trip_status,
       nxt.reference as next_reference, nxt.pickup_at as next_pickup_at,
       (select count(*)::int from public.bookings b where b.driver_id = d.id and b.status in ('confirmed', 'assigned', 'completed')
           and (b.pickup_at at time zone 'Europe/Athens')::date = (now() at time zone 'Europe/Athens')::date) as jobs_today,
       d.licence_expires_on, d.permit_expires_on
  from public.drivers d
  left join public.driver_shifts s on s.driver_id = d.id and s.ended_at is null
  left join public.vehicles v on v.id = s.vehicle_id
  left join lateral (select b.reference, b.trip_status from public.bookings b
                      where b.driver_id = d.id and b.status in ('confirmed', 'assigned') and b.trip_status in ('on_way', 'arrived', 'on_board')
                      order by b.pickup_at limit 1) cur on true
  left join lateral (select b.reference, b.pickup_at from public.bookings b
                      where b.driver_id = d.id and b.status in ('confirmed', 'assigned') and b.trip_status = 'scheduled' and b.pickup_at >= now() - interval '1 hour'
                      order by b.pickup_at limit 1) nxt on true
 where d.active;

-- 7. Driver pay ------------------------------------------------------------------------------------
-- A plan holds any mix of: monthly salary, daily rate (days with a shift), hourly rate (shift hours or
-- hourly-hire hours), percentage of the booking price (final or before VAT), fixed amount per transfer
-- (overridable per class and/or route). Plans have dates and never overlap for one driver.
create table public.driver_pay_plans (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  valid_from date not null,
  valid_to date,
  monthly_salary_cents int not null default 0 check (monthly_salary_cents >= 0),
  daily_rate_cents int not null default 0 check (daily_rate_cents >= 0),
  hourly_rate_cents int not null default 0 check (hourly_rate_cents >= 0),
  hourly_basis text not null default 'shift' check (hourly_basis in ('shift', 'hourly_bookings')),
  percent_bp int not null default 0 check (percent_bp between 0 and 10000),        -- 3000 = 30%
  percent_base text not null default 'final' check (percent_base in ('final', 'net')),
  per_transfer_cents int not null default 0 check (per_transfer_cents >= 0),
  note text,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from),
  constraint driver_pay_plans_no_overlap exclude using gist (driver_id with =, daterange(valid_from, coalesce(valid_to, 'infinity'::date), '[]') with &&)
);

create table public.driver_pay_rates (                      -- fixed amount per transfer, more specific than the plan default
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.driver_pay_plans(id) on delete cascade,
  class_id uuid references public.vehicle_classes(id),
  from_zone_id uuid references public.zones(id),
  to_zone_id uuid references public.zones(id),
  amount_cents int not null check (amount_cents >= 0),
  check (class_id is not null or (from_zone_id is not null and to_zone_id is not null)),
  check ((from_zone_id is null) = (to_zone_id is null))
);
create unique index driver_pay_rates_key on public.driver_pay_rates (plan_id, coalesce(class_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(from_zone_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(to_zone_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.driver_pay_adjustments (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  on_date date not null,
  kind text not null check (kind in ('tip', 'waiting', 'expense', 'bonus', 'deduction', 'advance')),
  amount_cents int not null check (amount_cents <> 0),         -- deductions and advances are negative
  booking_id uuid references public.bookings(id),
  note text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  check ((kind in ('deduction', 'advance')) = (amount_cents < 0))
);

-- What a driver earned between two Athens dates (inclusive), line by line. Staff for any driver; a driver for themself.
create function public.driver_earnings(p_driver_id uuid, p_from date, p_to date)
returns table (kind text, on_date date, reference text, description text, quantity numeric, rate_cents int, amount_cents int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  vat_bp int := coalesce(public.setting_int('vat_rate_bp'), 2400);
begin
  if not (public.is_staff() or public.current_driver_id() = p_driver_id) then raise exception 'forbidden'; end if;
  if p_to < p_from then raise exception 'invalid_request: the period ends before it starts'; end if;
  return query
  with plans as (select * from public.driver_pay_plans where driver_id = p_driver_id),
  done as (   -- bookings the driver carried out in the period (completed or no-show)
    select b.*, (b.pickup_at at time zone 'Europe/Athens')::date as d from public.bookings b
     where b.driver_id = p_driver_id and b.status = 'completed'
       and (b.pickup_at at time zone 'Europe/Athens')::date between p_from and p_to),
  shifts as (
    select s.*, (s.started_at at time zone 'Europe/Athens')::date as d,
           round((extract(epoch from (s.ended_at - s.started_at)) / 3600)::numeric, 2) as hrs
      from public.driver_shifts s where s.driver_id = p_driver_id and s.ended_at is not null
       and (s.started_at at time zone 'Europe/Athens')::date between p_from and p_to),
  months as (select m::date as m_start, (m + interval '1 month - 1 day')::date as m_end
               from generate_series(date_trunc('month', p_from), p_to, interval '1 month') m)
  -- monthly salary, pro rata per calendar month
  select 'salary'::text, greatest(p_from, ms.m_start, p.valid_from),
         null::text, 'Salary ' || to_char(ms.m_start, 'Mon YYYY') || ' (' || (least(p_to, ms.m_end, coalesce(p.valid_to, 'infinity'::date)) - greatest(p_from, ms.m_start, p.valid_from) + 1) || '/' || (ms.m_end - ms.m_start + 1) || ' days)',
         (least(p_to, ms.m_end, coalesce(p.valid_to, 'infinity'::date)) - greatest(p_from, ms.m_start, p.valid_from) + 1)::numeric,
         p.monthly_salary_cents,
         round(p.monthly_salary_cents::numeric * (least(p_to, ms.m_end, coalesce(p.valid_to, 'infinity'::date)) - greatest(p_from, ms.m_start, p.valid_from) + 1) / (ms.m_end - ms.m_start + 1))::int
    from plans p join months ms on p.valid_from <= ms.m_end and coalesce(p.valid_to, 'infinity'::date) >= ms.m_start
   where p.monthly_salary_cents > 0
     and least(p_to, ms.m_end, coalesce(p.valid_to, 'infinity'::date)) >= greatest(p_from, ms.m_start, p.valid_from)
  union all
  -- daily rate: one line per day with a shift
  select 'day', x.d, null, 'Day worked', 1::numeric, p.daily_rate_cents, p.daily_rate_cents
    from (select distinct d from shifts) x join plans p on x.d between p.valid_from and coalesce(p.valid_to, 'infinity'::date)
   where p.daily_rate_cents > 0
  union all
  -- hourly rate on shift hours
  select 'hours', s.d, null, 'Shift hours (' || v.label || ')', s.hrs, p.hourly_rate_cents, round(s.hrs * p.hourly_rate_cents)::int
    from shifts s join public.vehicles v on v.id = s.vehicle_id
    join plans p on s.d between p.valid_from and coalesce(p.valid_to, 'infinity'::date)
   where p.hourly_rate_cents > 0 and p.hourly_basis = 'shift'
  union all
  -- hourly rate on hourly hires
  select 'hours', b.d, b.reference, 'Hourly hire ' || b.hours || ' h', b.hours::numeric, p.hourly_rate_cents, b.hours * p.hourly_rate_cents
    from done b join plans p on b.d between p.valid_from and coalesce(p.valid_to, 'infinity'::date)
   where p.hourly_rate_cents > 0 and p.hourly_basis = 'hourly_bookings' and b.booking_type = 'hourly'
  union all
  -- percentage of the booking price
  select 'percent', b.d, b.reference,
         (p.percent_bp / 100.0)::numeric(6, 2) || '% of ' || case p.percent_base when 'net' then 'price before VAT' else 'price' end,
         1::numeric, null::int,
         round((case p.percent_base when 'net' then round(b.price_cents * 10000.0 / (10000 + vat_bp)) else b.price_cents end) * p.percent_bp / 10000.0)::int
    from done b join plans p on b.d between p.valid_from and coalesce(p.valid_to, 'infinity'::date)
   where p.percent_bp > 0
  union all
  -- fixed amount per transfer: class + route, then route, then class, then the plan's default
  select 'transfer', b.d, b.reference, 'Transfer', 1::numeric, r.amount, r.amount
    from done b join plans p on b.d between p.valid_from and coalesce(p.valid_to, 'infinity'::date)
    cross join lateral (
      select coalesce(
        (select amount_cents from public.driver_pay_rates x where x.plan_id = p.id and x.class_id = b.class_id and x.from_zone_id = b.from_zone_id and x.to_zone_id = b.to_zone_id),
        (select amount_cents from public.driver_pay_rates x where x.plan_id = p.id and x.class_id is null and x.from_zone_id = b.from_zone_id and x.to_zone_id = b.to_zone_id),
        (select amount_cents from public.driver_pay_rates x where x.plan_id = p.id and x.class_id = b.class_id and x.from_zone_id is null),
        p.per_transfer_cents) as amount) r
   where b.booking_type = 'transfer' and r.amount > 0
  union all
  -- adjustments
  select 'adjustment', a.on_date, (select reference from public.bookings where id = a.booking_id), initcap(a.kind) || ': ' || a.note, 1::numeric, a.amount_cents, a.amount_cents
    from public.driver_pay_adjustments a
   where a.driver_id = p_driver_id and a.on_date between p_from and p_to
  order by 2, 1, 3;
end $$;

-- 8. Statements: draft → approved (lines frozen) → paid ------------------------------------------------
create table public.driver_statements (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id),
  period_from date not null,
  period_to date not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'paid')),
  total_cents int not null default 0,
  approved_by uuid, approved_at timestamptz,
  paid_at timestamptz, payment_reference text,
  created_at timestamptz not null default now(),
  check (period_to >= period_from),
  constraint driver_statements_no_overlap exclude using gist (driver_id with =, daterange(period_from, period_to, '[]') with &&)
);
create table public.driver_statement_lines (
  id bigint generated always as identity primary key,
  statement_id uuid not null references public.driver_statements(id) on delete cascade,
  kind text not null, on_date date not null, reference text, description text not null,
  quantity numeric not null, rate_cents int, amount_cents int not null
);
create index driver_statement_lines_idx on public.driver_statement_lines (statement_id, on_date);

create function public.driver_statement_build(p_driver_id uuid, p_from date, p_to date) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  select id into sid from public.driver_statements where driver_id = p_driver_id and period_from = p_from and period_to = p_to;
  if sid is null then
    insert into public.driver_statements (driver_id, period_from, period_to) values (p_driver_id, p_from, p_to) returning id into sid;
  elsif (select status from public.driver_statements where id = sid) <> 'draft' then
    raise exception 'statement_locked: this statement is approved and cannot be recalculated';
  end if;
  delete from public.driver_statement_lines where statement_id = sid;
  insert into public.driver_statement_lines (statement_id, kind, on_date, reference, description, quantity, rate_cents, amount_cents)
  select sid, e.kind, e.on_date, e.reference, e.description, e.quantity, e.rate_cents, e.amount_cents from public.driver_earnings(p_driver_id, p_from, p_to) e;
  update public.driver_statements set total_cents = coalesce((select sum(amount_cents) from public.driver_statement_lines where statement_id = sid), 0) where id = sid;
  return sid;
end $$;

create function public.driver_statement_approve(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  update public.driver_statements set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_id and status = 'draft';
  if not found then raise exception 'invalid_transition: only a draft can be approved'; end if;
end $$;

create function public.driver_statement_mark_paid(p_id uuid, p_reference text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
  if coalesce(btrim(p_reference), '') = '' then raise exception 'invalid_request: give the payment reference'; end if;
  update public.driver_statements set status = 'paid', paid_at = now(), payment_reference = p_reference where id = p_id and status = 'approved';
  if not found then raise exception 'invalid_transition: only an approved statement can be marked paid'; end if;
end $$;

-- Lines of an approved or paid statement never change.
create function public.driver_statement_lines_guard() returns trigger language plpgsql as $$
begin
  if (select status from public.driver_statements where id = coalesce(new.statement_id, old.statement_id)) <> 'draft' then
    raise exception 'statement_locked: this statement is approved';
  end if;
  return coalesce(new, old);
end $$;
create trigger driver_statement_lines_guard before insert or update or delete on public.driver_statement_lines
  for each row execute function public.driver_statement_lines_guard();

-- 9. Reports (staff) ------------------------------------------------------------------------------
create function public.report_driver_pay(p_from date, p_to date)
returns table (driver_id uuid, full_name text, jobs int, days_worked int, shift_hours numeric, total_cents int, statement_status text)
language sql stable security definer set search_path = public as $$
  select d.id, d.full_name,
         (select count(*)::int from public.bookings b where b.driver_id = d.id and b.status = 'completed' and (b.pickup_at at time zone 'Europe/Athens')::date between p_from and p_to),
         (select count(distinct (s.started_at at time zone 'Europe/Athens')::date)::int from public.driver_shifts s where s.driver_id = d.id and (s.started_at at time zone 'Europe/Athens')::date between p_from and p_to),
         (select coalesce(round(sum(extract(epoch from (s.ended_at - s.started_at)) / 3600)::numeric, 2), 0) from public.driver_shifts s where s.driver_id = d.id and s.ended_at is not null and (s.started_at at time zone 'Europe/Athens')::date between p_from and p_to),
         (select coalesce(sum(e.amount_cents), 0)::int from public.driver_earnings(d.id, p_from, p_to) e),
         (select st.status from public.driver_statements st where st.driver_id = d.id and st.period_from = p_from and st.period_to = p_to)
    from public.drivers d
   where public.is_staff()
   order by d.full_name;
$$;

create function public.report_vehicle_usage(p_from date, p_to date)
returns table (vehicle_id uuid, label text, class_name text, jobs int, booked_hours numeric, shift_days int, shift_hours numeric)
language sql stable security definer set search_path = public as $$
  select v.id, v.label, c.name,
         (select count(*)::int from public.bookings b where b.vehicle_id = v.id and b.status = 'completed' and (b.pickup_at at time zone 'Europe/Athens')::date between p_from and p_to),
         (select coalesce(round(sum(b.duration_minutes) / 60.0, 2), 0) from public.bookings b where b.vehicle_id = v.id and b.status = 'completed' and (b.pickup_at at time zone 'Europe/Athens')::date between p_from and p_to),
         (select count(distinct (s.started_at at time zone 'Europe/Athens')::date)::int from public.driver_shifts s where s.vehicle_id = v.id and (s.started_at at time zone 'Europe/Athens')::date between p_from and p_to),
         (select coalesce(round(sum(extract(epoch from (s.ended_at - s.started_at)) / 3600)::numeric, 2), 0) from public.driver_shifts s where s.vehicle_id = v.id and s.ended_at is not null and (s.started_at at time zone 'Europe/Athens')::date between p_from and p_to)
    from public.vehicles v join public.vehicle_classes c on c.id = v.class_id
   where public.is_staff()
   order by c.sort_order, v.label;
$$;

create function public.report_bookings_per_day(p_from date, p_to date)
returns table (day date, completed int, no_show int, cancelled int, revenue_cents int, online int, office int)
language sql stable security definer set search_path = public as $$
  select g::date,
         count(*) filter (where b.status = 'completed' and b.trip_status <> 'no_show')::int,
         count(*) filter (where b.trip_status = 'no_show')::int,
         count(*) filter (where b.status = 'cancelled')::int,
         coalesce(sum(b.price_cents) filter (where b.status = 'completed'), 0)::int,
         count(*) filter (where b.status = 'completed' and b.source = 'online')::int,
         count(*) filter (where b.status = 'completed' and b.source = 'office')::int
    from generate_series(p_from, p_to, interval '1 day') g
    left join public.bookings b on (b.pickup_at at time zone 'Europe/Athens')::date = g::date and b.status in ('completed', 'cancelled')
   where public.is_staff()
   group by g order by g;
$$;

-- 10. Access ---------------------------------------------------------------------------------------
alter table public.drivers enable row level security;
alter table public.driver_shifts enable row level security;
alter table public.booking_events enable row level security;
alter table public.driver_pay_plans enable row level security;
alter table public.driver_pay_rates enable row level security;
alter table public.driver_pay_adjustments enable row level security;
alter table public.driver_statements enable row level security;
alter table public.driver_statement_lines enable row level security;

create policy drivers_staff_all on public.drivers for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy drivers_self_read on public.drivers for select to authenticated using (user_id = auth.uid());
create policy driver_shifts_staff_all on public.driver_shifts for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy driver_shifts_self_read on public.driver_shifts for select to authenticated using (driver_id = public.current_driver_id());
create policy booking_events_staff_read on public.booking_events for select to authenticated using (public.is_staff());
do $$
declare t text;
begin
  foreach t in array array['driver_pay_plans', 'driver_pay_rates', 'driver_pay_adjustments'] loop
    execute format('create policy %I on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())', t || '_staff_all', t);
  end loop;
  foreach t in array array['driver_statements', 'driver_statement_lines'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_staff())', t || '_staff_read', t);
  end loop;
end $$;
revoke insert, update, delete on public.booking_events, public.driver_statements, public.driver_statement_lines from authenticated;
revoke delete on public.drivers from authenticated;                     -- drivers are switched off, never deleted
revoke update on public.drivers from authenticated;                     -- user_id is set only by the server (invitation)
grant update (full_name, email, phone, employment, active, licence_number, licence_expires_on, permit_expires_on, notes) on public.drivers to authenticated;
grant select on public.fleet_now, public.drivers_now to authenticated;
revoke all on public.fleet_now, public.drivers_now from anon;

do $$
declare f text;
begin
  foreach f in array array['set_trip_status(text, text, text)', 'driver_me()', 'driver_vehicles()', 'driver_start_shift(uuid, int)', 'driver_end_shift(int)',
                           'driver_jobs(date, date)', 'driver_earnings(uuid, date, date)', 'driver_statement_build(uuid, date, date)', 'driver_statement_approve(uuid)',
                           'driver_statement_mark_paid(uuid, text)', 'report_driver_pay(date, date)', 'report_vehicle_usage(date, date)', 'report_bookings_per_day(date, date)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Linking a driver to their login: done by the web app's signed internal route with the service role
-- (invite by e-mail), never by staff or the driver directly.
