# 11 — Standalone admin app

Needs: 03 (admin layout), 04 (staff user, types), 07 (internal routes). Produces: `apps/admin`, the office's tool for bookings, prices, fleet and settings. ~3 days.

--- PROMPT ---

Read `AGENTS.md`, `.cursor/rules/80-admin-app.mdc`, `docs/PAGES.md` (admin), `docs/DATA-MODEL.md` (Security), `docs/API.md` (Internal) and open `design/screens/admin-bookings.html`, `admin-booking.html`, `admin-prices.html` first. The database already enforces staff rights (tests AC-10): use the signed-in user's session for every query; never the service role.

1. Auth: `src/lib/supabase.ts` with `@supabase/ssr` (`createServerClient` with Astro cookies). `src/middleware.ts`: every route except `/login` requires a session **and** a `staff` row (`select 1 from staff where user_id = auth.uid()`); otherwise sign out and redirect to `/login` with a neutral message. Set `X-Robots-Tag: noindex`, `X-Frame-Options: DENY`, `Cache-Control: no-store`. `/login`: email + password form (Astro action), rate limited, generic error text.
2. Mutations are Astro Actions (server) validated with `zod`. Direct database writes only for: vehicle assignment and status `confirmed↔assigned→completed`, `security_notes`, `invoice_status`, `invoice_number`, blocked slots, zone prices, hourly rates, extras, vehicles, vehicle classes, zones, routes, settings values. Cancel and refund call the web app (`PUBLIC_SITE_URL/api/internal/cancel|refund`) with `src/lib/signing.ts` (same scheme as the web app; share the code by copying it with a test that both produce the same signature for a fixed vector) and an idempotency key generated when the confirmation dialog opens.
3. Screens (match the wireframes; tokens only; React islands only where a table needs client sorting):
   - `/bookings`: filters (status, date range, type, VIP security only, invoice status) in the query string; server-side sorted by pick-up time; 50 per page; flags (VIP security, invoice requested); link to detail. Phone layout: list only.
   - `/bookings/[reference]`: trip, customer, extras with copied prices, payments and refunds history, refundable amount; actions: assign vehicle (only active vehicles of the class that are free for the booking's range: check `blocked_slots` and other bookings; the exclusion constraint is the final guard, show its error clearly), mark completed, security notes, invoice status and number, Refund… and Cancel booking… dialogs that restate reference, customer and amount.
   - `/blocked-slots`: create (vehicle, from, to in Athens time, reason) and delete future ones.
   - `/prices`: zone price matrix per class (euros in the form, cents stored; empty = delete the price row = no online price), routes and durations; `/hourly-rates`; `/extras` (including `vip-security`).
   - `/fleet` (classes and vehicles), `/zones`, `/settings` (show `description`, highlight `is_demo` rows; saving a value sets `is_demo = false`).
4. Banner on every page: classes present in Postgres but missing in Sanity (fetch Sanity `vehicleClass.key` with the read token on the server, cached 5 min) or the reverse, and any `settings.is_demo` rows.
5. Times shown and entered in Athens time (reuse the conversion rules: non-existent local times rejected).

Tests:
- Vitest: actions reject invalid input; euro ↔ cents conversion (`70.5` → 7050, `70.555` rejected); signing vector matches the web app.
- Playwright against local Supabase: AC-18 a non-staff user is signed out; staff sees bookings; filter VIP security only; assign a vehicle; try to assign the same vehicle to an overlapping booking → clear error; set invoice issued with a number; refund 10 € via the dialog (Fake provider in the web app) → history shows it; cancel → status cancelled. AC-10 a forged request trying to change `price_cents` fails.
- AC-19 axe on every admin page; tables reachable by keyboard.
- AC-24 `pnpm --filter @tem/admin build` output contains no service role key, Viva secret or signing secret.

Check (run and report pass/fail):
- Tests pass; `pnpm lint`, `pnpm typecheck` pass.
- Usable at 1024 px and wider; bookings list and detail usable at 390 px.
- The banner shows the DEMO settings rows in development.

Commit: `feat(admin): standalone admin for bookings, prices, fleet and settings`
