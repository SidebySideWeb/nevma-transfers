-- 0047 Staff may update bookings.voucher_code (column grant; RLS still staff-only).

grant update (voucher_code) on public.bookings to authenticated;
