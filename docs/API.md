# API — apps/web

All endpoints live in `apps/web/src/pages/api/`. JSON in and out, `Cache-Control: no-store` unless stated. Inputs are validated with `zod` (unknown fields rejected). Amounts are integer cents in EUR; times in responses are ISO 8601 with offset.

**Error shape (all endpoints):** `{ "error": "<code>", "message": "<text from uiStrings>", "fields"?: { "<field>": "<message>" } }`

| Code | HTTP | When |
| --- | --- | --- |
| `invalid_request` | 400 / 401 / 403 / 409 / 429 | bad or unknown fields, price fields sent, hours outside limits, lead time, unknown or inactive extra, hold not yours or ended, Turnstile failed, too many holds, rate limit, bad signature |
| `no_price` | 404 | no online price for the zone pair / class |
| `unavailable` | 409 | no free vehicle in that class at that time |
| `payment_failed` | 502 | Viva order or refund could not be created |

Viva endpoints and event ids below follow Viva's developer docs at the time of writing (developer.viva.com). **Check them against the current docs in prompt 07.**

---

## Public

### `GET /api/booking-options`
Everything the booking form needs. `Cache-Control: public, max-age=60`.
```json
{
  "timezone": "Europe/Athens",
  "minLeadMinutes": 120,
  "holdMinutes": 20,
  "zones": [{ "code": "demo-airport", "name": "DEMO Athens International Airport" }],
  "classes": [{ "key": "demo-van", "name": "DEMO Executive van", "maxPassengers": 7, "maxLuggage": 7,
                "hourly": { "minHours": 3, "maxHours": 12 }, "photo": { "url": "...", "alt": "..." }, "tagline": "..." }],
  "extras": [{ "code": "vip-security", "name": "VIP security", "priceCents": 15000 }]
}
```
Class names, photos and taglines come from Sanity; classes with no Sanity document are left out (and logged). Zone `name` comes from Postgres.

### `POST /api/quote`
Prices and availability per class. Reserves nothing.
```json
// transfer
{ "type": "transfer", "fromZone": "demo-airport", "toZone": "demo-centre", "pickupLocal": "2026-12-01T10:00", "passengers": 2, "luggage": 2 }
// hourly
{ "type": "hourly", "fromZone": "demo-centre", "hours": 4, "pickupLocal": "2026-12-01T10:00", "passengers": 2, "luggage": 2 }
```
```json
{
  "pickupAt": "2026-12-01T10:00:00+02:00",
  "durationMinutes": 45,
  "currency": "EUR",
  "options": [
    { "classKey": "demo-sedan", "baseCents": 7000, "available": true },
    { "classKey": "demo-van", "baseCents": 9500, "available": false },
    { "classKey": "demo-suv", "baseCents": null, "available": false, "reason": "no_price" }
  ]
}
```
Classes too small for the passengers or luggage are left out. If no class has a price → `no_price`.

### `POST /api/holds`
Creates the 20-minute hold when the customer selects a vehicle. Needs Turnstile. Sets or reads the `tem_vid` cookie (httpOnly, Secure, SameSite=Lax, random).
```json
{ "type": "transfer", "fromZone": "demo-airport", "toZone": "demo-centre", "pickupLocal": "2026-12-01T10:00",
  "passengers": 2, "luggage": 2, "classKey": "demo-sedan", "turnstileToken": "..." }
```
```json
{ "holdId": "uuid", "expiresAt": "2026-11-30T18:20:00+02:00", "classKey": "demo-sedan", "baseCents": 7000 }
```
Errors: `unavailable`, `no_price`, `invalid_request` (too many holds, lead time, hours).

### `DELETE /api/holds/:holdId`
Releases the visitor's own active hold (status `released`). `204`.

### `POST /api/bookings`
Creates the pending booking from the hold and the Viva order. Needs Turnstile.
```json
{
  "holdId": "uuid",
  "pickupAddress": "Street 1, Athens",
  "dropoffAddress": "Street 2, Athens",
  "passengers": 2, "luggage": 2, "flightNumber": "A3 123",
  "extras": ["vip-security"],
  "customer": { "name": "Full Name", "email": "name@example.com", "phone": "+30 690 000 0000" },
  "notes": "optional",
  "invoice": { "company": "...", "vat": "...", "taxOffice": "...", "address": "..." },
  "consent": true,
  "turnstileToken": "..."
}
```
One transaction: lock the class row; check the hold is active, unexpired and belongs to this visitor; recompute the price (zone price or rate x hours, plus extras; all extras active); insert `bookings` (`pending`, `hold_expires_at` = hold expiry, cancel token hash) and `booking_extras`; mark the hold `converted`. After commit, create the Viva order.
```json
{
  "reference": "TEM-7K3QX2",
  "status": "pending",
  "currency": "EUR",
  "lines": [{ "label": "DEMO Executive sedan", "cents": 7000 }, { "label": "VIP security", "cents": 15000 }],
  "totalCents": 22000,
  "holdExpiresAt": "2026-11-30T18:20:00+02:00",
  "checkoutUrl": "https://demo.vivapayments.com/web/checkout?ref=1234567890123456"
}
```
If the Viva order fails, the booking stays `pending` and the response is `payment_failed` with `reference`; the review step offers "try again" (`POST /api/bookings/pay`).

### `POST /api/bookings/pay`
`{ "reference": "TEM-7K3QX2" }` + visitor cookie → a new Viva order while the hold runs. `{ "checkoutUrl": "..." }`. Errors: `invalid_request` (hold ended, not yours, already paid), `payment_failed`.

### `GET /api/booking-status?s=<orderCode>`
Polled by `/booking/confirmed`. Returns no personal data.
```json
{ "reference": "TEM-7K3QX2", "status": "confirmed", "paymentStatus": "paid" }
```

### `POST /api/bookings/cancel`
`{ "token": "<from the link>", "turnstileToken": "..." }`. Inside the cancellation window: cancels, refunds per policy, sends emails → `{ "reference": "...", "status": "cancelled", "refundCents": 22000 }`. Outside: `invalid_request` with `booking.cancel.tooLate`. A used or unknown token: `invalid_request`.

---

## Viva webhook

### `GET /api/webhooks/viva`
Viva's URL verification. Returns `{ "Key": "<key>" }`, where the key comes from Viva's `GET /api/messages/config/token` (basic auth `VIVA_MERCHANT_ID:VIVA_API_KEY`), cached for 1 hour.

### `POST /api/webhooks/viva`
Event body from Viva. Handled events (ids per Viva docs; confirm in prompt 07):
- Transaction Payment Created (1796): fetch the transaction (`GET /checkout/v2/transactions/{transactionId}`, OAuth2); require success, a known `orderCode` and `amount * 100 == price_cents`; record and confirm per `docs/BOOKING-RULES.md` §6.
- Transaction Failed (1798): record a failed payment row.
- Anything else: `200` and ignore.
Always answer `200` quickly after recording; a verification failure is logged by order code and answered `200` (so Viva does not retry forever), and the booking is left untouched.

---

## Internal (admin → web), signed

Headers: `X-TEM-Timestamp` (unix seconds), `X-TEM-Signature` = hex HMAC-SHA256(`ADMIN_TO_WEB_SIGNING_SECRET`, `timestamp + "." + rawBody`), `X-TEM-Staff` (staff user id, for the audit column). Rejected (`invalid_request`, 401) if the signature is wrong, the timestamp is more than 5 minutes off, or the user is not in `staff`.

### `POST /api/internal/refund`
`{ "reference": "TEM-7K3QX2", "amountCents": 15000, "reason": "VIP security not available", "idempotencyKey": "uuid" }`
Inserts a `pending` refund row first (the database rejects over-refunds), calls Viva's refund (`DELETE /api/transactions/{transactionId}?amount=<cents>` with basic auth; confirm in prompt 07), then marks it `succeeded` or `failed` and updates `payment_status`; emails the customer.
→ `{ "refundedCents": 15000, "refundableCents": 7000, "paymentStatus": "partially_refunded" }`. Same `idempotencyKey` again → the first result.

### `POST /api/internal/cancel`
`{ "reference": "TEM-7K3QX2", "refund": "full" | "none" | { "amountCents": 5000 }, "reason": "...", "idempotencyKey": "uuid" }` → cancels, refunds as asked, emails customer and office. → `{ "status": "cancelled", "refundedCents": 22000 }`

---

## Cron

### `GET /api/cron/reminders`
Vercel Cron every 15 minutes; requires `Authorization: Bearer <CRON_SECRET>`. Sends the reminder for confirmed/assigned bookings whose pick-up is 23 to 25 hours away and `reminder_sent_at is null`, then sets `reminder_sent_at` (claim with `update ... returning` before sending so two runs never double-send).
