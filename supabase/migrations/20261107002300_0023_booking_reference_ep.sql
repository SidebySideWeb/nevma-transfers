-- 0023 Booking references use EP- again (Elite Protection), as decided in 0009.
-- 0017 briefly switched generation to ELP-; older TEM-/ELP-/EP- rows stay valid.

create or replace function public.generate_booking_reference()
returns text
language sql volatile
as $$
  select 'EP-' || string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 6);
$$;

alter table public.bookings drop constraint if exists bookings_reference_check;
alter table public.bookings
  add constraint bookings_reference_check check (reference ~ '^(EP|ELP|TEM)-[A-HJ-NP-Z2-9]{6}$');
