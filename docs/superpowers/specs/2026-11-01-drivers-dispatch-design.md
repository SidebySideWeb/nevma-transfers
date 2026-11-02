# Drivers and dispatch module — design

Date: 1 Nov 2026. Requested by the user for a second client in the same business (chauffeured transfers). Approved in chat the same day.

## Goal

Add fleet and driver operations to the existing platform without changing booking, prices, Viva, Sanity, the website or the current admin pages: drivers, a driver and a vehicle on every booking, the start of each driver's day with a vehicle, live status of every vehicle and driver from the schedule, driver pay (salary, daily, hourly, percentage, per transfer, adjustments) with weekly, monthly, three-month or custom statements and exports, and a versioned API for a drivers' web app built later.

## Decisions (user, 1 Nov)

1. One codebase, a separate deployment per client; the module is switched on per deployment (`FEATURE_DRIVERS=true`).
2. No GPS or trackers: "where is everything" comes from shifts, assignments and trip statuses.
3. Driver pay supports all of: monthly or daily salary, hourly, percentage of the booking price, fixed per transfer, in any mix per driver.
4. Build the driver API and data model now; the drivers' web app later.

## Design

- Database: migration `0015_drivers_dispatch.sql` — tables `drivers`, `driver_shifts`, `booking_events`, `driver_pay_plans`, `driver_pay_rates`, `driver_pay_adjustments`, `driver_statements`, `driver_statement_lines`; columns `bookings.driver_id`, `bookings.trip_status`; constraint `bookings_no_driver_overlap`; views `fleet_now`, `drivers_now`; functions `set_trip_status`, `driver_me`, `driver_vehicles`, `driver_start_shift`, `driver_end_shift`, `driver_jobs`, `driver_earnings`, `driver_statement_build|approve|mark_paid`, `report_driver_pay`, `report_vehicle_usage`, `report_bookings_per_day`. Row-level security: staff everything; a driver only their own driver row, shifts and (through functions) jobs and earnings; pay tables staff only.
- API: REST in `apps/admin` under `/api/driver/v1`, Bearer Supabase token, anon key + driver session (no service role), contract `docs/driver-api/openapi.yaml`.
- Admin: Today (dispatch board), Drivers (list, driver page with jobs, shifts, pay plan, adjustments, statements, app access), Driver on the booking page with trip status timeline, Drivers view on the calendar, Reports (driver pay, vehicles, bookings per day) with CSV and Excel export, statements with print.
- Web app (`apps/web`): two signed internal routes, `POST /api/internal/drivers/invite` (Supabase Auth invite with the service role, sets `drivers.user_id`) and `POST /api/internal/drivers/notify` (assignment e-mail through Resend).
- Rules: `docs/DRIVERS.md`. Design boards: `design/admin/today.html`, `drivers.html`, `driver.html`, `driver-dialogs.html`, `statement.html`, `reports.html`, `booking.html` (Driver field).

## Out of scope

GPS and maps, native apps, push notifications, automatic dispatch, route planning, bank payments (export only), myDATA.

## Acceptance

| Id | Criterion |
| --- | --- |
| DR-01 | With `FEATURE_DRIVERS` off, no drivers page, nav item or API route exists (404) and every existing test passes. |
| DR-02 | A driver can be assigned only if active and free; an overlapping assignment shows which booking blocks it. Every assignment change appears in the booking timeline. |
| DR-03 | The office invites a driver; the driver signs in; the link sets `drivers.user_id`; a driver login cannot open any admin page. |
| DR-04 | A driver starts the day only with a free active vehicle; one open shift per driver and vehicle; the office can correct shifts. |
| DR-05 | Trip status moves forward only, by the assigned driver on shift (or any way by the office); completed or no-show completes the booking. |
| DR-06 | Today shows every vehicle and active driver with current and next job and refreshes every minute. |
| DR-07 | Driver earnings match the worked examples in `packages/db/tests/drivers.test.mjs` (salary pro rata, daily, hours, percentage before VAT, per transfer with overrides, adjustments). |
| DR-08 | A statement can be recalculated while draft; approval freezes it; paid needs a reference; periods do not overlap. |
| DR-09 | Reports for a week, a month, three months and a custom range; CSV and Excel exports open in Excel with numbers and dates typed. |
| DR-10 | Every `/api/driver/v1` response validates against `docs/driver-api/openapi.yaml`; another driver's job returns 404; no price fields anywhere. |
| DR-11 | The customer phone appears in the driver API only from 24 hours before pick-up to 6 hours after the trip. |
| DR-12 | axe (serious, critical) clean on every new admin page at 390, 1024, 1440 px; no horizontal page overflow. |
