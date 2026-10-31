# Decisions

D = decided by the user (date). P = proposed in this kit, change if needed. O = open with the client (due date). Full background: the Nevma project docs (`vip-transfers-requirements.md`, `tem-protection-booking-core-spec.md`).

## Decided

| # | Decision | Status |
| --- | --- | --- |
| 1 | TEM Protection is the new name of the VIP Transfers project. Separate company, its own design style, no NEVMA branding, English only. | D 31 Oct |
| 2 | The booking engine is built first (kit 1); content pages and fuller CMS follow in kit 2, in the same repo and the same Sanity Studio. | D 31 Oct |
| 3 | Kit 1 scope: site shell, booking flow, API, Supabase, holds, Viva, emails, admin. | D 31 Oct |
| 4 | Architecture: Astro public app, standalone admin app connected to Supabase, one Sanity Studio for the project. | D 31 Oct |
| 5 | Design baseline: neutral tokens; the client's brand later changes only `tokens.css`. | D 31 Oct |
| 6 | Hourly hire is its own booking type (rate x whole hours, per-class min and max). | D 31 Oct |
| 7 | VIP security add-on in kit 1: the customer ticks it at booking; `extras` row `vip-security`, `bookings.vip_security` flag, managed in the admin. | D 31 Oct |
| 8 | Fixed zone prices chosen from a list; availability by vehicle class; 20-minute hold at vehicle selection; manual invoices; no maps, no route design, no distance pricing, no driver app. | D (17–22 Oct) |
| 9 | Viva Smart Checkout (hosted). A redirect never confirms; only a verified Viva event does. | D 23 Oct |
| 10 | Hosting on Vercel Pro (client's team); Supabase Pro; Sanity; Resend; Cloudflare Turnstile. Vendor fees billed to the client. | D (Oct) |

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
| P8 | Booking reference `TEM-` + 6 characters (no 0/O/1/I); cancel token stored only as SHA-256 | readable on the phone; leaked database cannot cancel bookings |
| P9 | Reminder email by Vercel Cron every 15 min, 23–25 h before pick-up, claimed once | no double sends |
| P10 | Sanity dataset private from the start | kit 2 form submissions need no change |
| P11 | Booking island budget under 100 KB gzip; other pages ship no framework JS | performance targets |
| P12 | Rate limits: 30 quotes/min per IP; 6 holds and 6 bookings per hour per IP and visitor | abuse protection |
| P13 | Late payment after the hold, vehicle taken: full automatic refund and cancellation | customer is never charged for a ride that cannot happen |

## Open with the client

Updated 31 Oct 2026 (prompt 14 QA): still awaiting written answers; kit 1 continues on DEMO / proposed defaults. Live Viva (O11) required for AC-22 before Fri 15 Jan 2027.

| # | Question | Due | Kit 1 behaviour until answered | Status 31 Oct |
| --- | --- | --- | --- | --- |
| O1 | Zone list, price matrix, fleet classes, vehicles per class, buffer between trips | Fri 6 Nov | DEMO seed | Open |
| O2 | VIP security: inclusions, price, provider, legal wording, instant or approved confirmation | Fri 6 Nov | DEMO price, neutral wording, instant | Open |
| O3 | Night surcharge automatic by pick-up time or customer-picked | Fri 6 Nov | customer-picked extra | Open |
| O4 | Round trips (which routes, how the return is priced) | Fri 6 Nov | not built | Open |
| O5 | Brand: logo, colours, fonts, photos | Fri 6 Nov | neutral tokens, DEMO images | Open |
| O6 | Hourly hire: min and max hours, overtime rule, any kilometre allowance | Fri 6 Nov | 3–12 h, overtime with the office, no allowance | Open |
| O7 | Cancellation and refund policy | Fri 4 Dec | full refund until 24 h before (DEMO) | Open |
| O8 | Privacy and cookie text; retention period for booking data | Fri 4 Dec | DEMO legal pages | Open |
| O9 | Accountant confirms manual invoicing | Fri 4 Dec | manual invoices | Open |
| O10 | Pre-authorisation for near-term bookings | Fri 4 Dec | not built | Open |
| O11 | Payment methods enabled on Viva | Fri 27 Nov (test); live Fri 15 Jan 2027 | demo credentials; `PUBLIC_BOOKING_OPEN=false` in prod until live | Open |
| O12 | Minimum lead time | Fri 6 Nov | 120 minutes (DEMO) | Open |
| O13 | Billing of the scope additions (hourly hire, standalone admin) as a change request | internal | — | Open |
