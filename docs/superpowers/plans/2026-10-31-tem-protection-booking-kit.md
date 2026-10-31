# TEM Protection Booking Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce kit 1 for TEM Protection: a validated Cursor build kit (rules, docs, ordered prompts, ready Sanity Studio and seed, Postgres migrations and DEMO seed, design tokens and wireframes) that the user then uses to build the booking core in Cursor.

**Architecture:** The kit is a pnpm + Turborepo monorepo skeleton `tem-platform`. Ready, validated code ships only for what is deterministic: `apps/studio` (Sanity), `packages/db` (SQL migrations, seed, tests) and `scripts/`. `apps/web` and `apps/admin` are built by the user in Cursor from `docs/` and `prompts/`.

**Tech Stack:** pnpm, Turborepo, Sanity Studio (current major, validated with `sanity build`), PostgreSQL 16 with `btree_gist` and `pg_cron` (Supabase), Node 20 test runner, Astro, React, Viva Smart Checkout, Resend, Cloudflare Turnstile.

**Spec:** `docs/superpowers/specs/2026-10-31-tem-protection-booking-core-design.md` (also project doc `claude/tem-protection-booking-core-spec.md`). Reference kit: project doc `nevma/music-build-kit.md`.

## Global Constraints

- English only; no NEVMA branding anywhere in the kit; the company name is TEM Protection.
- Money is integer cents, currency EUR; times are ISO 8601 with offset, stored as `timestamptz`.
- The server computes every price; no API field named `price`, `amount` or `total` is accepted from the browser.
- Hold is 20 minutes; buffer per class in `vehicle_classes.buffer_minutes`, default 30.
- Booking states: `pending`, `confirmed`, `assigned`, `completed`, `cancelled`, `expired`.
- Booking types: `transfer`, `hourly`. Hourly DEMO limits: min 3, max 12, whole hours.
- Extras code for protection: `vip-security`; booking flag `bookings.vip_security`; notes `bookings.security_notes`.
- Every DEMO row/document is labelled DEMO; `scripts/check-placeholders.mjs` fails the production build while any remain.
- Sanity document IDs use hyphens (a dot makes an ID private). Sanity holds content only; zones, prices, rates, extras, vehicles, bookings stay in Postgres.
- RLS on every table; no public access; bookings written by the web API (service role) and signed-in staff under staff-only policies.
- Viva secret exists only in `apps/web` env; the admin calls the web API (signed) for refunds.
- Studio validation: 0 errors, 0 warnings; `sanity build` succeeds.
- Lighthouse targets on public pages: LCP < 2.5 s, INP < 200 ms, CLS < 0.1.

## Review Focus

1. Pickup across a DST change (Athens, last Sunday of March/October): blocked range must be computed in real elapsed time. Test: a booking spanning 03:00 to 04:00 on the DST night blocks the right instant range (Task 3).
2. Hourly `hours` at the edges (2, 3, 12, 13, 0, negative, fractional) and transfers with `from_zone = to_zone`: reject outside limits; no price for same-zone transfers. Tests in Task 3 (constraints) and acceptance cases in Task 7 (prompt 05).
3. Add-on price or active flag changed between quote and booking: the booking must carry the price copied at creation, and an inactive `vip-security` must be rejected. Acceptance cases in Task 7 (prompt 06).
4. Refund larger than the amount still refundable, or the same refund twice: reject, and never leave `payment_status` inconsistent. DB check plus acceptance cases (Tasks 3 and 7, prompts 07 and 11).
5. Pickup in the past or inside the minimum lead time: reject with `invalid_request`; lead time is a `settings` row (DEMO 2 hours). Task 3 seeds the setting; Task 7 (prompt 06) tests it.

---

### Task 1: Monorepo skeleton, Cursor rules, placeholder check

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.env.example`, `.gitignore`, `README.md`, `AGENTS.md`
- Create: `.cursor/rules/00-project.mdc`, `10-astro.mdc`, `20-css-design.mdc`, `30-sanity.mdc`, `40-scripts-a11y.mdc`, `50-api-security-payments.mdc`, `60-testing.mdc`, `70-database.mdc`, `80-admin-app.mdc`
- Create: `scripts/check-placeholders.mjs`, `scripts/check-placeholders.test.mjs`

**Interfaces:**
- Produces: `node scripts/check-placeholders.mjs [--root <dir>]` exits 1 and prints each offender when any file under `seed/`, `apps/*/src` or `packages/db/seed` contains the marker `DEMO`; exits 0 otherwise. Used by Tasks 4 and 8.
- Produces: `.env.example` listing every variable named in `docs/ARCHITECTURE.md` (Task 5): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SANITY_PROJECT_ID`, `SANITY_DATASET`, `SANITY_READ_TOKEN`, `VIVA_CLIENT_ID`, `VIVA_CLIENT_SECRET`, `VIVA_SOURCE_CODE`, `VIVA_WEBHOOK_KEY`, `VIVA_ENV`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `PUBLIC_TURNSTILE_SITE_KEY`, `ADMIN_TO_WEB_SIGNING_SECRET`.

- [ ] **Step 1: Write the failing test** `scripts/check-placeholders.test.mjs` using `node:test`: (a) a temp tree with `seed/x.json` containing `"label":"DEMO"` makes the script exit 1 and print the path; (b) a clean tree exits 0; (c) a hit under `node_modules` is ignored.
- [ ] **Step 2: Run** `node --test "scripts/*.test.mjs"` (Node 22 needs the glob) — Expected: FAIL (script missing).
- [ ] **Step 3: Implement** `scripts/check-placeholders.mjs` (recursive scan, ignore `node_modules`, `.git`, `docs/`, `design/`).
- [ ] **Step 4: Run** `node --test scripts/` — Expected: 3 pass.
- [ ] **Step 5: Create the root files and the nine rule files.** `AGENTS.md` states the Global Constraints above verbatim and the build order of the prompts. Each rule file is under 60 lines and cites the doc it enforces.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat: kit skeleton, rules, placeholder check"`

### Task 2: Sanity Studio (`apps/studio`)

**Files:**
- Create: `apps/studio/package.json`, `sanity.config.ts`, `sanity.cli.ts`, `schemaTypes/index.ts`, `schemaTypes/siteSettings.ts`, `uiStrings.ts`, `vehicleClass.ts`, `page.ts`, `sections/` (`hero.ts`, `richText.ts`, `ctaBand.ts`, `faq.ts`), `structure.ts`
- Test: `apps/studio/schemaTypes/schema.test.ts`

**Interfaces:**
- Produces documents: `siteSettings` (singleton: company name, phone, email, address, hours, default SEO, social image), `uiStrings` (singleton: `{ key: string, value: string }[]` grouped by area `booking`, `errors`, `emails`; keys listed in `docs/CONTENT-MODEL.md`), `vehicleClass` (`key` slug matching `vehicle_classes.key`, `name`, `tagline`, `photos[]` with required alt, `copy` portable text, `specs[] {label,value}`, `seo`), `page` (`slug`, `title`, `sections[]` of the four section types, `seo`, `kind` in `home|legal`).
- Produces: `vehicleClass.key` validation: lowercase slug, unique; desk structure with singletons pinned.

- [ ] **Step 1: Write the failing test** `schema.test.ts`: all type names exist; `vehicleClass.key` rejects uppercase and spaces; every image field requires `alt`; singletons cannot be created twice.
- [ ] **Step 2: Run** `pnpm --filter studio test` — Expected: FAIL.
- [ ] **Step 3: Implement the schemas** per Interfaces; use `defineType`/`defineField`; sections are objects registered in `page.sections`.
- [ ] **Step 4: Run** `pnpm --filter studio test` — Expected: PASS.
- [ ] **Step 5: Run** `pnpm --filter studio exec sanity schema validate` and `pnpm --filter studio build` — Expected: 0 errors, 0 warnings, build succeeds.
- [ ] **Step 6: Commit** `feat: sanity studio schemas`

### Task 3: Postgres migrations and database tests (`packages/db`)

**Files:**
- Create: `packages/db/package.json`, `migrations/0001_extensions_enums.sql`, `0002_core_tables.sql`, `0003_bookings_payments.sql`, `0004_holds_settings_staff.sql`, `0005_rls.sql`, `0006_cron.sql`
- Test: `packages/db/tests/schema.test.mjs`, `tests/rls.test.mjs`

**Interfaces:**
- Consumes: schema in `docs/superpowers/specs/...-design.md` section 3 and the SQL in project doc `claude/vip-transfers-requirements.md` (Postgres schema section) as the starting point.
- Produces tables: `vehicle_classes`, `vehicles`, `zones`, `zone_routes`, `zone_prices`, `hourly_rates`, `extras`, `bookings`, `booking_extras`, `blocked_slots`, `payments`, `slot_holds`, `staff`, `settings`; enums `booking_status`, `payment_status`, `invoice_status`, `booking_type`.
- Produces on `bookings`: `booking_type`, `hours int`, `to_zone_id` and `dropoff_address` nullable, `vip_security boolean default false`, `security_notes text`, `blocked_range tstzrange`, exclusion constraint on `(vehicle_id, blocked_range)` for active statuses, check `bookings_type_fields` (transfer needs `to_zone_id`, `dropoff_address`, `hours is null`, `from_zone_id <> to_zone_id`; hourly needs `hours between 1 and 24`, `to_zone_id is null`).
- Produces: `hourly_rates` check `min_hours >= 1 and max_hours >= min_hours`; `payments` check that refund rows sum to at most the paid amount, enforced by trigger `payments_refund_limit`.
- Produces: `settings` keys `hold_minutes` (20), `min_lead_minutes` (120), `cancel_window_hours` (DEMO 24); function `expire_holds()` called by `pg_cron` every minute in `0006_cron.sql`.

Tests run against a local PostgreSQL 16 (`pg` + a temp database); if no server is available, use `@electric-sql/pglite` with `btree_gist` and skip only the `0006_cron.sql` test (pg_cron is Supabase-only).

- [ ] **Step 1: Write failing tests** in `schema.test.mjs`: (a) two overlapping `confirmed` bookings on one vehicle are rejected; (b) overlapping bookings on different vehicles are allowed; (c) `hourly` with `hours` 0, 25 or null is rejected, `hours` 3 and 12 accepted; (d) `transfer` with `from_zone_id = to_zone_id` is rejected; (e) `transfer` with `hours` set is rejected; (f) `blocked_range_for('2026-10-25T02:30:00+03:00', 180, 30)` (a 3-hour hire across the Athens DST change) spans exactly 4 real hours (3 h plus 30 min buffer each side), not a wall-clock 5; (g) a refund payment row that makes refunds exceed the paid amount is rejected, and an equal refund is accepted; (h) a duplicate `viva_transaction_id` is rejected; (i) `expire_holds()` marks a hold older than `hold_minutes` expired and leaves a fresh one.
- [ ] **Step 2: Write failing RLS tests** in `rls.test.mjs`: role `anon` cannot select from any table; role `authenticated` without a `staff` row cannot select `bookings`; a `staff` user can select and update `bookings` and update `zone_prices`.
- [ ] **Step 3: Run** `pnpm --filter db test` — Expected: FAIL.
- [ ] **Step 4: Implement the six migrations** in order; the exclusion constraint requires `btree_gist`; RLS policies check `exists (select 1 from staff where user_id = auth.uid())`.
- [ ] **Step 5: Run** `pnpm --filter db test` — Expected: all pass.
- [ ] **Step 6: Commit** `feat: database migrations and tests`

### Task 4: DEMO seeds (SQL and Sanity)

**Files:**
- Create: `packages/db/seed/demo.sql`, `seed/sanity/data.ndjson`, `seed/sanity/images/` (neutral placeholder images generated locally), `seed/README.md`
- Test: `packages/db/tests/seed.test.mjs`, `scripts/seed-validate.test.mjs`

**Interfaces:**
- Consumes: migrations (Task 3), Studio schema (Task 2), `check-placeholders` (Task 1).
- Produces SQL rows: 4 zones (`demo-airport`, `demo-centre`, `demo-port`, `demo-north`), routes and prices for 3 classes (`demo-sedan`, `demo-van`, `demo-suv`), `hourly_rates` per class (min 3, max 12), extras `night-surcharge` and `vip-security`, 2 vehicles per class, all names prefixed `DEMO`.
- Produces Sanity docs with IDs `siteSettings`, `uiStrings`, `vehicleClass-demo-sedan`, `vehicleClass-demo-van`, `vehicleClass-demo-suv`, `page-home`, `page-privacy`, `page-cookies`, `page-terms`, `page-cancellation`; every title/text marked DEMO; `vehicleClass.key` equals the SQL class keys.

- [ ] **Step 1: Write failing tests:** (a) applying `demo.sql` after the migrations succeeds and every `zones.name`, `vehicle_classes.key`, `extras.name` starts with `DEMO` or `demo-`; (b) every class key in `data.ndjson` exists in SQL and vice versa; (c) every NDJSON line is valid JSON with a hyphenated `_id`; (d) `check-placeholders.mjs` exits 1 on this seed.
- [ ] **Step 2: Run** `pnpm test` — Expected: FAIL.
- [ ] **Step 3: Write the SQL seed and the NDJSON**; run `pnpm --filter studio exec sanity dataset import --dry-run` equivalent validation against the schema (documents validate against Task 2 types).
- [ ] **Step 4: Run** `pnpm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: DEMO seeds`

### Task 5: Documentation (`docs/`)

**Files:**
- Create: `docs/ARCHITECTURE.md`, `DATA-MODEL.md`, `BOOKING-RULES.md`, `API.md`, `CONTENT-MODEL.md`, `PAGES.md`, `DECISIONS.md`, `ACCEPTANCE.md`

**Interfaces:**
- Produces: `API.md` with, per endpoint (`GET /api/vehicle-classes`, `POST /api/quote`, `POST /api/holds`, `POST /api/bookings`, `GET /api/booking-status`, `POST /api/bookings/cancel`, `POST /api/webhooks/viva`, `POST /api/internal/refund`), method, auth, request JSON, response JSON, error codes `no_price`, `unavailable`, `invalid_request`, `payment_failed`; the quote and booking requests carry `type`, zone codes or `hours`, `classKey`, `pickupAt`, `extras: string[]`, never an amount.
- Produces: `ACCEPTANCE.md` listing every test in spec section 8 plus the five Review Focus items, each with id `AC-01...`; prompts (Task 7) cite these ids.
- `DECISIONS.md` copies spec section 10; `DATA-MODEL.md` documents each migration table and constraint from Task 3 exactly; `PAGES.md` lists kit 1 routes: `/`, `/book`, `/book/pay-return`, `/booking/confirmed`, `/booking/not-completed`, `/booking/cancel/[token]`, `/privacy`, `/cookies`, `/terms`, `/cancellation`, `/404`, `/500`, and admin routes.

- [ ] **Step 1: Write the failing check** `scripts/docs-check.test.mjs`: every table in `packages/db/migrations` appears in `DATA-MODEL.md`; every `AC-` id used in `prompts/` exists in `ACCEPTANCE.md`; every env var in `.env.example` appears in `ARCHITECTURE.md`.
- [ ] **Step 2: Run** `node --test scripts/` — Expected: FAIL.
- [ ] **Step 3: Write the eight docs**; no code beyond JSON examples and SQL names; mark open client points as `PLACEHOLDER` per spec section 5.
- [ ] **Step 4: Run** `node --test scripts/` — Expected: PASS.
- [ ] **Step 5: Commit** `docs: kit documentation`

### Task 6: Design system, wireframes (`design/`, `docs/DESIGN-SYSTEM.md`)

**Files:**
- Create: `design/tokens.css`, `design/index.html`, `design/screens/*.html` (search, vehicle-choice, details, viva-handoff, confirmed, not-completed, cancel, admin-bookings, admin-prices), `docs/DESIGN-SYSTEM.md`
- Test: `scripts/contrast.test.mjs`

**Interfaces:**
- Produces CSS custom properties: `--color-bg`, `--color-surface`, `--color-text`, `--color-muted`, `--color-accent`, `--color-accent-text`, `--color-danger`, `--space-1..8`, `--radius-sm|md|lg`, `--font-display`, `--font-text`. Brand swap changes only `tokens.css`.
- Every screen file uses only these tokens, has a 390 px and 1440 px layout, and contains no brand name other than TEM Protection and no hard-coded colours.

- [ ] **Step 1: Write the failing test** `contrast.test.mjs`: every text/background token pair used in `DESIGN-SYSTEM.md` meets 4.5:1 (3:1 for large text); no hex colour appears in `design/screens/*.html`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Write tokens, screens and the doc;** screens show the transfer/by-the-hour toggle and the VIP security option in the details step.
- [ ] **Step 4: Run** — Expected: PASS. Render each screen at both widths with the pre-installed Chromium and check for horizontal overflow.
- [ ] **Step 5: Commit** `feat: design tokens and wireframes`

### Task 7: Build prompts (`prompts/`)

**Files:**
- Create: `prompts/00-how-to.md`, `01-workspace.md`, `02-sanity-studio-seed.md`, `03-design-foundation.md`, `04-database.md`, `05-pricing-availability.md`, `06-holds-booking-api.md`, `07-viva.md`, `08-emails.md`, `09-booking-ui.md`, `10-return-pages.md`, `11-admin-app.md`, `12-shell-legal-seo.md`, `13-deploy-cron-backups.md`, `14-qa.md`

**Interfaces:**
- Each prompt has fixed headings: Goal, Read first (doc paths), Files to create, Tests first (AC ids), Steps, Done when. A prompt only depends on earlier prompts.
- Prompt 05 pins the exported signatures: `quoteTransfer(input): Quote`, `quoteHourly(input): Quote`, `computeBlockedRange(input): { start: Date, end: Date }`, `availableVehicles(input): Vehicle[]`, all pure and in `apps/web/src/lib/booking/`; covers Review Focus 1, 2 and 5 as AC ids.
- Prompt 06 covers Review Focus 3 (price copied at creation, inactive `vip-security` rejected, lead time); prompt 07 and 11 cover Review Focus 4 (refund limits, duplicate refund).
- Prompt 14 requires one real payment and one real refund in the review week.

- [ ] **Step 1: Write the failing check** `scripts/prompts-check.test.mjs`: 15 prompt files exist with the fixed headings; every referenced doc path and `AC-` id exists; every spec section 7 prompt number maps to a file.
- [ ] **Step 2: Run** `node --test scripts/` — Expected: FAIL.
- [ ] **Step 3: Write the prompts** in order 00 to 14.
- [ ] **Step 4: Run** `node --test scripts/` — Expected: PASS.
- [ ] **Step 5: Commit** `docs: build prompts`

### Task 8: Verify, package and record

**Files:**
- Create: `dist/tem-protection-build-kit.zip`, project doc `claude/tem-build-kit.md`
- Modify: project doc `claude/nevma-decisions-log.md` (new section 2026-10-31), `claude/nevma-open-questions.md` if client questions change

- [ ] **Step 1: Run the full suite** `pnpm install && pnpm test && pnpm --filter studio build && node scripts/check-placeholders.mjs` — Expected: tests pass; the placeholder check exits 1 only because of DEMO seed data (confirm the offender list is exactly the seeds).
- [ ] **Step 2: Spec coverage walk:** for each spec section 1 to 10, record the file that implements it in `docs/COVERAGE.md`; fix any gap.
- [ ] **Step 3: Zip** the kit without `node_modules`; unzip into a clean directory and re-run Step 1 there.
- [ ] **Step 4: Write** `claude/tem-build-kit.md` (contents, how to use, versions, open items) to the project; read the decisions log, add a section "2026-10-31 — TEM Protection booking kit" with the eight spec decisions (spec section 10, status Decided; hourly-hire billing and the standalone-admin hours marked Open), and write the full log back.
- [ ] **Step 5: Deliver** the zip with SendUserFile and summarize the open client inputs (6 Nov, 27 Nov, 4 Dec).
- [ ] **Step 6: Commit** `chore: package kit 1`
