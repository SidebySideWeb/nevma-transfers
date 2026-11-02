-- 0017 Booking references use ELP- (Elite Protection).
-- Older rows may still be TEM- or EP-; the check accepts all three.

create or replace function public.generate_booking_reference()
returns text
language sql volatile
as $$
  select 'ELP-' || string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 6);
$$;

alter table public.bookings drop constraint if exists bookings_reference_check;
alter table public.bookings
  add constraint bookings_reference_check check (reference ~ '^(ELP|EP|TEM)-[A-HJ-NP-Z2-9]{6}$');
