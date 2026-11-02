# Decisions

D = decided by the user (date). P = proposed in this kit, change if needed. O = open with the client (due date). Full background: the Nevma project docs (`vip-transfers-requirements.md`, `tem-protection-booking-core-spec.md`).

## Decided

| # | Decision | Status |
| --- | --- | --- |
| 1 | The site's brand is **Elite Protection** (decided by the user 1 Nov; "TEM Protection" was the working name). Internal names stay: repo `tem-platform`, packages `@tem/*`, Vercel `tem-web`/`tem-admin`, headers `X-TEM-*`, env `TEM_WEB_DEPLOY_HOOK_URL`. Booking references start with `EP-` (migration 0009). Earlier: Elite Protection is the new name of the VIP Transfers project. Separate company, its own design style, no NEVMA branding, English only. | D 31 Oct, 1 Nov |
| 2 | The booking engine is built first (kit 1); content pages and fuller CMS follow in kit 2, in the same repo and the same Sanity Studio. | D 31 Oct |
| 3 | Kit 1 scope: site shell, booking flow, API, Supabase, holds, Viva, emails, admin. | D 31 Oct |
| 4 | Architecture: Astro public app, standalone admin app connected to Supabase, one Sanity Studio for the project. | D 31 Oct |
| 5 | Design baseline: neutral tokens; the client's brand later changes only `tokens.css`. | D 31 Oct |
| 6 | Hourly hire is its own booking type (rate x whole hours, per-class min and max). | D 31 Oct |
| 7 | VIP security add-on in kit 1: the customer ticks it at booking; `extras` row `vip-security`, `bookings.vip_security` flag, managed in the admin. | D 31 Oct |
| 8 | Fixed zone prices chosen from a list; availability by vehicle class; 20-minute hold at vehicle selection; manual invoices; no maps, no route design, no distance pricing, no driver app. | D (17–22 Oct) |
| 9 | Viva Smart Checkout (hosted). A redirect never confirms; only a verified Viva event does. | D 23 Oct |
| 10 | Hosting on Vercel Pro (client's team); Supabase Pro; Sanity; Resend; Cloudflare Turnstile. Vendor fees billed to the client. | D (Oct) |
| 11 | Design: the Elite Protection V2 boards (`design/tokens.css`); admin design kit in `design/admin/` (`docs/DESIGN-ADMIN.md`). | D 1 Nov |
| 12 | Prices shown everywhere are final, VAT included. The VAT share appears only as a price analysis on the review step and in the confirmation email (BOOKING-RULES §2, migration 0010, AC-37). | D 1 Nov |
| 13 | Office (manual) bookings: created through the web app's signed internal route; staff choose a Viva payment link (vehicle held, DEMO 4 h) or an offline payment (paid now or to collect); price override needs a reason. Fleet calendar per vehicle (day/week, view + click to book or block, no drag). Customers kept by e-mail for future features. Brand dropdown on every admin select. (`docs/OFFICE-BOOKINGS.md`, migration 0011) | D 1 Nov |
| 14 | The office manages vehicle classes (booking side), vehicles, zones, routes, prices and extras in the admin; the website side of a class (name, photos, text) stays in Sanity under the same key. Database guards keep keys fixed once used and switch off instead of delete (`docs/FLEET-SETUP.md`, migration 0012). | D 1 Nov |
| 15 | The website follows the Elite Protection V2 design (`design/v2/`, `docs/DESIGN-V2.md`), with final prices (no "excl. VAT") and an added Transfer / By the hour switch. Demo data follows the design's fleet (E-Class, S-Class, V-Class, Vito, Sprinter), photos and figures, still DEMO. | D 1 Nov |
| 16 | Website built by porting `design/v2/build`; the fidelity test (`v2-fidelity.spec.ts`) is the definition of done for public pages. | D 2 Nov |

## Proposed in this kit

| # | Proposal | Why |
| --- | --- | --- |
| P1 | Admin = Astro `output: 'server'` + `@supabase/ssr` + React islands for tables | one framework across the repo |
| P2 | Admin cancellations and refunds go through signed web routes `/api/internal/cancel` and `/api/internal/refund` | Viva, database and emails always stay in step; Viva secrets stay in one app |
| P3 | Staff may update only `vehicle_id`, `status` (confirmed↔assigned→completed), `security_notes`, `invoice_status`, `invoice_number` on bookings | prices and customer data cannot be changed by mistake |
| P4 | Holds are created by the database function `create_hold` under a class row lock | the last-vehicle race is impossible (tested) |
| P5 | At most 2 active holds per visitor (`settings.max_active_holds_per_visitor`) | stops one visitor blocking the fleet |
| P6 | Pick-up time sent as local Athens time and converted on the server; non-existent times rejected, repeated times take the earlier | DST nights are handled once, on the server |
| P7 | Minimum lead time 120 minutes (`settings.min_lead_minutes`, DEMO) | the office needs time to plan |
| P8 | Booking reference `EP-` + 6 characters (no 0/O/1/I); cancel token stored only as SHA-256 | readable on the phone; leaked database cannot cancel bookings |
| P9 | Reminder email by Vercel Cron every 15 min, 23–25 h before pick-up, claimed once | no double sends |
| P10 | Sanity dataset private from the start | kit 2 form submissions need no change |
| P11 | Booking island budget under 100 KB gzip; other pages ship no framework JS | performance targets |
| P12 | Rate limits: 30 quotes/min per IP; 6 holds and 6 bookings per hour per IP and visitor | abuse protection |
| P13 | Late payment after the hold, vehicle taken: full automatic refund and cancellation | customer is never charged for a ride that cannot happen |

## Kit 2 (1 Nov 2026; the user asked to build directly, so these are proposed defaults)

| # | Proposal | Why |
| --- | --- | --- |
| P14 | Content pages: fleet, vehicle pages, services, one page per route, VIP security with enquiry form, About, Contact, Request a transfer, thank-you pages | the Phase 1 content scope from the requirements |
| P15 | "From" prices read from Postgres at build time; `siteSettings.showFromPrices` switch (default on) | SEO and conversion; client can turn them off |
| P16 | After price changes the admin offers "update the website" (deploy hook, disabled 2 min after use) | serverless instances cannot share a debounce; the booking flow is always live anyway |
| P17 | Forms and submissions in Sanity (as decided for Nevma Music on 29 Oct); field sets fixed in code, wording/recipients/topics/retention in Sanity | one place for the office; no extra database table |
| P18 | Submissions written with an Editor robot token on the server; Studio desk per form and status | private data stays private; easy follow-up |
| P19 | Retention 24 months per form (DEMO), weekly cron | GDPR minimisation; client confirms with the privacy text |
| P20 | Routes are Sanity pages keyed by zone codes; unknown codes are excluded and flagged | content and prices never disagree silently |
| P21 | No testimonials or ratings until the client supplies real ones | no fabricated reviews |

## Open with the client

| # | Question | Due | Kit 1 behaviour until answered |
| --- | --- | --- | --- |
| O1 | Zone list, price matrix, fleet classes, vehicles per class, buffer between trips | Fri 6 Nov | DEMO seed |
| O2 | VIP security: inclusions, price, provider, legal wording, instant or approved confirmation | Fri 6 Nov | DEMO price, neutral wording, instant |
| O3 | Night surcharge automatic by pick-up time or customer-picked | Fri 6 Nov | customer-picked extra |
| O4 | Round trips (which routes, how the return is priced) | Fri 6 Nov | not built |
| O5 | Brand: logo, colours, fonts, photos | Fri 6 Nov | neutral tokens, DEMO images |
| O6 | Hourly hire: min and max hours, overtime rule, any kilometre allowance | Fri 6 Nov | 3–12 h, overtime with the office, no allowance |
| O7 | Cancellation and refund policy | Fri 4 Dec | full refund until 24 h before (DEMO) |
| O8 | Privacy and cookie text; retention period for booking data | Fri 4 Dec | DEMO legal pages |
| O9 | Accountant confirms manual invoicing | Fri 4 Dec | manual invoices |
| O10 | Pre-authorisation for near-term bookings | Fri 4 Dec | not built |
| O11 | Payment methods enabled on Viva | Fri 27 Nov (test access) | as Viva offers |
| O12 | Minimum lead time | Fri 6 Nov | 120 minutes (DEMO) |
| O13 | Billing of the scope additions (hourly hire, standalone admin) as a change request | internal | — |
| O14 | Kit 2 content: page copy, fleet photos, route list and copy, VIP security copy, About text | Fri 20 Nov | DEMO seed |
| O15 | Show "From" prices publicly, or price on request only | Fri 6 Nov | shown (switch on) |
| O16 | Form recipients (office, security desk) and contact topics | Fri 20 Nov | example.com addresses (DEMO) |
| O17 | Submission retention period | Fri 4 Dec (with the privacy text) | 24 months (DEMO) |
| O18 | VAT rate for chauffeured transfers and VIP security (accountant) | before launch | 24% (`settings.vat_rate_bp`, DEMO) |
| O19 | Are the design's prices (airport €150–€180, hourly €60–€90) final prices or before VAT? The site shows final prices. | before launch | seeded as final (DEMO) |
| O20 | Photo rights: which of the 30 design photos the client owns or licenses; an SVG logo | before launch | design photos (DEMO) |
