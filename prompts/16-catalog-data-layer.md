# 16 — Build-time catalog: zones, routes and "From" prices

Needs: 15. Produces: one server module that reads the booking catalog from Postgres at build time and joins it with Sanity, used by every kit 2 page. ~0.5 day.

--- PROMPT ---

Design target: the V2 pages for these routes listed in `docs/DESIGN-V2.md` (in `design/v2/pages/`, screenshots in `design/v2/screenshots/`), built with the components from prompt 30; the older `design/screens/` wireframes only show structure and string keys.

Read `AGENTS.md`, `docs/ARCHITECTURE.md` §10, `docs/DATA-MODEL.md` (reference data), `docs/PAGES.md` (kit 2) and `docs/ACCEPTANCE.md` (AC-25, AC-32) first. Tests first, against the local Supabase with the DEMO seed (`packages/db/seed/demo.sql`).

1. `apps/web/src/lib/server/catalog.ts` (server/build only, service role via `getServiceClient()`), loaded **once per build** and memoised:
   - `getCatalog(): Promise<Catalog>` with `zones` (code, name, sortOrder; active only), `routes` (fromCode, toCode, durationMinutes), `prices` (fromCode, toCode, classKey, cents), `hourly` (classKey, cents, minHours, maxHours), `classes` (key, maxPassengers, maxLuggage, sortOrder; active only).
   - `fromPriceForRoute(cat, from, to): { classKey; cents }[]` sorted by class `sortOrder`; classes without a price are present with `cents: null`.
   - `lowestRoutePrice(cat, from, to): number | null`.
   - `fromPriceForClass(cat, classKey): number | null` — the lowest transfer price of that class over all routes.
   - `hourlyFromForClass(cat, classKey): number | null`.
   - `routeExists(cat, from, to): boolean`; `durationFor(cat, from, to): number | null`.
2. `apps/web/src/lib/content/routes.ts`: `getPublishableRoutes()` joins Sanity routes with the catalog; a route whose zone codes or zone pair do not exist is **left out** and logged once as a build warning `[routes] skipped <slug>: unknown zone pair <from> -> <to>` (AC-32).
3. `apps/web/src/lib/content/vehicles.ts`: `getPublishableClasses()` = active Postgres classes with a Sanity `vehicleClass` document, in `sortOrder`; others logged (already done in kit 1 for the booking flow: reuse that code, do not duplicate it).
4. `apps/web/src/lib/content/price-label.ts`: `priceLabel(cents: number | null, opts: { show: boolean; perHour?: boolean }): { text: string; isPrice: boolean }` → `t('site.fromPrice', { price: formatEuro(cents) })`, `t('site.perHour', ...)`, or `t('site.noOnlinePrice')` when `show` is false or `cents` is null.

Tests (names start with the AC id):
- AC-25: with the DEMO seed, `fromPriceForRoute('demo-airport','demo-centre')` returns five classes with the seeded cents; `fromPriceForRoute('demo-north','demo-port')` has `demo-v-class` with `cents: null`; `fromPriceForClass('demo-e-class')` equals the minimum sedan price in SQL (compute it in the test with SQL, do not hard-code); `priceLabel(null, { show: true })` and `priceLabel(7000, { show: false })` both give `site.noOnlinePrice`.
- AC-32: a Sanity route fixture with `fromZone: 'demo-mars'` is skipped and logged once.
- The catalog is fetched once per build (spy on the client).

Check (run and report pass/fail):
- Tests pass; `lib/server/catalog.ts` cannot be imported from client code (the guard from prompt 04 covers it).
- `pnpm build` logs no route warning with the DEMO seed (all 4 seeded routes exist).

Commit: `feat(content): build-time catalog and From prices`
