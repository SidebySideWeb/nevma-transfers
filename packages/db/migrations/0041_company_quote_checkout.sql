-- 0041: business checkout may sell quotes stamped with company_id.
-- Public create_booking_from_quote still refuses those; this wrapper clears
-- the stamp for the sale inside one transaction, then restores it.

create or replace function public.create_booking_from_company_quote(
  p_quote_id uuid,
  p_class_key text,
  p_visitor_key text,
  p_pickup_address text,
  p_dropoff_address text,
  p_passengers int,
  p_luggage int,
  p_flight_number text,
  p_notes text,
  p_extra_codes text[],
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_invoice_company text,
  p_invoice_vat text,
  p_invoice_tax_office text,
  p_invoice_address text,
  p_company_id uuid
) returns jsonb
language plpgsql
as $$
declare
  q_company uuid;
  result jsonb;
begin
  if p_company_id is null then
    raise exception 'invalid_request: company quote';
  end if;

  select company_id into q_company
    from public.quotes
   where id = p_quote_id
   for update;
  if not found then
    raise exception 'invalid_request: unknown quote';
  end if;
  if q_company is distinct from p_company_id then
    raise exception 'invalid_request: company quote';
  end if;

  update public.quotes set company_id = null where id = p_quote_id;
  begin
    result := public.create_booking_from_quote(
      p_quote_id, p_class_key, p_visitor_key, p_pickup_address, p_dropoff_address,
      p_passengers, p_luggage, p_flight_number, p_notes, p_extra_codes,
      p_customer_name, p_customer_email, p_customer_phone,
      p_invoice_company, p_invoice_vat, p_invoice_tax_office, p_invoice_address
    );
  exception when others then
    update public.quotes set company_id = p_company_id where id = p_quote_id;
    raise;
  end;
  update public.quotes set company_id = p_company_id where id = p_quote_id;
  return result;
end;
$$;

revoke all on function public.create_booking_from_company_quote(
  uuid, text, text, text, text, int, int, text, text, text[], text, text, text, text, text, text, text, uuid
) from public, anon, authenticated;
