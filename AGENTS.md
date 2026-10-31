# AGENTS.md — TEM Protection (transfers and VIP security)

Read this first, every session. It is the map and the golden rules. Detail lives in `docs/` and `.cursor/rules/`.

## What this is

TEM Protection is a premium transfer and VIP security service with **online booking and payment**. This repo is **kit 1: the booking core**. It is an independent company: no NEVMA branding anywhere. English only.

Two booking types: **transfer** (fixed price per zone pair and vehicle class) and **hourly hire** (hourly rate x hours). A customer can add the **VIP security** option to either. Payment is Viva Smart Checkout (hosted). Staff handle bookings in a **standalone admin app**. Content (pages, vehicle class copy and photos, UI strings) is in **one Sanity Studio**. Operations (zones, prices, rates, extras, vehicles, bookings, payments) are in **Supabase Postgres**.

Kit 2 (later, same repo and same Studio) adds the content pages (fleet, routes, VIP security page, About, Contact) and form submissions. Build kit 1 so kit 2 only adds to it.

## Repo map

```
apps/web/        Astro public site + React booking island + /api endpoints   (BUILT BY YOU from prompts)
apps/admin/      Standalone admin app, Supabase Auth, staff allow-list          (BUILT BY YOU from prompts)
apps/studio/     Sanity Studio                                                  (PROVIDED, validated: do not redesign)
packages/db/     SQL migrations, DEMO seed, database tests                      (PROVIDED, validated)
docs/            ARCHITECTURE, DATA-MODEL, BOOKING-RULES, API, CONTENT-MODEL, PAGES, DESIGN-SYSTEM, DECISIONS, ACCEPTANCE
design/          tokens.css + wireframes (open design/index.html)
seed/            Sanity DEMO seed (data.ndjson + images)
prompts/         00-HOW-TO-RUN + 14 build prompts. Run in order.
scripts/         check-placeholders and doc/prompt checks
```

## Golden rules (never break)

1. English only; the company name is TEM Protection; no NEVMA branding.
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
