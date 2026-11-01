# Office bookings, fleet calendar and customers

Decided by the user on 1 Nov 2026: staff can add bookings by hand (phone, e-mail, walk-in) and choose per booking between a Viva payment link and an offline payment; a fleet calendar shows every vehicle's bookings, holds and blocks and lets staff start a booking or a block from empty time; customers are kept as a list for future features. Database: migration `0011_office_bookings_calendar.sql` (tests: `packages/db/tests/office.test.mjs`). Design: `design/admin/new-booking.html`, `calendar.html`, `calendar-week.html`, `booking-dialogs.html` (offline payment).

## 1. Office bookings

**Who writes what.** The admin never inserts bookings (staff have no insert right on `bookings`). The New booking form posts to the web app's signed internal route `POST /api/internal/bookings`, which runs with the service role exactly like an online booking: it prices the booking, holds the class, writes the booking and its extras, and sends e-mails. Same HMAC scheme, timestamp window and idempotency key as `/api/internal/cancel` and `/refund`.

**Request** (JSON): `idempotencyKey`, `staffUserId`, `customer { name, email, phone }`, `bookingType` (`transfer` | `hourly`), `classKey`, `fromZone`, `toZone` (transfer), `hours` (hourly), `pickupLocal` (Athens local `YYYY-MM-DDTHH:mm`), `pickupAddress`, `dropoffAddress`, `flightNumber?`, `passengers`, `luggage`, `extras[]` (codes), `vehicleId?`, `invoice?`, `notes?`, `priceOverrideCents?` + `priceOverrideReason?`, `payment` (`link` | `offline_paid` | `offline_collect`), `offlineMethod?` (`cash` | `bank_transfer` | `on_account`), `emailCustomer` (boolean).

**Server rules.**
1. Same validation as `POST /api/bookings` (zones, class capacity, whole hours, lead time, Athens time conversion), except the per-visitor hold limit and Turnstile.
2. Price from the price list → `list_price_cents`. With an override, `price_cents` = override and `price_override_reason` is required (database check). Overrides may go below the base price for office bookings only.
3. Hold with `create_office_hold(classKey, pickup, duration, staffUserId)`: same class lock as online holds; duration `settings.office_link_hold_minutes` (DEMO 240) for payment links; for offline bookings the hold is converted to the booking immediately.
4. Booking columns: `source = 'office'`, `created_by = staffUserId`, `payment_method` (`viva` for links, else the offline method).
5. `link`: status `pending`, `hold_expires_at` = hold end; create the Viva order with `paymentTimeout` = seconds left on the hold (if Viva's maximum order timeout is lower than the setting, use Viva's maximum and say so in the admin); e-mail `email.paymentLink.*` with the Viva checkout URL. The verified Viva webhook confirms it exactly like an online booking; expiry releases it like an online booking.
6. `offline_paid`: status `confirmed`, `payment_status = paid`, and a `payments` row (`kind = payment`, `status = succeeded`, `method`, `note`, `created_by`, no Viva fields).
7. `offline_collect`: status `confirmed`, `payment_status = unpaid`, `payment_method` set. Staff later use **Record offline payment** on the booking (dialog on `booking-dialogs.html`) → signed `POST /api/internal/payments` writes the `payments` row and sets `paid`.
8. `vehicleId` given: assign in the same transaction after the usual free-vehicle check (blocked slots and other bookings); the exclusion constraint is the final guard.
9. Confirmation e-mail as for online bookings when `emailCustomer` is true (default true); the office notice e-mail is not sent for office bookings.
10. Refunds: Viva-paid office bookings refund through Viva as today; offline-paid bookings record an offline refund (`payments.kind = refund`, `method` offline, no Viva call). The refund-limit trigger applies to both.
11. Response: `{ reference }` (201) or the usual error codes (`unavailable`, `no_price`, `invalid_request`).

**UI strings** (Sanity `uiStrings`, area `emails`): `email.paymentLink.subject` "Complete your booking {reference}", `email.paymentLink.body` "Please complete your booking {reference} for {pickupAt}. The vehicle is held for you until {holdEnds}.", `email.paymentLink.button` "Pay securely".

## 2. Fleet calendar

- Route `/calendar` (day, default today in Athens time) and `/calendar?view=week&date=`; class filter in the query string. Opens scrolled to 06:00.
- Data: `calendar_items` (view, security invoker; staff only through RLS) for the visible range, and `class_free_by_hour(class_id, day)` for each class row in the day view (week view: the lowest value per day).
- Rows: vehicles grouped by class (order: class order, then label); a "Needs a vehicle" lane per class for bookings without a vehicle. Bars: bookings (gold edge; VIP tint; amber edge when waiting for a vehicle; dashed when pending payment), buffers as hatched extensions, holds dashed, blocks grey hatched with the reason, completed bookings faded; a red "now" line on today.
- Click a bar: booking → `/bookings/[reference]`, block → `/blocked-slots`. Click empty time on a vehicle: popover with "New booking" (→ `/bookings/new?vehicle=&at=`) and "Block" (→ `/blocked-slots?vehicle=&from=`). No drag and drop; vehicle changes happen on the booking page.
- Accessibility: every bar is a link whose name starts with its visible text and adds kind and times; the grid is a focusable labelled region; empty-time targets are links with a name ("New booking or block on VAN-1").

## 3. Customers

- `customers`: one row per e-mail (case-insensitive), kept up to date by a trigger on every new booking (online and office): name, phone, last invoice details, `bookings_count`, first and last booking. `bookings.customer_id` links them; old bookings are backfilled by the migration.
- Staff can read customers and edit name, phone, invoice details and staff-only `notes`; they cannot create, delete or change the e-mail (database rights).
- Used now by the New booking customer lookup (name, e-mail or phone; top 8 matches with booking count). Customer pages (list, detail with booking history, notes) are a later feature on the same data.
- Personal data: covered by the privacy text and the retention rule still to be decided with the client (O10); deleting a customer on request means anonymising their bookings, which is part of that later work.
