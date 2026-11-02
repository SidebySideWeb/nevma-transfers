-- 0021 Google place data on booking addresses (address autocomplete, docs/ADDRESS-AUTOCOMPLETE.md).
-- When the customer or the office picks a Google suggestion, the booking keeps the place ID and coordinates next
-- to the address text. All optional: typed addresses ("Terminal 2, door 3") stay valid. Drivers and the office use
-- them to open the exact place in Google Maps. Coordinates must be inside a loose Greece box (searches are limited
-- to Greece), so a bad value cannot send a driver abroad.

alter table public.bookings
  add column pickup_place_id text,
  add column pickup_lat double precision,
  add column pickup_lng double precision,
  add column dropoff_place_id text,
  add column dropoff_lat double precision,
  add column dropoff_lng double precision;

alter table public.bookings
  add constraint bookings_pickup_place_complete check (
    (pickup_place_id is null and pickup_lat is null and pickup_lng is null)
    or (pickup_place_id is not null and pickup_lat is not null and pickup_lng is not null)),
  add constraint bookings_dropoff_place_complete check (
    (dropoff_place_id is null and dropoff_lat is null and dropoff_lng is null)
    or (dropoff_place_id is not null and dropoff_lat is not null and dropoff_lng is not null)),
  add constraint bookings_dropoff_place_needs_address check (dropoff_place_id is null or dropoff_address is not null),
  add constraint bookings_place_ids_format check (
    (pickup_place_id is null or (pickup_place_id ~ '^[A-Za-z0-9_-]+$' and length(pickup_place_id) between 10 and 300))
    and (dropoff_place_id is null or (dropoff_place_id ~ '^[A-Za-z0-9_-]+$' and length(dropoff_place_id) between 10 and 300))),
  add constraint bookings_place_coords_greece check (
    (pickup_lat is null or (pickup_lat between 34 and 42 and pickup_lng between 19 and 30.5))
    and (dropoff_lat is null or (dropoff_lat between 34 and 42 and dropoff_lng between 19 and 30.5)));

comment on column public.bookings.pickup_place_id is 'Google place ID of the picked suggestion; null for typed addresses (0021).';
comment on column public.bookings.dropoff_place_id is 'Google place ID of the picked suggestion; null for typed addresses or hourly bookings (0021).';

-- No new staff grants: bookings are created by the server (online and office routes), which validates these fields.
