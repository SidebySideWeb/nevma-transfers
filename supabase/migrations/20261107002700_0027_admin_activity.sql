-- 0027 Admin activity log (B5 audit trail for Pricing saves).

create table if not exists public.admin_activity (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.staff(user_id),
  actor_email text,
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_activity_created_idx on public.admin_activity (created_at desc);
create index if not exists admin_activity_entity_idx on public.admin_activity (entity, created_at desc);

comment on table public.admin_activity is 'Staff audit log (pricing saves and similar).';

alter table public.admin_activity enable row level security;

revoke all on public.admin_activity from anon;
grant select, insert on public.admin_activity to authenticated;

create policy admin_activity_staff_select on public.admin_activity
  for select to authenticated
  using (exists (select 1 from public.staff s where s.user_id = auth.uid()));

create policy admin_activity_staff_insert on public.admin_activity
  for insert to authenticated
  with check (exists (select 1 from public.staff s where s.user_id = auth.uid()));
