-- 0010 VAT breakdown (decided by the user 1 Nov 2026).
-- Prices everywhere are FINAL prices, VAT included. The VAT share is shown only on the review step
-- before payment and in the confirmation email ("price analysis"). The rate is copied onto each booking
-- at creation, so a later rate change never alters past bookings.

insert into public.settings (key, value, description, is_demo) values
  ('vat_rate_bp', '2400', 'VAT rate in basis points (2400 = 24%) included in every price. DEMO until the client''s accountant confirms the rate for chauffeured transfers and VIP security.', true)
on conflict (key) do nothing;

alter table public.bookings add column vat_rate_bp int check (vat_rate_bp between 0 and 10000);
update public.bookings set vat_rate_bp = 2400 where vat_rate_bp is null;

create function public.bookings_set_vat_rate() returns trigger language plpgsql as $$
begin
  if new.vat_rate_bp is null then
    new.vat_rate_bp := coalesce(public.setting_int('vat_rate_bp'), 2400);
  end if;
  return new;
end $$;

create trigger bookings_set_vat_rate before insert on public.bookings
  for each row execute function public.bookings_set_vat_rate();

alter table public.bookings alter column vat_rate_bp set not null;

-- VAT contained in the final total, rounded to the cent (half up). Net = price_cents - vat_cents.
alter table public.bookings add column vat_cents int generated always as
  (price_cents - round(price_cents * 10000.0 / (10000 + vat_rate_bp))::int) stored;

create function public.vat_from_gross(p_gross_cents int, p_rate_bp int) returns int
  language sql immutable as $$ select p_gross_cents - round(p_gross_cents * 10000.0 / (10000 + p_rate_bp))::int $$;
