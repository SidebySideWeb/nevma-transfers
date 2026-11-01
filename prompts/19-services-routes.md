# 19 — Services and route pages, booking prefill

> **Superseded for the look (1 Nov 2026).** The website must be an exact port of `design/v2/build`. If you have not run this prompt yet, run `v2-exact/` V2-5 instead for every visual part, and take only the behaviour, data and test steps from here. If you already ran it, `v2-exact/` replaces its markup and styles.

Needs: 16, 17. Produces: `/services`, one page per route, and `/book` prefilled from query parameters. ~1 day.

--- PROMPT ---

Design target: the V2 pages for these routes listed in `docs/DESIGN-V2.md` (in `design/v2/pages/`, screenshots in `design/v2/screenshots/`), built with the components from prompt 30; the older `design/screens/` wireframes only show structure and string keys.

Read `AGENTS.md`, `docs/PAGES.md` (kit 2: `/services`, `/routes/[slug]`, booking prefill), `docs/ACCEPTANCE.md` (AC-25, AC-26, AC-32, AC-33) and open `design/screens/services.html` and `route.html` first.

1. `src/pages/services.astro`: renders `page-services` sections.
2. `src/pages/routes/[slug].astro` with `getStaticPaths` from `getPublishableRoutes()` (unknown pairs are already excluded, AC-32):
   - breadcrumbs Home / Services / <route title>;
   - photo, intro, facts: `site.duration` from `zone_routes.duration_minutes`;
   - price table (`site.pricesForRoute`): one row per publishable class with capacity and `priceLabel(cents)`; a null price shows `site.noOnlinePrice` and a link `site.requestQuote` → `/request-a-transfer?from=<from>&to=<to>&class=<key>`;
   - body (Portable Text), FAQ (native `<details>`);
   - `site.bookRoute` → `/book?from=<from>&to=<to>`;
   - SEO: title "<route title> transfer · Elite Protection" unless `seo.title` is set; JSON-LD `Service` with one `Offer` per priced class (only when prices are shown), `FAQPage`, `BreadcrumbList`.
3. Booking prefill (kit 1 island): `/book` reads `from`, `to`, `class`, `type=hourly` from the query string on load, validates them against `/api/booking-options` (unknown values are ignored silently), fills the search step and, when `class` is given, pre-selects that class once the quote arrives (the customer still presses Select: no hold is created automatically). Add `site.*` keys only if a new label is needed (add it to `uiStringDefaults.ts` and the Studio seed with a test).
4. Kit 1's no-price block in the booking flow gains a `site.requestQuote` link → `/request-a-transfer?from=&to=&class=` with the current search.
5. Sitemap: services and every route page.

Tests:
- Vitest: query-string parsing ignores unknown or malformed values; no request is sent with a price field.
- Playwright: AC-26 from `/routes/athens-airport-to-piraeus-port`, "Book this route" opens `/book` with Airport → Port filled; from `/routes/northern-suburbs-to-piraeus-port` the van row shows "Price on request" and its link opens the request form prefilled (prompt 22 completes the form; until then assert the URL).
- AC-25: route table prices equal `catalog.ts`.
- AC-33: axe clean; unique titles; canonical; sitemap; JSON-LD parses.

Check (run and report pass/fail):
- Tests pass; pages match the wireframes; the kit 1 booking tests still pass.

Commit: `feat(site): services, route pages and booking prefill`
