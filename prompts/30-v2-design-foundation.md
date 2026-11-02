# 30 — Website in the Elite Protection V2 design: foundation and kit 1 pages

> **Superseded for the look (1 Nov 2026).** The website must be an exact port of `design/v2/build`. If you have not run this prompt yet, run `v2-exact/` V2-2, V2-3 and V2-6 instead for every visual part, and take only the behaviour, data and test steps from here. If you already ran it, `v2-exact/` replaces its markup and styles.

Needs: kit 1 prompts 03, 09, 10, 12 (the public pages exist in the neutral look) and prompt 15 (Studio and seed with the V2 fleet and photos). Run it before the kit 2 page prompts 16–20 and 22, which build on its components. Produces: V2 fonts, base styles, header, footer and shared components, and the kit 1 public pages (home, booking flow, return pages, legal, 404/500) restyled to the V2 design. ~3 days.

--- PROMPT ---

Read `AGENTS.md`, `docs/DESIGN-V2.md` (all of it), `docs/DESIGN-SYSTEM.md`, `docs/BOOKING-RULES.md` §2 (final prices and VAT), `.cursor/rules/40-scripts-a11y.mdc`, and open `design/v2/index.html`, `design/v2/pages/01-home.html`, `design/v2/pages/08-book.html` (click through all four steps), `design/v2/pages/09-thank-you.html`, `design/v2/pages/10-payment-failed.html`, `design/v2/pages/11-hold-expired.html`, `design/v2/pages/17-legal.html` and `design/v2/extra/08b-book-hourly.jpg` first. Compare with `design/v2/screenshots/*.jpg` at 1440 and 390 px. The preview pages are the visual target, not code: build Astro components with tokens; keep every existing behaviour, API call, string key and test. Tests first where behaviour changes.

1. Tokens and fonts: copy `design/tokens.css` again to `apps/web/src/styles/tokens.css` (the tokens test must pass). Self-host the woff2 files from `design/v2/pages/assets/fonts/` in `apps/web/public/fonts/` (Jost 300/400/500/600, Playfair Display 500/600 and italics) with `@font-face` and `font-display: swap`; preload Jost 400 and Playfair 500; remove the old fonts.
2. Logo: copy `design/v2/pages/images/logo-white.png` to `apps/web/public/logo-white.png` (header and footer, with `alt="Elite Protection"`; ask me later for an SVG). `siteSettings.mobilePhone` is new in the Studio schema: show both phones in the footer and on Contact.
3. Base styles and components in `apps/web/src/components/` from `docs/DESIGN-V2.md` "Building blocks": Header (nav Fleet, Services, VIP Security, About, Contact; phone; Book; mobile menu as a disclosure with focus management), Footer (three columns as the design, "All prices include VAT"), Button (gold, line), Eyebrow, Display heading with italic gold accent, Field (underline style), ZoneSelect (brand dropdown: select-only combobox, `aria-activedescendant`, arrows, Home/End, type-ahead, Enter/Space, Escape; hidden native select for no-JS) with the swap button, Stepper, TripTypeSwitch, VehicleCard, SummaryCard, StepIndicator, HoldTimer, VipSwitch, InvoiceBlock, Notice, Faq. Tokens only; motion as in the design with `prefers-reduced-motion` respected.
4. Home `/` as `01-home`: hero with the photo from Sanity, quick-booking widget (TripTypeSwitch, ZoneSelect from/to with swap or hours, date, time, passengers → `/book` with the query string), the four promises, the two divisions, fleet teaser, CTA. Text from Sanity and `uiStrings` (add missing keys to the defaults and the seed, area `site`).
5. Booking flow `/book` as `08-book` + `extra/08b-book-hourly`: four steps with the step indicator; journey step with TripTypeSwitch (Transfer: zones + swap; By the hour: zone + hours stepper with the class min/max); vehicle step with photo rows and final prices; details step with VIP switch and invoice block; review and pay with the price analysis (`booking.review.*`: items, price before VAT, VAT, total) only if prompt 27 is done, otherwise items and total; sticky SummaryCard with "Final price, VAT included"; "HELD FOR" timer; "Taking you to Viva" as a short interstitial before the redirect. No "excl. VAT" anywhere.
6. Return and state pages: `/booking/confirmed` as `09-thank-you` (keep polling the status), `/booking/not-completed` as `10-payment-failed`, hold expired state as `11-hold-expired`, legal pages as `17-legal`, `/404` and `/500` in the `10-payment-failed` layout.
7. `src/pages/dev/kitchen-sink.astro`: every component state, for visual review.

Tests:
- Existing web tests pass (strings, tokens, booking flow, AC-01 … AC-17 Playwright).
- Vitest: ZoneSelect keyboard behaviour and hidden select value; Stepper bounds (hours min/max per class); TripTypeSwitch changes the fields and the query string.
- Playwright: complete a transfer and an hourly booking in Viva demo mode through the V2 pages; `grep` the built HTML for "excl." and "exclusive of" finds nothing; axe (serious, critical) on `/`, `/book` (each step), `/booking/confirmed`, `/booking/not-completed`, `/privacy`, `/404` at 390, 1024 and 1440 px with no horizontal page overflow.

Check (run and report pass/fail):
- Screenshots of `/` and each booking step at 1440 and 390 px next to `design/v2/screenshots/01-home.jpg`, `08-book.jpg` and `phone-*.jpg`: same layout, type, colours and spacing.
- Lighthouse mobile performance ≥ 90 on `/` and `/book`; images served through `astro:assets` with sizes; no request to Google Fonts.
- `pnpm test`, `pnpm lint`, `pnpm typecheck` pass.

Commit: `feat(web): Elite Protection V2 design foundation and kit 1 pages`
