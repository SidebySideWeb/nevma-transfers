-- 0045 Office price overrides may omit a reason (partner / monthly clearance workflows).

alter table public.bookings drop constraint if exists bookings_override_needs_reason;
