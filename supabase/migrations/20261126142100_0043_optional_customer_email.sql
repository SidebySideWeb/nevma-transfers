-- 0043 Office bookings may omit customer e-mail (walk-in / phone).
-- Skip customers link when the address is blank so we do not merge walk-ins into one '' row.

create or replace function public.link_booking_customer() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
  em text := lower(btrim(coalesce(new.customer_email, '')));
begin
  if em = '' then
    return new;
  end if;
  insert into public.customers as c (email, name, phone, company, vat_number, tax_office, address,
                                     bookings_count, first_booking_at, last_booking_at)
  values (em, new.customer_name, new.customer_phone, new.invoice_company, new.invoice_vat,
          new.invoice_tax_office, new.invoice_address, 1, new.created_at, new.created_at)
  on conflict (lower(email)) do update set
    name = excluded.name,
    phone = coalesce(excluded.phone, c.phone),
    company = coalesce(excluded.company, c.company),
    vat_number = coalesce(excluded.vat_number, c.vat_number),
    tax_office = coalesce(excluded.tax_office, c.tax_office),
    address = coalesce(excluded.address, c.address),
    bookings_count = c.bookings_count + 1,
    last_booking_at = greatest(c.last_booking_at, excluded.last_booking_at)
  returning id into cid;
  new.customer_id := cid;
  return new;
end $$;
