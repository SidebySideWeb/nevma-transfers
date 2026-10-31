-- 0005 Row-level security, staff policies and column rights.
-- Roles follow Supabase: anon (no access), authenticated (signed-in user; staff only if in public.staff),
-- service_role (server only, bypasses RLS; used by apps/web API).

do $$
declare t text;
begin
  foreach t in array array['vehicle_classes','vehicles','zones','zone_routes','zone_prices','hourly_rates','extras',
                           'blocked_slots','bookings','booking_extras','payments','settings','staff','slot_holds']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- service_role must bypass RLS even when it owns nothing: Supabase grants BYPASSRLS to service_role.

create function public.is_staff() returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.staff where user_id = auth.uid());
$$;
revoke all on function public.is_staff() from anon;

-- Read access for staff on every table.
do $$
declare t text;
begin
  foreach t in array array['vehicle_classes','vehicles','zones','zone_routes','zone_prices','hourly_rates','extras',
                           'blocked_slots','bookings','booking_extras','payments','settings','staff','slot_holds']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_staff())', t || '_staff_read', t);
  end loop;
end $$;

-- Reference data the office manages in the admin.
do $$
declare t text;
begin
  foreach t in array array['vehicle_classes','vehicles','zones','zone_routes','zone_prices','hourly_rates','extras','blocked_slots']
  loop
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_staff())', t || '_staff_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_staff()) with check (public.is_staff())', t || '_staff_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_staff())', t || '_staff_delete', t);
  end loop;
end $$;

create policy settings_staff_update on public.settings for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Bookings: staff may update only these columns. Prices, customer and payment fields stay server-only.
create policy bookings_staff_update on public.bookings for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
revoke insert, update, delete on public.bookings from authenticated;
grant update (vehicle_id, status, security_notes, invoice_status, invoice_number) on public.bookings to authenticated;

-- Staff status changes are limited; cancellation goes through the web API (emails and refunds).
create function public.bookings_staff_guard() returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' and new.status is distinct from old.status then
    if not ((old.status = 'confirmed' and new.status = 'assigned')
         or (old.status = 'assigned' and new.status in ('confirmed', 'completed'))) then
      raise exception 'staff_status_change_not_allowed: % to %', old.status, new.status
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;
create trigger bookings_staff_guard before update on public.bookings
  for each row execute function public.bookings_staff_guard();

-- Payments, holds, booking extras and staff: read-only for staff; written by the server only.
revoke insert, update, delete on public.payments, public.slot_holds, public.booking_extras, public.staff from authenticated;
revoke insert, delete on public.settings from authenticated;
