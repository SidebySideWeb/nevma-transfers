# TEM Protection — Cursor build kit 1: booking core

Version 1.0, 31 Oct 2026. Side by Side for TEM Protection (the renamed VIP Transfers project).

Kit 1 builds the **booking engine**: transfers at fixed zone prices, hourly hire, the VIP security add-on, Viva payment, emails, and a standalone admin for the office. Kit 2 (later, same repo, same Sanity Studio) adds the content pages (fleet, routes, VIP security page, About, Contact) and form submissions.

## Start in five steps

1. **Accounts first:** create the Sanity project "TEM Protection" (dataset `production`, private) and a GitHub repository. The rest are asked for when needed (see `prompts/00-HOW-TO-RUN.md`).
2. **Folder:** unzip and move everything inside `tem-platform/` (hidden files included: `.cursor/`, `.gitignore`, `.nvmrc`, `.env.example`) into your empty project folder. Open it in Cursor. `AGENTS.md` and `.cursor/rules/` load by themselves.
3. **Read** `prompts/00-HOW-TO-RUN.md` (3 minutes).
4. **Run** `prompts/01-workspace.md` → `14-qa.md` in order, one per Cursor Agent chat: paste the text under `--- PROMPT ---`, run the prompt's **Check** list, then commit with the given message.
5. **Open** `design/index.html` in a browser any time to see the 12 wireframe screens.

## What is inside

| Folder / file | Contents | Status |
| --- | --- | --- |
| `AGENTS.md`, `.cursor/rules/` | the map and golden rules; 9 rule files (project, Astro, CSS/design, Sanity, scripts/a11y, API/security/payments, testing, database, admin) | ready |
| `docs/` | ARCHITECTURE, DATA-MODEL, BOOKING-RULES, API, CONTENT-MODEL, PAGES, DESIGN-SYSTEM, DECISIONS, ACCEPTANCE (AC-01 to AC-24); `superpowers/` holds the approved spec and plan | ready |
| `prompts/` | 00 how to run + 14 build prompts with checks and commit messages | ready |
| `apps/studio/` | **Sanity Studio**: `siteSettings`, `uiStrings` (69 keys), `vehicleClass`, page builder (`hero`, `richText`, `ctaBand`, `faq`), `seo`; singletons and desk structure. Sanity 6.21: 0 errors, 0 warnings, `sanity build` passes, 14 tests | validated |
| `packages/db/` | **Postgres**: 6 migrations (14 tables, exclusion constraint against double booking, `create_hold` with class lock, refund limit, VIP flag trigger, RLS with staff column rights, `pg_cron`), DEMO seed, 22 tests on PostgreSQL 16 | validated |
| `seed/` | Sanity DEMO seed: `tem-seed.tar.gz` (import format, 10 documents, 7 images) and `sanity/data.ndjson` (readable) | validated against the schema |
| `design/` | `tokens.css` (neutral baseline: the brand swap changes this file only), `index.html`, 12 screens (9 public, 3 admin) | checked at 390 and 1440 px: no overflow, zero serious axe issues |
| `scripts/` | `check-placeholders.mjs` (blocks launch with DEMO content), `build-sanity-seed.mjs`, kit consistency, contrast and placeholder tests (13) | ready |
| root | `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc`, `.gitignore`, `.env.example` | ready |

`apps/web` (site + booking API) and `apps/admin` are created and built by Cursor from the prompts.

## Built-in decisions to know

- One Astro public app, one standalone admin app on Supabase, one Sanity Studio. Sanity holds content only; prices, fleet and bookings live in Postgres and are edited in the admin.
- The server computes every price. A booking is confirmed only by a verified Viva event, never by a redirect.
- A 20-minute hold is taken in the database under a lock when the customer selects a vehicle; two people can never take the last car.
- Admin cancellations and refunds go through signed web routes, so Viva and the emails always stay in step; staff cannot change prices or customer data on a booking.
- Everything the client has not confirmed is DEMO and blocks the production build until replaced (`docs/DECISIONS.md` lists the open questions and due dates).

## Accounts you will need during the prompts

Sanity (now) · GitHub (01) · Supabase Pro, EU (04) · Cloudflare Turnstile (06) · Viva demo account, due Fri 27 Nov (07) · Resend with a verified domain (08) · Vercel Pro team (13) · Viva live account, due Fri 15 Jan 2027 (14).
