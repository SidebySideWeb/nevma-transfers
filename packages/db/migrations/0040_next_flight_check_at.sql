-- Event-based flight checks: cron only polls when next_flight_check_at <= now().

alter table public.bookings
  add column if not exists next_flight_check_at timestamptz;

comment on column public.bookings.next_flight_check_at is
  'Next flight-provider poll (event schedule). Null = stop (landed/cancelled/no plan).';

create index if not exists bookings_next_flight_check_idx
  on public.bookings (next_flight_check_at)
  where next_flight_check_at is not null
    and flight_number is not null;
