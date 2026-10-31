-- 0006 Scheduled jobs. Supabase only: enable the pg_cron extension in the dashboard first
-- (Database > Extensions > pg_cron). Not applied by the local test runner.
create extension if not exists pg_cron;

-- Marks ended holds and unpaid pending bookings as expired, every minute.
select cron.schedule('tem-expire-holds', '* * * * *', $$select public.expire_holds()$$);

-- Link staff to Supabase Auth users (auth schema exists on Supabase).
alter table public.staff
  add constraint staff_user_fk foreign key (user_id) references auth.users(id) on delete cascade;
