# Drivers and dispatch module

Decided by the user on 1 Nov 2026 for a second client (same industry), built into the shared codebase as a module that each deployment switches on with `FEATURE_DRIVERS=true`. Nothing existing changes: booking, prices, Viva, Sanity, the website and the current admin pages behave as before. Database: migration `0019_drivers_dispatch.sql` (kit file was 0015; this repo already used 0015–0018) (tests `packages/db/tests/drivers.test.mjs`). Driver API contract: `docs/driver-api/openapi.yaml`. Design: `design/admin/drivers.html`, `driver.html`, `today.html`, `reports.html`, `statement.html`, and the Driver field on `booking.html`. Spec: `docs/superpowers/specs/2026-11-01-drivers-dispatch-design.md`.

**No GPS.** Where every vehicle and driver is comes from the schedule: who started the day with which vehicle (shift), which booking each one is on, and the trip status the driver (or the office) sets.

## 1. Drivers

- Name, e-mail (unique), phone, employee or freelancer, active, licence number and expiry, professional permit expiry, staff notes.
- Drivers are switched off, never deleted. The admin warns 30 days before a licence or permit expires and on any booking after the expiry date.
- **Login:** the office presses "Invite to the driver app". The admin calls the web app's signed internal route `POST /api/internal/drivers/invite` (same signing as refunds), which uses the service role to invite the e-mail through Supabase Auth and sets `drivers.user_id`. A driver login is never a staff login (the admin middleware already signs out non-staff).

## 2. Assignment

- Booking page: Driver next to Vehicle. Only active drivers who are free for the booking's blocked time are offered (the database refuses overlaps: `bookings_no_driver_overlap`). Assigning or removing a driver is logged in `booking_events` and resets the trip status to scheduled.
- E-mail to the driver on assignment and on changes within 48 hours of pick-up (Resend, `email.driver.*` strings), if the driver has a login.

## 3. Start of day (shift)

- The driver chooses a vehicle that is active and not taken; optional odometer. One open shift per driver and per vehicle (database constraints). Ending the day closes it.
- The office can start, end or correct a shift for a driver (source "office").

## 4. Trip status

`scheduled → on_way → arrived → on_board → completed`; `no_show` from on_way or arrived. Drivers: only their own bookings, only forward, only while on shift. Office: any status. Completed or no-show completes the booking (status completed), as "Mark completed" does today. Every step is in `booking_events` with time, source and note.

## 5. Today (dispatch board) and "now"

`fleet_now` (one row per vehicle: shift, driver, current job and status, next job, last update) and `drivers_now` (one row per active driver: shift, vehicle, current and next job, jobs today, document expiries). The Today page refreshes every 60 seconds and lists bookings today without a driver or vehicle, and today's closed bookings.

## 6. Pay

- **Plan per driver, with dates (no overlaps):** monthly salary (pro rata per calendar month), daily rate (days with a shift), hourly rate on shift hours or on hourly-hire hours, percentage of the booking price (final or before VAT), fixed amount per transfer with overrides per class and/or route (class + route, then route, then class, then the plan default). Any mix.
- **What counts:** bookings the driver carried out in the period (status completed, including no-show), dated by Athens pick-up date; shifts by Athens start date.
- **Adjustments:** tip, waiting, expense, bonus (positive); deduction, advance (negative); each with a note and an optional booking.
- **Statement:** for any range (week, month, three months, custom). Draft (recalculate any time) → approved (lines frozen) → paid (payment reference required). Periods never overlap for a driver.
- `driver_earnings(driver, from, to)` returns the lines; staff for anyone, a driver only for themself.

## 7. Reports

Week, month, quarter or custom range: **Driver pay** (jobs, days, shift hours, total, statement status), **Vehicles** (jobs, booked hours, shift days, shift hours), **Bookings per day** (completed, no-show, cancelled, revenue, online/office). Every table exports to CSV and Excel (`.xlsx`); statements print (A4) and export.

## 8. Driver API v1 (for the app built later)

- `apps/admin` serves `/api/driver/v1/*` (OpenAPI in `docs/driver-api/openapi.yaml`): me, vehicles, shift start and end, jobs (day or week), one job, job status, earnings (only if `DRIVER_EARNINGS_VISIBLE=true`).
- Auth: `Authorization: Bearer <Supabase access token>`; the route creates a Supabase client with that token (anon key + user session, never the service role) and calls the 0015 functions. Not a driver → 403 `not_a_driver`.
- CORS: only `DRIVER_APP_ORIGIN`. Rate limit 60 requests per minute per driver (`hit_rate_limit`). Errors: `{ error, message }` with the codes in the OpenAPI file; database messages are mapped, never passed raw.
- Privacy: no prices or payment data; the customer's phone only from 24 hours before pick-up until 6 hours after the trip.

## 9. Not included

GPS and maps, native apps, push notifications, automatic dispatch, route planning, bank payments (export only), myDATA.
