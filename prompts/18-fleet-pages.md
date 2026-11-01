# 18 — Fleet pages: `/fleet` and `/fleet/[key]`

> **Superseded for the look (1 Nov 2026).** The website must be an exact port of `design/v2/build`. If you have not run this prompt yet, run `v2-exact/` V2-4 instead for every visual part, and take only the behaviour, data and test steps from here. If you already ran it, `v2-exact/` replaces its markup and styles.

Needs: 16, 17. Produces: the fleet overview and one page per vehicle class. ~0.5 day.

--- PROMPT ---

Design target: the V2 pages for these routes listed in `docs/DESIGN-V2.md` (in `design/v2/pages/`, screenshots in `design/v2/screenshots/`), built with the components from prompt 30; the older `design/screens/` wireframes only show structure and string keys.

Read `AGENTS.md`, `docs/PAGES.md` (kit 2: `/fleet`, `/fleet/[key]`), `docs/ACCEPTANCE.md` (AC-25, AC-33) and open `design/screens/fleet.html` and `vehicle.html` at 390 px and 1440 px first.

1. `src/pages/fleet/index.astro`: renders `page-fleet` sections (the `vehicleClassList` section produces the cards), with breadcrumbs Home / Fleet.
2. `src/pages/fleet/[key].astro` with `getStaticPaths` from `getPublishableClasses()`:
   - title and gallery from `vehicleClass` (first photo large, up to two more; `@sanity/image-url` with `srcset`, explicit sizes, alt text from Sanity, first image `fetchpriority="high"`);
   - facts (capacity from Postgres `max_passengers`, `max_luggage` with `booking.vehicle.capacity`; specs from Sanity);
   - `priceLabel(fromPriceForClass)` and `priceLabel(hourlyFromForClass, { perHour: true })`;
   - "Popular routes in this vehicle": publishable featured routes that have a price for this class, with the price, linking to `/routes/<slug>`;
   - buttons: Book now → `/book?class=<key>`; `site.requestQuote` → `/request-a-transfer?class=<key>`;
   - SEO: title "<name> · Elite Protection", description from `seo` or tagline; JSON-LD `Service` (`provider` = Organization, `areaServed` = Athens, `offers.lowPrice` and `priceCurrency` EUR only when prices are shown) and `BreadcrumbList`.
3. Add both routes to the sitemap.

Tests:
- Playwright: AC-25 the fleet cards show the same "From" values as `catalog.ts` for the DEMO seed; with `showFromPrices` false (set in a test fixture or env override for the build) every card shows `site.noOnlinePrice`.
- AC-33: axe clean on `/fleet` and `/fleet/demo-e-class`; titles unique; canonical correct; both in `sitemap.xml`; JSON-LD parses.

Check (run and report pass/fail):
- Tests pass; pages match the wireframes at 390 px and 1440 px; Lighthouse mobile on `/fleet`: LCP < 2.5 s, CLS < 0.1 (report the numbers).

Commit: `feat(site): fleet pages`
