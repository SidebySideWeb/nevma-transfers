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
| AC-16 | A zone pair or class with no price returns `no_price`; the flow shows `booking.contactUs` with phone and email. | API test + Playwright (`demo-north` → `demo-port`, `demo-v-class`) | 06, 09 |
| AC-17 | Prices are fixed when the booking is created: changing a price afterwards does not change the booking; the review total equals `price_cents` and the Viva order amount. | API test | 06, 07 |
| AC-18 | Admin: only `staff` users get in; others are signed out; every mutation is checked on the server; a banner lists classes missing in Sanity or Postgres; cancel and refund need a confirmation step. | Vitest + Playwright on the admin | 11 |
| AC-19 | Accessibility: axe reports zero serious or critical issues on every route; the booking path works by keyboard alone; focus moves to each step heading and to error summaries; hold time is announced politely. | Playwright + axe | 09, 14 |
| AC-20 | Performance: home and legal pages LCP < 2.5 s, INP < 200 ms, CLS < 0.1 (mobile); booking island < 100 KB gzip (PROPOSED). | Lighthouse CI | 14 |
| AC-21 | Launch guard: `pnpm check:placeholders` passes; no Sanity document has `internalNote` containing DEMO; no database row named DEMO; no `settings` row with `is_demo = true`. | `scripts/check-live-demo.mjs` (prompt 13) | 13, 14 |
| AC-22 | One real payment and one real refund on the live Viva account in the review week. | Manual, recorded in the QA report | 14 |
| AC-23 | Turnstile and rate limits on holds, bookings and cancel; a missing or bad Turnstile token is rejected. | API tests | 06 |
| AC-24 | Secrets never reach the browser: the built client bundles of web and admin contain no service role key, Viva secret or signing secret; internal routes reject a bad or old signature. | Build-output grep test + API tests | 07, 11, 14 |

## Find and manage a booking (added 1 Nov, design V2Lookup / V2Manage)

| Id | Requirement | How it is proven | Prompt |
| --- | --- | --- | --- |
| AC-35 | Find my booking never reveals whether a reference or email exists (same response and similar timing); a match issues a new link and the old one stops working; rate limits and Turnstile apply. | API tests | 25 |
| AC-36 | The manage page shows the booking from the token only (no personal data in URLs or logs), offers invoice request, call, add to calendar (valid `.ics`) and cancel; an unknown or cleared token shows `manage.linkInvalid`; after cancelling, the link no longer works. | Playwright + `.ics` parse test | 25 |
| AC-37 | All customer-facing prices are final (VAT included). The review step and the confirmation email show the price analysis from the stored booking: items, price before VAT, VAT at the booking's rate, total; € 220.00 at 24% shows € 177.42 and € 42.58; a rate change in settings does not alter existing bookings. | db test (0010) + Vitest (email) + Playwright (review step) | 27 |

## Kit 2 — content site and forms

| Id | Requirement | How it is proven | Prompt |
| --- | --- | --- | --- |
| AC-25 | "From" prices on fleet, vehicle and route pages equal the lowest current Postgres price (transfer) or hourly rate (hourly) at build time; with `siteSettings.showFromPrices` off every price becomes `site.noOnlinePrice`; a route or class with no price shows `site.noOnlinePrice` and a "Request a quote" link. | Vitest on `catalog.ts` with the DEMO seed + Playwright | 16, 18, 19 |
| AC-26 | A route page's "Book this route" opens `/book` with the zone pair filled (`/book?from=<code>&to=<code>`); "Request a quote" opens `/request-a-transfer` prefilled. | Playwright | 19, 22 |
| AC-27 | Each form (transfer-request, vip-security, contact) stores one `formSubmission` with the answers, emails the recipient (contact: topic recipient when set) and confirms to the sender; works without JavaScript (303 to the thank-you page) and with it. | API tests with Resend and Sanity mocked at the HTTP edge + one real run per form | 21, 22 |
| AC-28 | Spam protection: a filled honeypot looks like success but stores and sends nothing; missing or bad Turnstile is rejected; the 6th submission in an hour from one IP for one form is rejected. | API tests | 21 |
| AC-29 | Submissions are private: the dataset is private, the public site bundle contains no Sanity token, the read token (Viewer) cannot write, the write token exists only in `apps/web` server code. | Bundle grep + token permission test | 21, 24 |
| AC-30 | The weekly retention cron deletes submissions older than the form's `retentionMonths` and nothing newer; it needs `CRON_SECRET`. | Test with dated fixtures | 21 |
| AC-31 | After a price change the admin offers "update the website", which calls the deploy hook once from the server and is disabled for 2 minutes. | Admin Vitest + Playwright | 23 |
| AC-32 | A Sanity route whose zone codes do not exist in Postgres is left out of the build with a warning and listed in the admin banner. | DB seed test (provided) + build test | 16, 19, 23 |
| AC-33 | Every kit 2 page passes axe with no serious or critical issues, has a unique title, description and canonical, appears in the sitemap, and has the structured data in `docs/PAGES.md`. | Playwright + axe + sitemap test | 18, 19, 20, 23, 24 |
| AC-34 | No hard-coded copy: navigation, price labels and form labels come from `uiStrings` areas `site` and `forms`; page copy from Sanity. | Lint rule + review | 17, 20, 22 |
