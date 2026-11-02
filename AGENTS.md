# AGENTS.md — Elite Protection (transfers and VIP security)

Read this first, every session. It is the map and the golden rules. Detail lives in `docs/` and `.cursor/rules/`.

## What this is

Elite Protection is a premium transfer and VIP security service with **online booking and payment**. This repo is **kit 1: the booking core**. It is an independent company: no NEVMA branding anywhere. English only.

Two booking types: **transfer** (fixed price per zone pair and vehicle class) and **hourly hire** (hourly rate x hours). A customer can add the **VIP security** option to either. Payment is Viva Smart Checkout (hosted). Staff handle bookings in a **standalone admin app**. Content (pages, vehicle class copy and photos, UI strings) is in **one Sanity Studio**. Operations (zones, prices, rates, extras, vehicles, bookings, payments) are in **Supabase Postgres**.

Kit 2 (prompts 15–24, same repo and same Studio) adds the content pages (fleet, routes, VIP security page, About, Contact, Request a transfer) and form submissions. It only adds to kit 1.

Drivers module: see `docs/DRIVERS.md` and `docs/superpowers/plans/2026-11-01-drivers-dispatch.md`; additive only, switched on with `FEATURE_DRIVERS=true` (migration `0019_drivers_dispatch.sql`).

## Repo map

```
apps/web/        Astro public site + React booking island + /api endpoints   (BUILT BY YOU from prompts)
apps/admin/      Standalone admin app, Supabase Auth, staff allow-list          (BUILT BY YOU from prompts)
apps/studio/     Sanity Studio                                                  (PROVIDED, validated: do not redesign)
packages/db/     SQL migrations, DEMO seed, database tests                      (PROVIDED, validated)
docs/            ARCHITECTURE, DATA-MODEL, BOOKING-RULES, API, CONTENT-MODEL, PAGES, DESIGN-SYSTEM, DECISIONS, ACCEPTANCE
design/          v2/build = the website's code source (exact V2 pages + v2.css); admin/ = admin kit; tokens.css; screens/ = old wireframes
seed/            Sanity DEMO seed (data.ndjson + images)
prompts/         00-HOW-TO-RUN + 14 build prompts. Run in order.
scripts/         check-placeholders and doc/prompt checks
```

## Golden rules (never break)

1. English only; the company name is Elite Protection; no NEVMA branding.
2. Money is integer cents, currency EUR. Times are ISO 8601 with offset, stored as `timestamptz`.
3. **The server computes every price.** The browser never sends `price`, `amount` or `total`; the API rejects any request that contains them.
4. A hold lasts 20 minutes (`settings.hold_minutes`). The buffer per vehicle class is `vehicle_classes.buffer_minutes` (default 30).
5. Booking states: `pending`, `confirmed`, `assigned`, `completed`, `cancelled`, `expired`. Booking types: `transfer`, `hourly`.
6. **A browser redirect never confirms a booking.** Only a Viva event verified against Viva's API does. Duplicate events are ignored (unique `viva_transaction_id`).
7. Sanity holds content only. Zones, prices, hourly rates, extras, vehicles, blocked slots, bookings and payments stay in Postgres. They join only through the vehicle class `key` (for example `v-class`).
8. Every user-facing string comes from Sanity `uiStrings` (with code defaults) or a Sanity document. No hard-coded copy in components.
9. The VIP security add-on is the `extras` row `vip-security`; the booking flag is `bookings.vip_security`; notes are `bookings.security_notes`.
10. Every placeholder is labelled DEMO. `pnpm check:placeholders` fails the production build while any remain.
11. RLS is on for every table. No public access. The Viva secret and the Supabase service role key exist only in `apps/web` server code.
12. Sanity document IDs use hyphens (a dot makes an ID private).
13. Do not change `apps/studio` schemas or `packages/db/migrations` unless the prompt says so. If a change is needed, add a new migration or ask.
14. Tests first for pricing, availability, holds, payments, refunds. Acceptance ids are in `docs/ACCEPTANCE.md` (AC-01 and up).
15. Never print, log or commit secrets or customer data.

## Build order

`prompts/00-HOW-TO-RUN.md` then `01-workspace` ... `14-qa`. One prompt per Cursor Agent chat. Run each prompt's **Check** list before committing.

| # | Prompt | Result |
| --- | --- | --- |
| 01 | workspace | `apps/web` and `apps/admin` created, tooling, CI |
| 02 | sanity-studio-seed | Studio running and deployed, DEMO content imported, types |
| 03 | design-foundation | Tokens, base CSS, layout, header, footer |
| 04 | database | Supabase project, migrations applied, DEMO seed, generated types |
| 05 | pricing-availability | Pure functions with tests |
| 06 | holds-booking-api | Quote, holds, bookings, status, cancel |
| 07 | viva | Order creation, webhook, late payment, refunds |
| 08 | emails | Confirmation, reminder, office notices |
| 09 | booking-ui | The booking flow |
| 10 | return-pages | Hand-off, confirmed, not completed, cancel |
| 11 | admin-app | Standalone admin |
| 12 | shell-legal-seo | Home, legal pages, errors, SEO |
| 13 | deploy-cron-backups | Vercel, cron, backups |
| 14 | qa | Full QA, one real payment and one real refund |

## Kit 2 — content site and forms (prompts 15–24)

Spec: `docs/superpowers/specs/2026-11-01-tem-protection-kit2-content-site.md`. Adds fleet, vehicle, services, route, VIP security, About, Contact and Request-a-transfer pages, and three forms whose submissions are stored in Sanity (`docs/FORMS.md`). Extra golden rules:

16. "From" prices are read from Postgres **at build time** (`lib/server/catalog.ts`) and shown only when `siteSettings.showFromPrices` is true; the booking flow always uses live prices.
17. Form submissions are written only by `apps/web` server code with `SANITY_WRITE_TOKEN` (Editor robot). The read token is a Viewer token. Neither reaches the browser.
18. A Sanity route is published only if its zone pair exists in Postgres; otherwise it is skipped with a build warning and flagged in the admin.
19. No testimonials, ratings or other content the client has not supplied.

| # | Prompt | Result |
| --- | --- | --- |
| 15 | studio-kit2-seed | Extended Studio deployed, kit 2 DEMO content, write token, queries |
| 16 | catalog-data-layer | Build-time zones, routes and "From" prices |
| 17 | sections-navigation | Navigation, breadcrumbs, the 7 new sections |
| 18 | fleet-pages | `/fleet`, `/fleet/[key]` |
| 19 | services-routes | `/services`, `/routes/[slug]`, booking prefill |
| 20 | standard-pages | VIP security, About, Contact |
| 21 | forms-backend | `/api/forms/[form]`, Sanity submissions, emails, retention |
| 22 | forms-ui | Forms on the pages, prefill, thank-you pages |
| 23 | admin-seo-launch | "Update the website", route checks, sitemap, launch guard |
| 24 | qa-kit2 | AC-25 to AC-34 |
| 25 | manage-booking | Find my booking, manage booking by secure link, add to calendar (AC-35, AC-36) |
| 26 | admin-design | Restyle the admin to the Elite Protection admin design kit (`design/admin/`, `docs/DESIGN-ADMIN.md`) |
| 27 | vat-price-analysis | Final prices; VAT price analysis on review step and confirmation email (AC-37) |
| 28 | office-bookings-calendar | Office (manual) bookings, fleet calendar, customers, brand dropdowns (`docs/OFFICE-BOOKINGS.md`) |
| 29 | fleet-setup | Add and edit classes, vehicles, zones, extras; class page with readiness checklist (`docs/FLEET-SETUP.md`) |
| 30 | v2-design-foundation | Website in the Elite Protection V2 design: fonts, components, kit 1 pages (`docs/DESIGN-V2.md`) |
| 31 | customers | Customers list and detail in the admin (migration 0013) |
| 32 | fleet-feed | Import `data/fleet-feed.json` into Postgres and Sanity; DEMO flags; extras per booking type (`docs/FLEET-FEED.md`) |
