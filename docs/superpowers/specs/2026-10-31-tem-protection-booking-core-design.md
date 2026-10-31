# TEM Protection — Booking core: design spec

Date: 2026-10-31. Status: DRAFT for user review. Source docs: vip-transfers-requirements.md, vip-transfers-viva-payment.md, music-build-kit.md (Nevma Music kit v1.2), nevma-decisions-log.md.

TEM Protection is the renamed VIP Transfers project (decided by the user 31 Oct 2026). It is still presented as a company separate from NEVMA: no NEVMA branding, its own design style, English only.

## 1. Goal and scope

Deliver a Cursor build kit, in the same shape as the Nevma Music kit, for the **booking core** of the TEM Protection site. The user builds it in Cursor. The booking engine goes first; content pages follow in a second kit.

### In scope (kit 1)
- Site shell: home page with a "Book" call to action, legal pages, 404/500, SEO basics.
- Booking flow with two booking types: **transfer** (fixed zone-pair price) and **hourly hire** (hourly rate x hours).
- Booking API: quote, holds, bookings, booking status, customer cancellation, Viva webhook.
- Supabase Postgres schema, migrations, DEMO seed.
- Viva Smart Checkout payment, verified webhooks, refunds from the admin.
- Resend emails: confirmation, 24-hour reminder, office notice (new booking, cancellation).
- Standalone admin CMS (`apps/admin`, connected to Supabase): bookings, vehicle assignment, blocked slots, zone prices, hourly rates, extras (including the VIP security price), invoice status, refunds.
- VIP security add-on (customer ticks it at booking; decided 31 Oct): `extras` row `vip-security`, `vip_security` flag on `bookings`, flag and filter and assigned-agent field in the admin, mention in the confirmation and office emails. All terms and prices are DEMO until the client answers.
- Sanity Studio with only: `siteSettings`, `uiStrings`, `vehicleClass` (content), `page` (home, legal). Built so kit 2 extends it (see 9b).

### Out of scope (kit 1)
Fleet, vehicle, services/routes, VIP security and About pages; contact and enquiry forms (including the VIP security enquiry form); quote-request form; round trips; pre-authorisation; distance pricing; kilometre allowance; online overtime charging; Google Maps; driver app; automatic myDATA invoicing.

### Scope addition (31 Oct 2026, user request)
Hourly hire as its own booking type. Version one previously excluded time-based pricing. Estimated +10 to 14 hours (Claude's estimate). To be logged as a scope addition; whether it is billed as a change request at EUR 40 per hour is the user's decision.

## 2. Architecture (option 2, decided by the user 31 Oct; replaces option 1)

One Astro public app, one standalone admin CMS app, and one Sanity Studio for the whole project. The admin was first planned inside the Astro app; the user asked for a standalone CMS connected to Supabase.

| Part | Technology | Notes |
| --- | --- | --- |
| Public pages | Astro, static | Home, legal, return pages |
| Booking flow | React island | Search, vehicle choice, details, pay |
| API | Astro endpoints on Vercel serverless (Node, TypeScript) | `/api/*` |
| Admin CMS | Standalone app `apps/admin`, own deploy and domain, noindex, connected to Supabase | Supabase Auth plus `staff` allow-list; shares DB types from `packages/db`; calls the web API only for Viva refunds (server-to-server, signed) |
| Content | Sanity Studio (`apps/studio`) | Content only |
| Database | Supabase Postgres (`packages/db`) | Migrations, seed, generated types; RLS on every table; bookings are written by the web API (service role) and by signed-in staff of the admin app under staff-only policies; no public access |
| Payments | Viva Smart Checkout | Hosted page, webhooks, refunds |
| Email, spam | Resend, Cloudflare Turnstile | Turnstile on holds and bookings |
| Hosting | Vercel Pro (NEVMA team, decided) | Preview per PR, production from main |

Trade-off accepted: about 8 to 10 more hours (Claude's estimate) for a second deployed app, its auth and shared types, in exchange for isolation: an admin release or failure does not touch the public booking site. Admin writes to Supabase under staff row-level-security policies; the Viva secret stays only in `apps/web`.

Monorepo `tem-platform` (pnpm + Turborepo): `apps/web`, `apps/admin`, `apps/studio`, `packages/db`.

## 3. Data split

**Sanity (content only):** `siteSettings`, `uiStrings`, `vehicleClass` (key, name, photos, copy, display specs), `page` (home, privacy, cookies, terms, cancellation text).

**Postgres (operations):** `vehicle_classes` (capacity, luggage, buffer), `vehicles`, `zones`, `zone_routes`, `zone_prices`, `hourly_rates`, `extras`, `bookings`, `booking_extras`, `blocked_slots`, `payments`, `slot_holds`, `staff`, `settings`.

Joined only by the vehicle class key (for example `v-class`). A class active in Postgres without Sanity content, or the reverse, is reported by the admin and the placeholder check.

### VIP security add-on in the database
- `extras` row `vip-security` (DEMO price, editable in the admin); copied with its price onto `booking_extras` at creation, like every extra.
- `bookings.vip_security boolean` (set by the API when the extra is present) and `bookings.security_notes text` (agents or partner assigned, entered by the office).
- It works with both booking types. Cancellation and refund rules cover it; refunds can be full or partial, so the add-on can be refunded on its own.

### Hourly hire additions
- `hourly_rates (class_id, price_per_hour_cents, min_hours, max_hours, currency)`; DEMO defaults min 3, max 12.
- `bookings.booking_type` enum (`transfer`, `hourly`); `bookings.hours` int.
- `to_zone_id`, `dropoff_address` nullable; a check constraint requires them for `transfer` and `hours` for `hourly`.
- Blocked range: pickup minus class buffer to pickup plus route duration (transfer) or `hours` (hourly) plus buffer. The API computes it; the exclusion constraint enforces it.
- Price = hourly rate x hours, `hours` between min and max, whole hours only. No kilometre allowance. Overtime beyond booked hours is arranged with the office and is not charged online.

## 4. Booking rules (carried over, unchanged)

- The server computes every price; the browser sends no amount (it sends zones, class key, hours, extras, times).
- Zones are chosen from a list; the street address is free text.
- Availability per class: active vehicles minus blocked slots, minus overlapping confirmed/assigned bookings and unexpired holds, with the buffer. A booking reserves a slot in a class, not a car; the office assigns a car later.
- States: pending, confirmed, assigned, completed, cancelled, expired.
- Hold: 20 minutes from vehicle selection, created under a class row lock, stored in `slot_holds`, expired by `pg_cron`; holds per visitor are limited.
- Payment flow: review, "Pay securely", server creates the Viva order, redirect to hosted Smart Checkout, redirect back to the confirmation page. Failure or cancel returns to "Payment not completed" (hold still running).
- The browser redirect never confirms a booking. Only a Viva event verified against Viva's API does. The confirmation page polls `/api/booking-status` by order code.
- Duplicate webhooks ignored through unique `viva_transaction_id`.
- Late payment after hold expiry: re-check the slot; confirm if free, otherwise refund automatically and email the customer.
- Customer cancellation through a secure token link; refunds (full or partial) from the admin through Viva.
- Invoices are issued manually; the form has an optional "I need an invoice" block; the admin tracks `not_required`, `requested`, `issued` and the number.
- Errors use one shape: `{ "error": "<code>", "message": "..." }` with codes `no_price`, `unavailable`, `invalid_request`, `payment_failed`.

## 5. Placeholders until the client answers

| Open point | Kit 1 behaviour |
| --- | --- |
| Zone pair without a price | Page says contact us, with phone and email from `siteSettings` |
| Cancellation and refund policy | Refund window is a row in `settings`, DEMO default, clearly marked |
| Night surcharge | Customer-picked extra |
| Round trips, pre-authorisation | Not built |
| VIP security inclusions, price, provider, legal wording, instant vs approved confirmation | Add-on built with a DEMO price and no legal claims; confirmed instantly like any extra until the client says otherwise |
| Payment methods on Viva | Shown as "to confirm" in the design |
| Brand (logo, colours, fonts) | Neutral premium tokens; the brand swap only changes the tokens file |
| Hourly min/max hours | 3 / 12, DEMO |

DEMO seed: demo zones, three demo vehicle classes, demo prices and hourly rates, every row labelled DEMO. `scripts/check-placeholders.mjs` fails the production build if DEMO data remains.

## 6. Design baseline

Neutral, premium design system as CSS tokens, built on the three existing v2 booking screens (V2Book, V2Confirmed, V2PaymentFailed), plus wireframes for the screens not yet designed: search (transfer / by the hour toggle), vehicle choice with price, details and optional invoice block, "Taking you to Viva" hand-off, cancel page, the VIP security option in the details step, admin screens. No NEVMA branding.

## 7. Kit contents (mirrors the Nevma Music kit)

- `AGENTS.md` and `.cursor/rules/` (00 project always-on; 10 Astro; 20 CSS/design; 30 Sanity; 40 scripts/a11y; 50 API/security/payments; 60 testing; 70 database; 80 admin app).
- `docs/`: ARCHITECTURE, DESIGN-SYSTEM, CONTENT-MODEL, BOOKING-RULES, DATA-MODEL, API, PAGES, DECISIONS, ACCEPTANCE.
- `prompts/` (00 how-to + 14 build prompts): 01 workspace; 02 Sanity Studio and seed; 03 design foundation; 04 database migrations and DEMO seed; 05 pricing and availability (pure functions, tests first); 06 holds and booking API; 07 Viva; 08 emails; 09 booking UI; 10 return pages; 11 standalone admin app (auth, bookings, prices and rates, extras, blocked slots, refunds, VIP security flag); 12 shell, legal, SEO; 13 deploy, cron, backups; 14 QA including one real payment and one real refund.
- `design/`: tokens, wireframes, static renders.
- `apps/studio/`: ready Sanity Studio, validated and built.
- `seed/`: Sanity seed (siteSettings, 3 vehicle classes, pages) and SQL DEMO seed.
- Root files: `.env.example`, `scripts/check-placeholders.mjs`.

## 8. Acceptance and testing

- Unit tests for pricing and availability (transfer and hourly), written before the code.
- Database tests: overlapping bookings rejected by the exclusion constraint; check constraints per booking type.
- Concurrency test: parallel holds on the last vehicle, one wins.
- Webhook replay test: duplicate event changes nothing.
- Late-payment test: slot taken, automatic refund and email.
- End-to-end on Viva's sandbox; in review week one real payment and one real refund.
- Accessibility checks on the booking flow; Lighthouse targets LCP under 2.5 s, INP under 200 ms, CLS under 0.1 on public pages.
- No price, amount or status accepted from the browser.

## 9. Dates and dependencies

Viva test access needed by Fri 27 Nov 2026; live account approved by Fri 15 Jan 2027. Zone list and price matrix, fleet, buffers: Fri 6 Nov. Cancellation and refund policy: Fri 4 Dec. These dates come from nevma-delivery-schedule.md; the booking-first order changes the sequence but not the client's input dates. Whether the 9 Feb 2027 live date moves is not decided here.

## 9b. Kit 2: content site and fuller CMS (decided by the user 31 Oct: same Studio, built after kit 1)

Kit 2 extends `apps/web` and `apps/studio` in the same monorepo; nothing in kit 1 is rebuilt.

Kit 2 adds:
- Pages: fleet, vehicle class pages, services and routes, VIP security (with enquiry form), About, Contact, and the "Request a transfer" quote fallback.
- Sanity: editable copy, images and SEO for every page; UI text (button labels, form labels, error messages); email wording; FAQs; legal and cancellation text; route display copy; VIP security page; form definitions and submissions (as in the Nevma Music kit).
- VIP security: the booking add-on is already in kit 1; kit 2 adds the VIP security page and its enquiry form, and replaces the DEMO price and wording once the client answers.

Kept in the admin (Postgres), not in Sanity, because they must stay exact and transactional: zones, zone prices, hourly rates, extras, vehicles, blocked slots, bookings.

Rules for kit 1 so kit 2 needs no rework:
- `siteSettings` holds all contact details and is the single source for them.
- `page` is a page-builder document (ordered sections) so kit 2 adds section types, not new page types.
- `vehicleClass` is keyed to Postgres by `key` and already carries photos, copy and SEO.
- All user-facing strings in kit 1 (booking flow, errors, emails) are read from a Sanity `uiStrings` singleton with code defaults, so kit 2 only fills them in.
- No hard-coded copy in components.

## 9c. Review additions (31 Oct, before the build; PROPOSED unless marked)

1. Admin cancellations and refunds both go through signed internal web API routes (`/api/internal/cancel`, `/api/internal/refund`), so Viva, the database and the emails always stay in step. The admin writes directly only: vehicle assignment, status `assigned`/`completed`, security notes, invoice fields, blocked slots, prices, rates, extras, vehicles.
2. Staff column rights: on `bookings` staff may update only `vehicle_id`, `status`, `security_notes`, `invoice_status`, `invoice_number`, `updated_at`. Prices, customer details and payment fields are not writable by staff.
3. Reminder emails: Vercel Cron calls `/api/cron/reminders` every 15 minutes with `CRON_SECRET`; `bookings.reminder_sent_at` prevents duplicates.
4. `bookings.vip_security` is kept in step with the `vip-security` row in `booking_extras` by a database trigger.
5. Admin app framework: Astro with server rendering on Vercel, `@supabase/ssr` cookie sessions, React islands only where a table needs them.
6. Viva: `GET /api/webhooks/viva` answers Viva's URL verification with the webhook key; the order's payment timeout equals the time left on the hold.
7. Expired holds never count against availability (`expires_at > now()` in every query); the `pg_cron` job only marks them expired.
8. Sanity dataset `production` is private from the start (read token at build), so kit 2 form submissions need no change.
9. Booking reference: `TEM-` plus 6 characters from an unambiguous alphabet (no 0/O/1/I). Cancel-link token stored only as a SHA-256 hash (`cancel_token_hash`). Minimum lead time `settings.min_lead_minutes` = 120 (DEMO).

## 10. Decisions to record

1. TEM Protection is the new name of the VIP Transfers project (user, 31 Oct).
2. Booking core is built first, content pages second (user, 31 Oct).
3. First kit scope = option A, booking core (user, 31 Oct).
4. Architecture = one Astro public app, a standalone admin CMS app connected to Supabase, and one Sanity Studio for the project (user, 31 Oct; replaced the first choice of admin inside the Astro app). Extra cost about 8 to 10 hours (Claude's estimate).
5. Design baseline = neutral tokens, brand swapped later (user, 31 Oct).
6. Hourly hire added as its own booking type (user, 31 Oct); billing as a change request is open.
7. Content site and fuller CMS are kit 2, built in the same monorepo and the same Sanity Studio after kit 1 (user, 31 Oct).
8. VIP security add-on is in kit 1: customer ticks it at booking; stored in the database (`extras` row, `vip_security` flag) and managed in the admin (user, 31 Oct). Terms, price and provider still open with the client; DEMO until answered.
