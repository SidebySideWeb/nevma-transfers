-- 0030 Corporate accounts (B9 / BOOKING-V2-PLAN item 7).
-- Kit called this 0022_corporate; this repo already used 0022–0029.

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('hotel', 'agency', 'company')),
  vat_number text,
  tax_office text,
  billing_address text,
  billing_email text,
  discount_pct numeric(5, 2) not null default 0 check (discount_pct >= 0 and discount_pct <= 100),
  pay_on_account boolean not null default false,
  credit_limit_cents int check (credit_limit_cents is null or credit_limit_cents >= 0),
  payment_terms_days int not null default 30 check (payment_terms_days >= 1 and payment_terms_days <= 365),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists companies_active_idx on public.companies (active, name);

-- ---------------------------------------------------------------------------
-- company_prices: fixed price per class for a zone route or hourly
-- ---------------------------------------------------------------------------
create table if not exists public.company_prices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  class_id uuid not null references public.vehicle_classes(id) on delete cascade,
  booking_type public.booking_type not null,
  from_zone_id uuid references public.zones(id),
  to_zone_id uuid references public.zones(id),
  price_cents int not null check (price_cents >= 0),
  created_at timestamptz not null default now(),
  check (
    (booking_type = 'transfer' and from_zone_id is not null and to_zone_id is not null and from_zone_id <> to_zone_id)
    or (booking_type = 'hourly' and from_zone_id is null and to_zone_id is null)
  )
);
create unique index if not exists company_prices_transfer_uq
  on public.company_prices (company_id, class_id, from_zone_id, to_zone_id)
  where booking_type = 'transfer';
create unique index if not exists company_prices_hourly_uq
  on public.company_prices (company_id, class_id)
  where booking_type = 'hourly';

-- ---------------------------------------------------------------------------
-- company_users
-- ---------------------------------------------------------------------------
create table if not exists public.company_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  email text not null,
  role text not null check (role in ('admin', 'booker')),
  active boolean not null default true,
  invited_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (company_id, user_id),
  unique (company_id, email)
);
create index if not exists company_users_user_idx on public.company_users (user_id) where active;

-- ---------------------------------------------------------------------------
-- bookings: corporate fields
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists company_id uuid references public.companies(id),
  add column if not exists booked_by uuid,
  add column if not exists guest_name text,
  add column if not exists guest_phone text,
  add column if not exists cost_center text;

create index if not exists bookings_company_idx on public.bookings (company_id, pickup_at desc)
  where company_id is not null;

comment on column public.bookings.booked_by is 'Supabase auth user (company booker) who placed the booking.';
comment on column public.bookings.guest_name is 'Guest travelling when booked by a company.';

-- payment_method already allows on_account (0011).

-- ---------------------------------------------------------------------------
-- company_statements
-- ---------------------------------------------------------------------------
create table if not exists public.company_statements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  period_from date not null,
  period_to date not null,
  total_cents int not null default 0 check (total_cents >= 0),
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid')),
  paid_ref text,
  pdf_path text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  paid_at timestamptz,
  check (period_to >= period_from)
);
create index if not exists company_statements_company_idx
  on public.company_statements (company_id, period_from desc);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.current_company_id() returns uuid
language sql stable security definer set search_path = public
as $$
  select company_id from public.company_users
   where user_id = auth.uid() and active
   limit 1
$$;
revoke all on function public.current_company_id() from anon;
grant execute on function public.current_company_id() to authenticated;

create or replace function public.is_company_admin(p_company_id uuid default null) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.company_users
     where user_id = auth.uid() and active and role = 'admin'
       and (p_company_id is null or company_id = p_company_id)
  )
$$;
revoke all on function public.is_company_admin(uuid) from anon;
grant execute on function public.is_company_admin(uuid) to authenticated;

/** Open on-account balance (confirmed/assigned/completed unpaid or paid-via-on_account outstanding). */
create or replace function public.company_open_balance_cents(p_company_id uuid) returns int
language sql stable security definer set search_path = public
as $$
  select coalesce(sum(b.price_cents), 0)::int
    from public.bookings b
   where b.company_id = p_company_id
     and b.payment_method = 'on_account'
     and b.status not in ('cancelled', 'expired')
     and b.payment_status in ('unpaid', 'partially_refunded')
$$;
revoke all on function public.company_open_balance_cents(uuid) from anon;
grant execute on function public.company_open_balance_cents(uuid) to authenticated, service_role;

/** Sum on-account bookings in a period (exclude cancellations) for a statement. */
create or replace function public.company_statement_total_cents(
  p_company_id uuid,
  p_from date,
  p_to date
) returns int
language sql stable security definer set search_path = public
as $$
  select coalesce(sum(b.price_cents), 0)::int
    from public.bookings b
   where b.company_id = p_company_id
     and b.payment_method = 'on_account'
     and b.status not in ('cancelled', 'expired')
     and (b.pickup_at at time zone 'Europe/Athens')::date >= p_from
     and (b.pickup_at at time zone 'Europe/Athens')::date <= p_to
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.company_prices enable row level security;
alter table public.company_users enable row level security;
alter table public.company_statements enable row level security;

revoke all on public.companies, public.company_prices, public.company_users, public.company_statements
  from anon, authenticated;

-- Staff full access
grant select, insert, update, delete on public.companies to authenticated;
grant select, insert, update, delete on public.company_prices to authenticated;
grant select, insert, update, delete on public.company_users to authenticated;
grant select, insert, update, delete on public.company_statements to authenticated;

create policy companies_staff_all on public.companies for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy company_prices_staff_all on public.company_prices for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy company_users_staff_all on public.company_users for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy company_statements_staff_all on public.company_statements for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Company members: read own company row
grant select on public.companies to authenticated;
create policy companies_member_read on public.companies for select to authenticated
  using (id = public.current_company_id());

-- Company prices: members read own company only (never other companies / never write)
grant select on public.company_prices to authenticated;
create policy company_prices_member_read on public.company_prices for select to authenticated
  using (company_id = public.current_company_id());

-- Company users: members read own company; admins update/invite within company
grant select on public.company_users to authenticated;
create policy company_users_member_read on public.company_users for select to authenticated
  using (company_id = public.current_company_id());
grant insert, update on public.company_users to authenticated;
create policy company_users_admin_write on public.company_users for insert to authenticated
  with check (company_id = public.current_company_id() and public.is_company_admin(company_id));
create policy company_users_admin_update on public.company_users for update to authenticated
  using (company_id = public.current_company_id() and public.is_company_admin(company_id))
  with check (company_id = public.current_company_id() and public.is_company_admin(company_id));

-- Statements: members read own
grant select on public.company_statements to authenticated;
create policy company_statements_member_read on public.company_statements for select to authenticated
  using (company_id = public.current_company_id());

-- Bookings: company members may read their company's bookings (staff policies already exist)
create policy bookings_company_member_read on public.bookings for select to authenticated
  using (company_id is not null and company_id = public.current_company_id());

-- class_rates / pricing_settings stay staff-only (0025) — company users never see them.
