# Booking rules

The business rules the code must follow. Each rule names its acceptance id (`docs/ACCEPTANCE.md`). PLACEHOLDER marks a value the client has not confirmed; it lives in `settings` (database) or `uiStrings` (Sanity) so it can change without code.

## 1. Booking types

| | Transfer | Hourly hire |
| --- | --- | --- |
| Customer picks | pick-up zone, drop-off zone (different), addresses, date and time, passengers, luggage, vehicle class, extras | pick-up zone, address, date and time, number of hours (whole), passengers, luggage, vehicle class, extras |
| Base price | `zone_prices` row for (from, to, class) | `hourly_rates.price_per_hour_cents x hours` |
| Duration (for availability) | `zone_routes.duration_minutes` | `hours x 60` |
| Hours limits | — | per class `min_hours`..`max_hours` (DEMO 3..12); outside → `invalid_request` (`error.hours_range`) |
| No price | no `zone_prices` row → `no_price`; the flow shows `booking.contactUs` with phone and email from `siteSettings` | no `hourly_rates` row → class not offered by the hour |
| Overtime | — | not charged online; arranged with the office |

Round trips, distance pricing, maps and address search are out of scope.

## 2. Price (AC-01, AC-17)

- The server computes every amount from the database. A request containing `price`, `amount` or `total` is rejected (`invalid_request`).
- Total = base + sum of chosen extras (`extras.price_cents`, one each). Extras: `night-surcharge` (customer-picked, PLACEHOLDER rule), `vip-security`.
- An inactive or unknown extra code is rejected (`invalid_request`).
- Prices are copied onto the booking (`base_price_cents`, `price_cents`, `booking_extras.price_cents`) when the booking is created. Later price edits never change it.
- The review step shows the stored total of the created booking; the Viva order amount equals `price_cents`.

### VAT (AC-37, decided 1 Nov 2026)

- Every price the customer sees is the **final price, VAT included**: "from" prices, vehicle rows, extras, the summary, Viva, the manage page. No "excl. VAT" anywhere (the V2 design's "excl. 24% VAT" labels and VAT line in the summary are not used; the summary shows `booking.priceNote`).
- The VAT share is shown only in two places, as a **price analysis**: the review step before payment and the confirmation email. Lines: each item at its final price (vehicle or hours, each extra), then `Price before VAT` (net), `VAT {rate}%`, `Total` (VAT included).
- The rate lives in `settings.vat_rate_bp` (2400 = 24%, DEMO until the client's accountant confirms the rate for chauffeured transfers and VIP security) and is copied onto the booking at creation (`bookings.vat_rate_bp`, migration 0010). `bookings.vat_cents` is generated: `price_cents − round(price_cents × 10000 / (10000 + vat_rate_bp))`; net = `price_cents − vat_cents`. Show the stored values; never recompute VAT in the browser.
- VAT is computed on the booking total, not per line, so the lines always add up. Example: € 220.00 = € 177.42 + VAT 24% € 42.58.
- Refunds return final amounts; the office handles the VAT side of refunds in its invoices.
- Display: euros with two decimals, for example "€ 95.00". Storage and API: integer cents.

## 3. Time (AC-14, AC-15)

- The site's time zone is `settings.timezone` (Europe/Athens). The customer picks a local date and time; the API receives it without an offset (`pickupLocal`, `YYYY-MM-DDTHH:mm`) and converts it on the server:
  - a time that does not exist (spring change, for example 2027-03-28 03:30) → `invalid_request`;
  - a time that occurs twice (autumn change, for example 2026-10-25 03:30) → the earlier occurrence (+03:00).
- All responses carry ISO 8601 with offset. All storage is `timestamptz`.
- Minimum lead time: pick-up at least `settings.min_lead_minutes` (DEMO 120) from now; earlier or in the past → `invalid_request` (`error.lead_time`).
- Blocked time = pick-up minus class buffer to pick-up plus duration plus buffer, in real minutes (`blocked_range_for`).

## 4. Availability and holds (AC-04, AC-05)

- A booking reserves a slot in a **vehicle class**, not a car. Free vehicles = `class_availability(class, range)`.
- `POST /api/quote` shows availability without reserving anything.
- When the customer selects a vehicle, `POST /api/holds` calls `create_hold`, which locks the class row and reserves one vehicle for `settings.hold_minutes` (20).
- A visitor (cookie `tem_vid`) may have at most `settings.max_active_holds_per_visitor` (2) active holds.
- Going back from the details step releases the hold (`DELETE /api/holds/:id`).
- An expired hold never blocks anything, even before the clean-up job runs.
- The countdown on screen uses the server's `expiresAt`. At expiry the island returns to vehicle choice and keeps the entered details.

## 5. Booking lifecycle

```
           POST /api/bookings                verified Viva payment            office assigns car        trip done
 (hold) ─────────────────────▶ pending ─────────────────────────▶ confirmed ───────────────────▶ assigned ─────────▶ completed
                                 │  hold ends unpaid                 │    ▲ office unassigns        │
                                 ▼                                   │    └──────────────────────────┘
                              expired                                └── cancel (customer link or office via API) ──▶ cancelled
```

- `pending`: created from an active hold in one transaction; `hold_expires_at` = the hold's `expires_at`; the hold becomes `converted`.
- `confirmed`: **only** after the Viva webhook event is verified against Viva's API (AC-06). The browser redirect never confirms.
- `assigned` / `completed`: set by the office in the admin (database allows only these staff transitions).
- `cancelled`: by the customer link or by the office through `/api/internal/cancel`; never by a direct database edit.
- `expired`: unpaid pending booking whose hold ended (by `expire_holds()`).

## 6. Payment (AC-06, AC-07, AC-11)

1. `POST /api/bookings` creates the pending booking, then creates the Viva order with `amount = price_cents`, `merchantTrns = reference`, `paymentTimeout` = seconds left on the hold, customer email, name and phone.
2. The review step shows the total and "Pay securely" → "Taking you to Viva" → Viva's hosted page.
3. Success redirect → `/booking/confirmed?s=<orderCode>`; it polls `/api/booking-status` every 3 s for up to 2 minutes and shows `booking.confirmed.waiting` until confirmed. Failure redirect → `/booking/not-completed`, which offers "try again" (new order while the hold runs) or "choose another vehicle".
4. Webhook "transaction payment created": fetch the transaction from Viva; check it succeeded, the order code belongs to a booking and the amount equals `price_cents`; insert a `payments` row (unique `viva_transaction_id`; a duplicate does nothing); set `payment_status = paid`.
   - booking still `pending` with a live hold → `confirmed`;
   - hold already expired (late payment) → re-check `class_availability(class, range, exclude this booking)`: free → `confirmed`; taken → refund in full automatically, status `cancelled`, email `email.lateRefund.*`, office notified (AC-11).
5. Webhook "transaction failed": record a failed payment row; the booking stays `pending` until its hold ends.

## 7. Cancellation and refunds (AC-08, AC-12)

- **Secure manage link (design V2Manage, added 1 Nov):** the confirmation email holds `/booking/manage/<token>`. The token (32 random bytes, base64url) is created at confirmation; only its SHA-256 is stored in `bookings.cancel_token_hash` (the column keeps its name: it now guards the manage page and cancellation); the plain token exists only in emails. The manage page shows the booking, its status timeline and the paid amount, and offers request an invoice (mailto with the reference), call the office, add to calendar (`.ics`), and **Cancel this booking** → `/booking/cancel/<token>` (same token). Changes to time, vehicle or addresses are by phone.
- **Find my booking (design V2Lookup):** `/booking/find` takes reference + email. If they match a booking that is not completed or cancelled, a **new** token is issued (the old link stops working) and emailed (`email.manageLink.*`). The page always shows the same message (`lookup.sent`) whether or not anything matched, so nobody can probe references or emails. Rate limited (5 per hour per IP, 3 per hour per reference) and protected by Turnstile.
- After a cancellation the token is cleared (`cancel_token_hash = null`); the manage page then says `manage.linkInvalid`.
- Customer cancellation is allowed until `settings.cancel_window_hours` (DEMO 24) before pick-up. PLACEHOLDER policy until the client answers (due Fri 4 Dec): full refund inside the window, no online cancellation after it (`booking.cancel.tooLate`).
- Office cancellation (admin → `/api/internal/cancel`): refund `full`, `none` or a given amount.
- Refunds (admin → `/api/internal/refund`): any amount up to what is still refundable; the database rejects more (`refund_exceeds_paid`). The idempotency key makes a double click safe.
- `payment_status` after refunds: all refunded → `refunded`; part → `partially_refunded`.
- The VIP security add-on can be refunded on its own as a partial refund.

## 8. VIP security add-on (AC-09)

- A checkbox in the details step, never pre-selected, labelled `booking.extras.vip` with its price and `booking.extras.vip.hint`.
- Stored as the `vip-security` extra (price copied) and the `bookings.vip_security` flag (trigger).
- Confirmation email adds `email.confirmation.vip`; the office email and the admin list show a clear "VIP security" flag; the admin has a filter and a `security_notes` field.
- Inclusions, provider, price and legal wording are PLACEHOLDER until the client answers (due Fri 6 Nov); confirmed instantly like any extra until the client says otherwise.

## 9. Invoices

Optional "I need an invoice" block: company, VAT number, tax office, address → `invoice_status = requested`. The office issues the invoice by hand and records `issued` and the number in the admin.

## 10. Emails (AC-13)

| Email | To | When | Strings |
| --- | --- | --- | --- |
| Confirmation | customer | booking confirmed | `email.confirmation.*` (+ `.vip` when flagged, manage link, price analysis: items, `.net`, `.vat`, `.total` from the stored booking) |
| Office notice: new booking | `siteSettings.bookingNotificationEmail` | booking confirmed | `email.office.new.subject` (+ VIP flag) |
| Reminder | customer | about 24 h before pick-up, once (`reminder_sent_at`) | `email.reminder.*` |
| Cancelled | customer and office | any cancellation | `email.cancelled.*`, `email.refunded.body`, `email.office.cancelled.subject` |
| Late payment refunded | customer and office | AC-11 refund | `email.lateRefund.*` |

Emails are plain, accessible HTML plus a text part, sent through Resend from `RESEND_FROM_EMAIL`. A failed email is retried once and logged by booking reference; it never rolls back a payment.

## 11. Abuse protection (AC-23)

Turnstile on `/api/holds`, `/api/bookings`, `/api/bookings/cancel`. Rate limits (PROPOSED): 30 quotes per minute per IP; 6 holds and 6 bookings per hour per IP and per visitor.
