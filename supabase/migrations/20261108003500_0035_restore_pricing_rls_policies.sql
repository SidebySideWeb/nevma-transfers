-- 0035 Restore staff RLS policies on pricing tables (0025).
-- Production had RLS enabled on class_rates / pricing_* with no policies, so
-- security_invoker views (current_class_rates, current_pricing_settings) returned
-- zero rows to staff. Saves via staff_save_class_rate still worked (security definer).

drop policy if exists class_rates_staff_all on public.class_rates;
create policy class_rates_staff_all on public.class_rates for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists pricing_settings_staff_all on public.pricing_settings;
create policy pricing_settings_staff_all on public.pricing_settings for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists pricing_periods_staff_all on public.pricing_periods;
create policy pricing_periods_staff_all on public.pricing_periods for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists pricing_areas_staff_all on public.pricing_areas;
create policy pricing_areas_staff_all on public.pricing_areas for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

grant select, insert on public.class_rates to authenticated;
grant select, insert on public.pricing_settings to authenticated;
grant select, insert, update, delete on public.pricing_periods, public.pricing_areas to authenticated;
grant select on public.current_class_rates, public.current_pricing_settings to authenticated;
