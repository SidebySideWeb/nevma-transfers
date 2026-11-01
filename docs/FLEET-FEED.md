# Fleet and pricing feed

`data/fleet-feed.json` (made by the user on 1 Nov 2026) is one file that describes the fleet and prices for both sides of the system:

- **Postgres** (admin, availability, prices, booking): vehicle classes, vehicles, zones, routes and durations, zone prices, hourly rates, extras, a few settings. Importer: `packages/db/scripts/import-fleet-feed.mjs`.
- **Sanity** (website content): one `vehicleClass` document per class with name, full name, type, group, on-board amenities, description, specs, SEO and photos from `data/fleet-images/`. Importer: `apps/studio/scripts/import-fleet-feed.mjs`.

Both are joined by the class `key` (for example `v-class`). Both importers share `packages/db/scripts/fleet-feed-lib.mjs` (validation and conversion), tested by `scripts/fleet-feed.test.mjs`, `packages/db/tests/feed.test.mjs` and `apps/studio/schemaTypes/feedImport.test.ts`.

## How the feed is read

| Feed | Database or Sanity | Rule |
| --- | --- | --- |
| `settings.prices_include_vat: false` + `vat_rate_percent` | all prices | Prices in the feed are before VAT. The database stores final prices (what the customer pays): `round(cents × (100 + rate) / 100)`, so 18000 → 22320 (€180 → €223.20). If a later feed has `prices_include_vat: true`, prices are stored as they are. |
| `settings.vat_rate_percent` | `settings.vat_rate_bp` (2400) | only when migration 0010 exists |
| `settings.hold_minutes`, `min_lead_minutes` | `settings` | value and `is_demo` |
| `settings.refund_window_hours` | `settings.cancel_window_hours` | online cancellation window |
| `settings.default_buffer_minutes`, `hourly_max_hours` | — | informational; each class and hourly rate carries its own |
| `settings.booking_reference_format` | — | ignored: references are `EP-XXXXXX` (migration 0009) |
| `vehicle_classes[].operations` | `vehicle_classes` (key, internal name = `content.name`, capacity, luggage, buffer, `sort_order × 10`, active, `is_demo`) | upsert by key |
| `vehicle_classes[].content` | Sanity `vehicleClass` (`name` = short name, `fullName`, `tagline` = kind label, `group`, `amenities`, `copy` = blurb, specs, SEO, photos hero first) | "TEM Protection" in SEO text becomes Elite Protection |
| `vehicles[]` | `vehicles` (label, class, plate, status, `is_demo`) | upsert by label (case-insensitive) |
| `zones[]` | `zones` (code, name, `kind` = type, `sort_order × 10`, active, `is_demo`) | upsert by code |
| `zone_routes[]` with `bidirectional` | `zone_routes`, both directions | upsert |
| `zone_prices[]` with `bidirectional` | `zone_prices`, both directions, final cents | upsert; the feed is the full price list for its classes and zones, so a price missing from the feed is removed (no online price, "Request a quote") |
| `hourly_rates[]` | `hourly_rates`, final cents | upsert |
| `extras[]` | `extras` (name, final price, active, `applies_to`, `max_quantity`, `is_demo`) | upsert by code |
| `demo: true` on any row | `is_demo` column (migration 0014) | the admin shows a DEMO badge; `demo_rows` lists what still blocks launch |

## What the import never does

- It never changes or deletes bookings, payments or customers; existing bookings keep the prices they were sold at.
- It never deletes classes, zones, vehicles or extras: anything not in the feed is switched offline (classes, zones, extras) or left as it is (vehicles; `--retire-missing-vehicles` retires those without future bookings). The guards of migration 0012 still apply.
- In Sanity it only sets the fields listed above; other fields an editor filled stay. It never deletes documents (the website shows only classes that are online in the admin).

## Running it

1. Dry run first, always: both importers show what they would change and write nothing.
2. `--apply` writes. The database import is one transaction: all or nothing. Running it again with the same feed changes nothing.
3. Order: database first, then Sanity, then (kit 2) "Update the website".

## Before launch

`demo: true` rows are placeholders. After the client confirms a value, set `demo: false` in the feed and import again; `scripts/check-live-demo.mjs` fails a production build while `demo_rows` shows any active DEMO row.
