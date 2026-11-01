# V2-4 — Fleet and vehicle pages, exact

Needs: V2-3. Produces: `/fleet` = `02-fleet`, `/fleet/[key]` = `03-vehicle`. ~1 day.

--- PROMPT ---

Read `docs/DESIGN-V2.md`, `docs/DESIGN-V2-BLOCKS.md`. Open `design/v2/build/02-fleet.html`, `03-vehicle.html` at 1440 and 390 px, their files in `design/v2/build/blocks/02-fleet/` and `03-vehicle/`, and `design/v2/pages/02-fleet.html` / `03-vehicle.html` to try the filters, tabs and gallery. Port the markup exactly (see "The rule"); content from Sanity, prices from the API.

1. `/fleet` (`designPage="02-fleet"`) renders the `fleet` page's sections:
   - `PageHero` (layout `page`).
   - `FleetBrowser`:
     - Filters All / Vans / Saloons with counts, from `vehicleClass.group`. They are buttons with `aria-pressed` and keep the design's look for the selected state. Filtering hides cards without a page reload.
     - The note beside the filters.
     - One card per publishable class: photo, kind, "Mercedes-Benz", name, seats, luggage, airport price and hourly price (`hourlyLabel` with `{hours}`). "Details" goes to `/fleet/<key>`; "Book" goes to `/book?class=<key>`.
   - `GalleryMosaic`: tiles with the design's span classes for `size`, and a caption on each tile.
   - `PriceTable`:
     - One row per class: name, kind, seats, luggage, airport price, hourly price and minimum hours.
     - Column labels from the section.
     - The notes are portable text, with bold as `<strong>`.
     - At 390 px the table behaves as in the design: look at the phone screenshot and at the markup.
   - `IncludedList`: the items with dashes, the add-on box with its photo, and the link.
2. `/fleet/[key]` (`designPage="03-vehicle"`):
   - `SiteHeader` in its own section, as `03-vehicle/01-siteHeader.html`.
   - `VehicleTabs`: the breadcrumb ("Fleet / Mercedes-Benz V-Class") and a tab per class, linking to `/fleet/<key>` with `aria-current`.
   - `VehicleHero`:
     - Gallery from `vehicleClass.photos`: previous/next buttons (`site.vehicle.prev`/`next`), the counter `site.vehicle.photoCount`, arrow keys and swipe. Preload only the first photo.
     - Kind, "Mercedes-Benz", name and blurb.
     - Seats\* and Luggage\*. Airport price and hourly price with `site.vehicle.airport` / `site.vehicle.hourly`, the note `site.vehicle.note`.
     - "Book the {name}" goes to `/book?class=<key>`. "Call {phone}" uses a `tel:` link.
   - Then the sections of the `vehicle` template page (`OnBoard` layout `grid` and `CtaPanel` layout `escort`).
   - `Product`/`Service` JSON-LD and the breadcrumb JSON-LD stay as built in kit 2.

Tests:
- Vitest: the filter counts and the hidden state; the gallery index wraps and the keyboard works; classes that are not publishable return 404 on `/fleet/[key]`.

Check (run and report pass/fail):
- `v2-fidelity.spec.ts` passes for `/fleet` and `/fleet/v-class` at 1440 and 390 px. Paste the per-block table.
- axe is clean; no horizontal scroll at 390 px; Lighthouse mobile performance ≥ 90 on `/fleet`.
- `pnpm test`, `pnpm lint`, `pnpm typecheck` pass.

Commit: `feat(web): fleet and vehicle pages in the exact V2 design`
