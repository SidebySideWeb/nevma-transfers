-- Always email the customer when flight tracking changes pick-up (or flags cancel/divert).
-- Office can still turn this off in Admin → Pricing → Flights.

update public.settings
   set value = 'true'::jsonb,
       description = 'Email the customer when a flight delay moves pick-up, or the flight is cancelled/diverted (default on).'
 where key = 'email_customer_on_flight_change';

insert into public.settings (key, value, description) values
  ('email_customer_on_flight_change', 'true'::jsonb, 'Email the customer when a flight delay moves pick-up, or the flight is cancelled/diverted (default on).')
on conflict (key) do nothing;
