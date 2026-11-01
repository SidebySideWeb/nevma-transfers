-- 0009 Booking references use the brand prefix EP- (Elite Protection, decided by the user 1 Nov 2026).
-- Numbered 0009 because the project's 0007 (rate limits) and 0008 (payments flow) were written during the build.
-- Existing development rows keep their TEM- references, so the check accepts both prefixes.

create or replace function public.generate_booking_reference()
returns text
language sql volatile
as $$
  select 'EP-' || string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 6);
$$;

alter table public.bookings drop constraint if exists bookings_reference_check;
alter table public.bookings
  add constraint bookings_reference_check check (reference ~ '^(EP|TEM)-[A-HJ-NP-Z2-9]{6}$');
