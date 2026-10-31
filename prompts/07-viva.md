# 07 — Viva: orders, webhook, late payment, refunds, internal routes

Needs: 06; Viva **demo** credentials in `apps/web/.env` (`VIVA_CLIENT_ID`, `VIVA_CLIENT_SECRET`, `VIVA_SOURCE_CODE`, `VIVA_MERCHANT_ID`, `VIVA_API_KEY`, `VIVA_ENV=demo`); a payment source with success URL `<site>/booking/confirmed` and failure URL `<site>/booking/not-completed`; a public URL for webhooks during development (Vercel preview or a tunnel). Produces: real payments in the demo environment, verified confirmations, refunds, admin-facing internal routes. ~2 days.

--- PROMPT ---

Read `AGENTS.md`, `docs/API.md` (Viva webhook, Internal), `docs/BOOKING-RULES.md` §6 and §7, `docs/ACCEPTANCE.md` (AC-06, AC-07, AC-08, AC-11, AC-24) and `.cursor/rules/50-api-security-payments.mdc` first. Then **check Viva's current developer docs** (developer.viva.com: Smart Checkout create order, retrieve transaction, webhooks "Transaction Payment Created" and "Transaction Failed", webhook URL verification, refunds/cancel transaction) and tell me any difference from `docs/API.md` before coding. Update `docs/API.md` if Viva changed something.

1. `src/lib/server/viva.ts` implementing `PaymentProvider` (from prompt 06):
   - OAuth2 client-credentials token (demo or live accounts host by `VIVA_ENV`), cached until 60 s before expiry.
   - `createOrder({ amountCents, reference, customer, paymentTimeoutSeconds })` → `orderCode`, `checkoutUrl` (demo or live checkout host + `?ref=<orderCode>`). `merchantTrns` = booking reference; `customerTrns` = short trip text without personal data.
   - `getTransaction(transactionId)` → status, orderCode, amount (convert to cents with integer maths).
   - `refund({ transactionId, amountCents })` → Viva refund with basic auth (`VIVA_MERCHANT_ID:VIVA_API_KEY`).
   - `getWebhookKey()` → the verification key, cached 1 hour.
   - Every call: 10 s timeout, one retry on network errors only, errors mapped to `payment_failed` with Viva's error code logged (no payload).
2. `GET /api/webhooks/viva` → `{ "Key": ... }`. `POST /api/webhooks/viva`:
   - Parse the event; for payment created: `getTransaction` (never trust the body), require success and `amountCents === booking.price_cents` and a known `viva_order_code`.
   - Record with a database function `record_viva_payment(order_code, transaction_id, amount_cents, raw jsonb)` in a new migration `0008_payments_flow.sql`, in one transaction: insert the `payments` row (duplicate `viva_transaction_id` → return `duplicate` and do nothing else); lock the booking; if `pending` and the hold has not expired → `confirmed`, `payment_status = paid`; if the hold expired → `class_availability(class, range, booking)` > 0 ? `confirmed` : return `late_unavailable`. Add db tests for all three outcomes and the duplicate.
   - After commit: on `confirmed` create the cancel token (hash stored), send emails (prompt 08; until then call an `onConfirmed` hook that logs the reference); on `late_unavailable` refund in full through `refund`, record the refund row, set `cancelled`, emails (`email.lateRefund.*`).
   - Payment failed event: insert a `failed` payment row; nothing else.
   - Always respond 200 within a few seconds; log only reference, order code and outcome.
3. Internal routes `POST /api/internal/refund` and `POST /api/internal/cancel` per `docs/API.md`: `src/lib/server/signing.ts` with `sign(body, timestamp)` and `verifySignature(req)` (HMAC-SHA256, constant-time compare, ±5 minutes, `X-TEM-Staff` must be a staff user id). Refund flow: insert a `pending` refund row with the idempotency key first (the database rejects over-refunds and duplicates: on duplicate key return the stored result), call Viva, mark `succeeded`/`failed`, update `payment_status` (`partially_refunded` / `refunded`). Cancel flow: status `cancelled`, `cancelled_at`, optional refund as above, emails.
4. Replace the Fake provider with Viva when `VIVA_ENV` is set; tests keep using the Fake or a mocked HTTP layer.
5. `/booking/confirmed` polling contract stays as in `docs/API.md` (pages in prompt 10).

Tests (names start with the AC id):
- AC-06: the success redirect alone leaves the booking `pending`; a verified event confirms it; an event whose transaction lookup says failed or amount differs changes nothing.
- AC-07: the same event twice → one payment row, one confirmation hook call.
- AC-11: hold expired and vehicle free → confirmed; hold expired and the last vehicle taken by another booking → refunded, cancelled, emails queued.
- AC-08: refund 150 € then 70 € on a 220 € booking → `refunded`; a further 1 € → 400; the same idempotency key twice → same response, one Viva call.
- AC-24: internal route with a wrong signature, a 6-minute-old timestamp, or a non-staff user → 401.
- Manual, Viva demo: one booking paid with Viva's demo card, confirmed by the webhook; one partial refund from a script calling the internal route.

Check (run and report pass/fail):
- Tests above pass; `pnpm --filter @tem/db test` green including 0008 tests.
- Demo payment confirmed end to end; the booking shows `confirmed` and one `payments` row.
- `grep -r "VIVA_CLIENT_SECRET\|VIVA_API_KEY" apps/web/dist/client` (after `pnpm build`) finds nothing.

Commit: `feat(payments): Viva orders, verified webhook, late payment, refunds`
