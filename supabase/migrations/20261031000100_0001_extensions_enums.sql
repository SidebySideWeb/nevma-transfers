-- 0001 Extensions and enum types. TEM Protection booking core.
create extension if not exists btree_gist;

create type public.booking_status as enum ('pending', 'confirmed', 'assigned', 'completed', 'cancelled', 'expired');
create type public.payment_status as enum ('unpaid', 'paid', 'partially_refunded', 'refunded', 'failed');
create type public.invoice_status as enum ('not_required', 'requested', 'issued');
create type public.booking_type as enum ('transfer', 'hourly');
