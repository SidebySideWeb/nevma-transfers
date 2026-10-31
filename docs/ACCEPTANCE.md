# Acceptance — kit 1 (booking core)

Every item has an id. Automated tests put the id first in their name (`AC-07 duplicate webhook changes nothing`). "DB" = already covered by `packages/db/tests` (provided, passing). The QA prompt (14) runs everything and reports each id as pass or fail.

| Id | Requirement | How it is proven | Prompt |
| --- | --- | --- | --- |
| AC-01 | The server computes every price: transfer = zone price; hourly = rate x hours; total = base + extras. A body with `price`, `amount` or `total` is rejected. | Vitest on `lib/booking/pricing.ts`; API test sending `amount` gets `invalid_request` | 05, 06 |
| AC-02 | One vehicle never carries two overlapping active bookings. | DB (exclusion constraint) | 04 |
| AC-03 | Booking type rules: transfer needs two different zones and a drop-off; hourly needs whole hours within the class's min/max (DEMO 3–12); 0, 2, 13, 25, negative, fractional are rejected. | DB (1–24, fields) + Vitest (per-class limits, fractions) | 04, 05 |
| AC-04 | Holds last `hold_minutes` (20). An expired hold never blocks availability; unpaid pending bookings expire with their hold. | DB + API test with a hold moved into the past | 04, 06 |
| AC-05 | Two visitors racing for the last vehicle: exactly one hold succeeds. A visitor has at most 2 active holds. | DB (parallel transactions) + API test | 04, 06 |
| AC-06 | A booking is confirmed only after a Viva event verified against Viva's API; the success redirect alone changes nothing; the confirmed page waits for the webhook. | Vitest with Viva mocked at the HTTP edge; Playwright on Viva demo | 07, 10 |
| AC-07 | The same Viva transaction recorded twice changes nothing (one payment row, one email). | DB (unique) + webhook replay test | 04, 07 |
| AC-08 | Refunds never exceed what was paid; a repeated refund request with the same idempotency key returns the first result; `payment_status` ends `partially_refunded` or `refunded` correctly. | DB (trigger, unique key) + internal API tests | 04, 07, 11 |
| AC-09 | VIP security: optional checkbox with price, never pre-selected; price copied; `vip_security` flag set; mentioned in both emails; admin flag, filter and notes; an inactive `vip-security` extra is rejected. | DB (trigger) + Vitest + Playwright | 04, 06, 08, 09, 11 |
| AC-10 | RLS: anon reads nothing; non-staff users see nothing; staff edit only allowed booking columns and status steps, and reference data; staff cannot cancel or refund directly. | DB | 04, 11 |
| AC-11 | Late payment: hold expired but vehicle still free → confirmed; vehicle taken → full automatic refund, status cancelled, customer and office emailed. | Webhook test with both branches | 07 |
| AC-12 | Customer cancellation: inside `cancel_window_hours` → cancelled, refunded per policy, emailed; outside → `booking.cancel.tooLate`; unknown or used token rejected; only the token hash is stored. | API tests | 06, 07 |
| AC-13 | Emails: confirmation (with cancel link), office notice, reminder once about 24 h before (two cron runs never double-send), cancellation, late refund. All wording from `uiStrings`. | Vitest with Resend mocked; reminder claim test | 08 |
| AC-14 | Time zone: local Athens time converted on the server; a non-existent time (2027-03-28 03:30) is rejected; a repeated time (2026-10-25 03:30) uses the earlier one; blocked ranges are in real minutes across DST. | Vitest + DB | 04, 05 |
| AC-15 | Lead time: pick-up in the past or within `min_lead_minutes` (DEMO 120) is rejected with `error.lead_time`. | Vitest + API test | 05, 06 |
| AC-16 | A zone pair or class with no price returns `no_price`; the flow shows `booking.contactUs` with phone and email. | API test + Playwright (`demo-north` → `demo-port`, `demo-van`) | 06, 09 |
| AC-17 | Prices are fixed when the booking is created: changing a price afterwards does not change the booking; the review total equals `price_cents` and the Viva order amount. | API test | 06, 07 |
| AC-18 | Admin: only `staff` users get in; others are signed out; every mutation is checked on the server; a banner lists classes missing in Sanity or Postgres; cancel and refund need a confirmation step. | Vitest + Playwright on the admin | 11 |
| AC-19 | Accessibility: axe reports zero serious or critical issues on every route; the booking path works by keyboard alone; focus moves to each step heading and to error summaries; hold time is announced politely. | Playwright + axe | 09, 14 |
| AC-20 | Performance: home and legal pages LCP < 2.5 s, INP < 200 ms, CLS < 0.1 (mobile); booking island < 100 KB gzip (PROPOSED). | Lighthouse CI | 14 |
| AC-21 | Launch guard: `pnpm check:placeholders` passes; no Sanity document has `internalNote` containing DEMO; no database row named DEMO; no `settings` row with `is_demo = true`. | `scripts/check-live-demo.mjs` (prompt 13) | 13, 14 |
| AC-22 | One real payment and one real refund on the live Viva account in the review week. | Manual, recorded in the QA report | 14 |
| AC-23 | Turnstile and rate limits on holds, bookings and cancel; a missing or bad Turnstile token is rejected. | API tests | 06 |
| AC-24 | Secrets never reach the browser: the built client bundles of web and admin contain no service role key, Viva secret or signing secret; internal routes reject a bad or old signature. | Build-output grep test + API tests | 07, 11, 14 |
