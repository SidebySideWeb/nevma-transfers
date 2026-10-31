# 06 — Booking API: options, quote, holds, bookings, status, cancel

Needs: 02, 04, 05; Cloudflare Turnstile test keys in `apps/web/.env`. Produces: every public endpoint in `docs/API.md` except the Viva parts (stubbed behind an interface until prompt 07). ~2 days.

--- PROMPT ---

Read `AGENTS.md`, `docs/API.md` (Public section), `docs/BOOKING-RULES.md`, `docs/DATA-MODEL.md` (holds and functions) and `.cursor/rules/50-api-security-payments.mdc` first. Tests first. Use the functions from `src/lib/booking/` (prompt 05) and the database functions `create_hold`, `class_availability`, `blocked_range_for`; do not reimplement availability in TypeScript.

1. Infrastructure in `src/lib/server/`:
   - `http.ts`: `json(data, status)`, `fail(error: BookingError | unknown)` producing the shared error shape with `message = t(stringKey, vars)`; unknown errors → 500 `invalid_request` with a generic message and a logged error id (no stack, no body).
   - `turnstile.ts`: `verifyTurnstile(token, ip): Promise<boolean>` (Cloudflare siteverify).
   - `rate-limit.ts`: fixed-window counters in Postgres (new migration `0007_rate_limits.sql`: table `rate_limits(key text, window_start timestamptz, count int, primary key(key, window_start))`, RLS on, no policies; a function `hit_rate_limit(key, window_seconds, max) returns boolean`). Limits from `docs/BOOKING-RULES.md` §11. Update `docs/DATA-MODEL.md` and add a db test.
   - `visitor.ts`: read or set the `tem_vid` cookie (httpOnly, Secure, SameSite=Lax, 30 days, 32 random bytes base64url).
   - `payments.ts`: an interface `PaymentProvider { createOrder(...); getTransaction(...); refund(...) }` with a `FakePaymentProvider` for tests and dev (prompt 07 adds Viva).
2. `GET /api/booking-options` per `docs/API.md` (Postgres zones, classes, hourly limits, active extras; Sanity names, photos, taglines joined by `key`; classes without Sanity content left out and logged once).
3. `POST /api/quote`: validate; convert `pickupLocal`; lead time; for each active class that fits passengers and luggage: base price (zone price or rate × hours) and `class_availability(class, blocked_range_for(...)) > 0`. All classes without a price → `no_price`.
4. `POST /api/holds`: Turnstile; rate limit; validate; price must exist for the class; call `create_hold(classKey, pickupAt, durationMinutes, visitorKey)`; map `unavailable` → 409 `unavailable`, `too_many_holds` → 429 `invalid_request`. Return `holdId`, `expiresAt` (ISO with offset), `baseCents`. Store the search (type, zones, hours, pickup) with the hold: add columns in `0007` (`booking_type`, `from_zone_id`, `to_zone_id`, `hours`, `pickup_at`, `duration_minutes`) so `/api/bookings` cannot be fed a different trip.
5. `DELETE /api/holds/:id`: only the visitor's own active hold → `released`.
6. `POST /api/bookings`: Turnstile; rate limit; `rejectMoneyFields`; validate. In **one transaction** (use a Postgres function `create_booking_from_hold(...)` in `0007` so the lock and checks run in the database): lock the class row; hold active, unexpired, same visitor; recompute base and extras from the tables (prices copied); insert `bookings` (`pending`, `hold_expires_at` = hold expiry, invoice fields and `invoice_status = 'requested'` when given; `cancel_token_hash` stays null) and `booking_extras`; hold → `converted`. Then create the payment order through `PaymentProvider` with `paymentTimeout` = seconds left on the hold; store `viva_order_code`. The cancel token is **not** created here: it is created when the booking is confirmed (prompt 07), its hash stored, and the plain token only goes into the confirmation email (`docs/BOOKING-RULES.md` §7). Response per `docs/API.md`.
7. `POST /api/bookings/pay`: new order for a pending booking of this visitor while its hold runs.
8. `GET /api/booking-status?s=`: reference, status, payment status only.
9. `POST /api/bookings/cancel`: Turnstile; hash the token; find the booking; inside `cancel_window_hours` → cancel (status `cancelled`, `cancelled_at`, refund through `PaymentProvider` per the DEMO policy: full), clear `cancel_token_hash` so the link works once; outside → `booking.cancel.tooLate`.

Tests (Vitest against the local Supabase from prompt 04, Fake provider, Turnstile mocked at the HTTP edge), names starting with the AC id:
- AC-01: a body with `amount` → 400; total = base + extras.
- AC-04: a hold moved into the past (SQL update) no longer blocks a quote; its booking cannot be created.
- AC-05: 2 holds OK, 3rd → 429; last vehicle taken by hold A → quote shows unavailable for B.
- AC-09: `extras: ['vip-security']` → `vip_security = true` and the line present; set the extra inactive → 400.
- AC-12: cancel inside the window → cancelled and refunded (Fake records it); second use of the link → 400; outside the window → 400 `booking.cancel.tooLate`.
- AC-15: lead time; AC-16: `demo-north` → `demo-port` with `demo-van` → `no_price`.
- AC-17: change the zone price after the booking is created → booking total unchanged.
- AC-23: missing or failing Turnstile → 400; rate limit → 429.

Check (run and report pass/fail):
- All tests above pass; `pnpm lint`, `pnpm typecheck` pass; `pnpm --filter @tem/db test` still green (with the new 0007 tests).
- `docs/DATA-MODEL.md` and `docs/API.md` updated for 0007.
- Logs contain no emails, names, phones or tokens (grep the test output).

Commit: `feat(api): booking options, quote, holds, bookings, status, cancel`
