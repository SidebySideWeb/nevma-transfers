# Drivers and dispatch module — implementation plan

> Drivers module is built into this repo. Historical build order was D1 → D6 (originally shipped as `drivers-kit/` prompts). Spec: `docs/superpowers/specs/2026-11-01-drivers-dispatch-design.md`. Ops: `docs/DRIVERS.md`.

**Goal:** add drivers, assignment, shifts, live status, pay statements, reports and the driver API v1, switched on per deployment.

**Architecture:** the database (migration 0015, written and tested in the kit) holds every rule; the admin reads and writes through the staff session and the 0015 functions; the driver API is a thin, versioned REST layer in `apps/admin` over the same functions with the driver's session; `apps/web` gains two signed internal routes (invite, notify) because only it holds the service role and Resend.

**Tech:** Postgres 16 / Supabase, Astro (admin, server output), Supabase Auth, Resend, `exceljs` for Excel exports.

**Spec:** `docs/superpowers/specs/2026-11-01-drivers-dispatch-design.md`; rules `docs/DRIVERS.md`; API `docs/driver-api/openapi.yaml`.

## Global constraints

- Additive only: no change to booking, prices, Viva, Sanity, the website or the behaviour of existing admin pages; all existing tests stay green.
- `FEATURE_DRIVERS` (admin and web, default `false`) hides every new page, nav item and route (404).
- The admin and the driver API never use the service role. Times are Athens time; money is integer cents shown as "€ 1,234.56".
- Admin look: `design/admin/` boards and `admin.css`; brand dropdown for every select.

## Review focus

1. A booking reassigned to another driver after the trip started: the timeline must show both drivers and the trip status resets to scheduled (database does it; the UI must refresh the status badge).
2. A driver who forgets to end the day: the next morning `driver_start_shift` refuses (`already_on_shift`); the app must offer "End yesterday's day" and the office must be able to correct it (D2, D5).
3. Daylight-saving days (29 Mar, 25 Oct): shift hours and the calendar use real elapsed time (D3, D4 tests).
4. Excel exports in Greek locale Excel: numbers as numbers, dates as dates, euros not as text (D4 test opens the file with `exceljs` and checks cell types).
5. A driver's token expiring mid-day: the API returns 401 `unauthorized` and never a 500 (D5 test).

## Tasks

| Task | Prompt | Produces | Est. |
| --- | --- | --- | --- |
| 1 | `drivers-kit/PROMPT-D1-database-and-switch.md` | 0015 applied, types, `FEATURE_DRIVERS`, error messages | 0.5 d |
| 2 | `drivers-kit/PROMPT-D2-drivers-and-assignment.md` | Drivers pages, driver on bookings, timeline, shifts, invite and notify routes | 2.5 d |
| 3 | `drivers-kit/PROMPT-D3-today-and-calendar.md` | Today board, Drivers view on the calendar, office trip status | 1.5 d |
| 4 | `drivers-kit/PROMPT-D4-pay-statements-reports.md` | Pay plans, adjustments, statements, reports, CSV/Excel, print | 3 d |
| 5 | `drivers-kit/PROMPT-D5-driver-api.md` | `/api/driver/v1` per the OpenAPI contract, with contract tests | 1.5 d |
| 6 | `drivers-kit/PROMPT-D6-qa.md` | DR-01 … DR-12 report | 1 d |
