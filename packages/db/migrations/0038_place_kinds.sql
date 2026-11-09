-- 0038 Public place types for the widget: add landmark (Acropolis, Sounio) and square (Syntagma).
-- Public places = airports, ports, stations, landmarks, squares, hotels, venues, areas.
-- "address" (a home, a villa) stays private, as in 0037.

alter table public.saved_places drop constraint if exists saved_places_kind_check;
alter table public.saved_places add constraint saved_places_kind_check check (
  kind in ('airport', 'port', 'station', 'landmark', 'square', 'hotel', 'venue', 'area', 'address')
);

comment on column public.saved_places.kind is
  'airport, port, station, landmark (ancient sites, museums), square, hotel, venue, area; address = private only.';
