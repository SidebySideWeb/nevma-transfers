# Fleet and setup management (admin)

Decided by the user on 1 Nov 2026: the office adds and edits vehicle classes, vehicles, zones, routes, prices and extras in the admin, without a developer. Database guards: migration `0012_setup_guards.sql` (tests `packages/db/tests/setup.test.mjs`). Design: `design/admin/fleet.html`, `fleet-class.html`, `setup-dialogs.html`, `zones.html`, `extras.html`, `prices.html`, `hourly-rates.html`.

## Where each thing lives

| Thing | Where | Edited by |
| --- | --- | --- |
| Vehicle class, booking side: key, internal name, max passengers, max suitcases, buffer, order, online | Postgres `vehicle_classes` | Admin → Fleet |
| Vehicle class, website side: public name, photos, description, features, SEO | Sanity `vehicleClass` (same `key`) | Sanity Studio |
| Vehicles: label, class, model/colour/plate (staff only), status (active, maintenance, retired) | Postgres `vehicles` | Admin → Fleet |
| Zones (code, name, what customers see, order, on/off), routes and durations | Postgres `zones`, `zone_routes` | Admin → Zones, Zone prices |
| Zone prices, hourly rates | Postgres | Admin → Zone prices, Hourly rates |
| Extras: code, price, on/off | Postgres `extras` | Admin → Extras |
| Extras: customer-facing name and hint | Sanity UI strings | Sanity Studio |
| Route pages (kit 2) | Sanity `route` (zone codes) | Sanity Studio |

Customers book a **class**, never a specific vehicle; vehicles exist for capacity, assignment and the calendar.

## Screens

- `/fleet`: classes table (with "No Sanity page" flag) and vehicles table; **Add class**, **Add vehicle**; class name → `/fleet/[key]`; vehicle label → Edit vehicle dialog.
- `/fleet/[key]` (`fleet-class.html`): booking details form; vehicles in the class with future-booking counts; Website content panel (Sanity document found or missing, photo count, last edit, **Open in Sanity Studio** link to the document with that key or to a new one with the key prefilled); Prices panel with links; **Ready for customers?** checklist: at least one active vehicle, zone prices or an hourly rate, a Sanity page with at least one photo, online. An online class that misses an item shows it in red here and in the top banner.
- Dialogs (`setup-dialogs.html`): Add class (starts offline), Add vehicle (shows bookings of that class waiting for a vehicle), Edit vehicle, Add zone, Add extra, Delete (only for things never used).
- `/zones`: add, rename, reorder, switch off; routes and durations stay on Zone prices.

## Rules (enforced by the database, shown by the admin as given)

1. Class keys, zone codes and extra codes are lower-case letters, numbers and hyphens. Once used (by vehicles, prices, rates, routes or bookings) they cannot change: `in_use: …`. The admin shows the key read-only with "Fixed once used".
2. Classes, vehicles and zones with history are switched off or retired, never deleted: `in_use: … switch it offline instead`. Things never used can be deleted (confirmation dialog).
3. A vehicle cannot go to maintenance or retired, or change class, while it has future confirmed or assigned bookings: `has_future_bookings: SEDAN-1 has 3 future booking(s)…`. The dialog links to the calendar. For a few hours off, use **Block a vehicle**.
4. Vehicle labels are unique (case-insensitive).
5. The built-in extras `vip-security` and `night-surcharge` can be priced and switched off, never deleted or renamed.
6. Switching a class or zone off hides it from new bookings only; existing bookings are kept.
7. A new class starts offline. Order of work: add class → add vehicles → prices / hourly rate → Sanity page with photos → switch online → (kit 2) **Update the website** so fleet pages show it.
8. Every change writes through the signed-in staff session (RLS 0005); no service role in the admin.
